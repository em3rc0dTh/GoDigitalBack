import { GoogleGenerativeAI } from "@google/generative-ai";
const { PDFParse } = require("pdf-parse");
import { getTransactionRawPDFModel } from "../models/tenant/TransactionRawPDF";
import { getAccountModel } from "../models/tenant/Account";
import getTenantDetailModel from "../models/system/TenantDetail";
import { getTenantDB } from "../config/tenantDb";
import { findAccountByPartialNumber } from "./accountMatch";
import mongoose from "mongoose";
import { recoService } from "./reco";

export class StatementService {
    private genAI: GoogleGenerativeAI;
    private lastRequestTime: number = 0;
    private readonly MIN_REQUEST_INTERVAL = 4000; // 4 segundos para estar 100% seguros con el Free Tier
    
    // Cola de ejecución global para asegurar que NUNCA se envíen dos peticiones simultáneas
    private static processingQueue: Promise<any> = Promise.resolve();

    private fallbackModels = [
        "gemini-1.5-flash",
        "gemini-3.1-flash-lite",
        "gemini-2.5-flash-lite",
        "gemini-3-flash",
        "gemini-2.0-flash"
    ];
    private currentModelIndex = 0;

    constructor() {
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
    }

    // Control de rate limiting mejorado
    private async waitForRateLimit() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;

        if (timeSinceLastRequest < this.MIN_REQUEST_INTERVAL) {
            const waitTime = this.MIN_REQUEST_INTERVAL - timeSinceLastRequest;
            console.log(`[RateLimit] Esperando ${waitTime}ms para cumplir el intervalo de seguridad...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        this.lastRequestTime = Date.now();
    }

    /**
     * Asegura que la función se ejecute de forma serializada (uno por uno)
     */
    private async runSerialized<T>(task: () => Promise<T>): Promise<T> {
        const previousTask = StatementService.processingQueue;
        
        // Creamos la nueva tarea que espera a la anterior
        const currentTask = (async () => {
            try {
                await previousTask;
            } catch (err) {
                // Ignoramos errores de la tarea anterior para no romper la cola
            }
            return await task();
        })();

        // Actualizamos la cola global
        StatementService.processingQueue = currentTask;
        return currentTask;
    }

    async processPdfStatement(
        fileBuffer: Buffer,
        fileName: string,
        entityId: string,
        tenantId: string
    ) {
        // 1. Extract Text from PDF
        let textContent = "";
        try {
            const parser = new PDFParse({ data: fileBuffer });
            const data = await parser.getText();
            textContent = data.text;
        } catch (err: any) {
            console.error("Error parsing PDF:", err);
            throw new Error("Failed to extract text from PDF");
        }

        // Check if file already exists in DB
        const TransactionRawPDF = await getTransactionRawPDFModel(tenantId, entityId);
        const existingDocs = await TransactionRawPDF.find({
            fileName: fileName,
            "routing.entityId": new mongoose.Types.ObjectId(entityId)
        });

        if (existingDocs.length > 0) {
            console.log(`File ${fileName} already processed.`);
            return { transactions: existingDocs, isDuplicate: true };
        }

        if (!textContent || textContent.trim().length === 0) {
            throw new Error("PDF content is empty or unreadable");
        }

        // 2. Dividir el texto en chunks grandes (Gemini aguanta hasta 1M tokens)
        const chunks = this.splitTextIntoChunks(textContent, 60000); 
        console.log(`PDF dividido en ${chunks.length} chunks para procesamiento serializado`);

        let allTransactions: any[] = [];
        let accountNumber: string | null = null;

        // 3. Procesar chunks serializadamente (usando la cola global)
        for (let i = 0; i < chunks.length; i++) {
            console.log(`Procesando chunk ${i + 1}/${chunks.length}...`);

            const extractedData = await this.runSerialized(async () => {
                await this.waitForRateLimit();
                return await this.extractTransactionsWithAI(
                    chunks[i],
                    i === 0
                );
            });

            if (extractedData && Array.isArray(extractedData.transactions)) {
                allTransactions = allTransactions.concat(extractedData.transactions);
                if (i === 0 && extractedData.accountNumber) {
                    accountNumber = extractedData.accountNumber;
                }
            }
        }

        if (allTransactions.length === 0) {
            throw new Error("AI failed to extract valid transactions");
        }

        // 3.5 Validate Accounts
        try {
            const tenantDB = await getTenantDB(tenantId, entityId);
            for (const tx of allTransactions) {
                if (tx.source_account) {
                    const match = await findAccountByPartialNumber(tenantDB, tx.source_account);
                    if (match) tx.source_account = match.account_number;
                }
                if (tx.destination_account) {
                    const match = await findAccountByPartialNumber(tenantDB, tx.destination_account);
                    if (match) tx.destination_account = match.account_number;
                }
            }
        } catch (err) {
            console.error("⚠️ Error validating statement accounts:", err);
        }

        // 4. Save to Database
        const savedTransactions = await this.saveTransactions(
            allTransactions,
            fileName,
            entityId,
            tenantId,
            accountNumber
        );

        return { transactions: savedTransactions, isDuplicate: false };
    }

    private splitTextIntoChunks(text: string, chunkSize: number = 60000): string[] {
        const chunks: string[] = [];
        const lines = text.split('\n');
        let currentChunk = '';

        for (const line of lines) {
            if ((currentChunk + line).length > chunkSize && currentChunk.length > 0) {
                chunks.push(currentChunk.trim());
                currentChunk = line + '\n';
            } else {
                currentChunk += line + '\n';
            }
        }
        if (currentChunk.trim().length > 0) chunks.push(currentChunk.trim());
        return chunks;
    }

    private async extractTransactionsWithAI(
        text: string,
        includeAccountNumber: boolean = false,
        retriesLeft: number = 3
    ): Promise<any> {
        const accountNumberInstruction = includeAccountNumber
            ? '"accountNumber": "extracted account number or null",'
            : '';

        const prompt = `
You are a specialized banking assistant. Analyze the text and return ONLY JSON.
{
  ${accountNumberInstruction}
  "transactions": [
    {
      "fecha_hora_raw": "string",
      "operation_date": "DD/MM/YYYY",
      "amount": number,
      "movement": "string",
      "balance": number,
      "currency": "ISO code",
      "source_account": "string",
      "destination_account": "string"
    }
  ]
}
BANK TEXT:
"""
${text}
"""
`;

        const tryWithModel = async (modelName: string, retries: number, modelsTried: number = 0): Promise<any> => {
            if (modelsTried >= this.fallbackModels.length) {
                throw new Error("Cuota diaria agotada en TODOS los modelos de respaldo. Usa una API Key de pago.");
            }

            try {
                console.log(`[AI] Intentando extraer datos usando el modelo: ${modelName}`);
                const model = this.genAI.getGenerativeModel({
                    model: modelName,
                    generationConfig: { responseMimeType: "application/json" }
                });

                const result = await model.generateContent(prompt);
                const content = result.response.text();

                if (!content) throw new Error("No content from Gemini");

                let parsed = JSON.parse(content);
                let transactions = Array.isArray(parsed.transactions) ? parsed.transactions : [];

                // Deduplicar
                const uniqueTransactions: any[] = [];
                const seenTransactions = new Set();
                for (const tx of transactions) {
                    const txHash = `${tx.operation_date}|${tx.amount}|${tx.movement}|${tx.balance}`;
                    if (!seenTransactions.has(txHash)) {
                        seenTransactions.add(txHash);
                        uniqueTransactions.push(tx);
                    }
                }

                return {
                    accountNumber: parsed.accountNumber ?? null,
                    transactions: uniqueTransactions
                };

            } catch (err: any) {
                console.error(`[AI Error en ${modelName}]:`, err.message);

                if (err?.message?.includes("429") || err?.status === 429) {
                    // Detección de Cuota Diaria (Quota exceeded)
                    if (err?.message?.includes("Quota") && !err?.message?.includes("minute")) {
                        console.warn(`[Cuota Diaria] ${modelName} agotado. Saltando al siguiente modelo...`);
                        this.currentModelIndex = (this.currentModelIndex + 1) % this.fallbackModels.length;
                        return await tryWithModel(this.fallbackModels[this.currentModelIndex], 3, modelsTried + 1);
                    }

                    // Detección de Límite por Minuto (RPM)
                    if (retries > 0) {
                        const delay = [40000, 20000, 10000][retries - 1] || 15000;
                        console.warn(`[RPM Limit] ${modelName} ocupado. Esperando ${delay/1000}s...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        return await tryWithModel(modelName, retries - 1, modelsTried);
                    } else {
                        // Si nos quedamos sin reintentos de RPM, mejor probar con otro modelo
                        console.warn(`[RPM Agotado] No se pudo con ${modelName} tras reintentos. Saltando al siguiente...`);
                        this.currentModelIndex = (this.currentModelIndex + 1) % this.fallbackModels.length;
                        return await tryWithModel(this.fallbackModels[this.currentModelIndex], 3, modelsTried + 1);
                    }
                }
                
                // Si es un error diferente (JSON inválido, 500, etc) o no quedan reintentos
                if (retries > 0) {
                     console.warn(`[Fallback Error] Reintentando ${modelName}...`);
                     return await tryWithModel(modelName, retries - 1, modelsTried);
                }
                throw err;
            }
        };

        return await tryWithModel(this.fallbackModels[this.currentModelIndex], retriesLeft);
    }

    private async saveTransactions(
        transactions: any[],
        fileName: string,
        entityId: string,
        tenantId: string,
        accountNumberHint: string | null
    ) {
        const TenantDetail = await getTenantDetailModel();
        const detail = await TenantDetail.findById(entityId);
        if (!detail) throw new Error("Tenant Detail not found");

        const TransactionRawPDF = await getTransactionRawPDFModel(tenantId, entityId);
        const fileId = new mongoose.Types.ObjectId().toString();

        const docs = transactions.map(tx => {
            let dateObj = null;
            try {
                if (tx.operation_date) {
                    const parts = tx.operation_date.split('/');
                    if (parts.length === 3) dateObj = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
                }
            } catch (e) {}

            return {
                fileName, fileId,
                fecha_hora: dateObj,
                monto: Math.abs(tx.amount || 0),
                currency: tx.currency || "PEN",
                movement: tx.movement,
                amount: tx.amount,
                balance: tx.balance,
                routing: {
                    entityId: new mongoose.Types.ObjectId(entityId),
                    bank: detail.dbName,
                    accountNumber: accountNumberHint || null
                },
                processed: false
            };
        });

        const result = await TransactionRawPDF.insertMany(docs);
        await recoService.ingest(tenantId, entityId, 'Statement', docs);
        return result;
    }
}

export const statementService = new StatementService();
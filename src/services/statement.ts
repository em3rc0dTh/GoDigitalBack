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
    private readonly MIN_REQUEST_INTERVAL = 1000; // 1 segundo entre peticiones

    constructor() {
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
    }

    // Control de rate limiting
    private async waitForRateLimit() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;

        if (timeSinceLastRequest < this.MIN_REQUEST_INTERVAL) {
            const waitTime = this.MIN_REQUEST_INTERVAL - timeSinceLastRequest;
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        this.lastRequestTime = Date.now();
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

        // Check if file already exists in DB to avoid unnecessary AI processing
        const TransactionRawPDF = await getTransactionRawPDFModel(tenantId, entityId);
        const existingDocs = await TransactionRawPDF.find({
            fileName: fileName,
            "routing.entityId": new mongoose.Types.ObjectId(entityId)
        });

        if (existingDocs.length > 0) {
            console.log(`File ${fileName} already processed. Returning ${existingDocs.length} existing transactions without re-processing.`);
            return { transactions: existingDocs, isDuplicate: true };
        }

        if (!textContent || textContent.trim().length === 0) {
            throw new Error("PDF content is empty or unreadable");
        }

        // 2. Dividir el texto en chunks más pequeños
        const chunks = this.splitTextIntoChunks(textContent, 8000); // ~8k chars por chunk
        console.log(`PDF dividido en ${chunks.length} chunks para procesamiento`);

        // 3. Procesar chunks de manera secuencial con rate limiting
        let allTransactions: any[] = [];
        let accountNumber: string | null = null;

        for (let i = 0; i < chunks.length; i++) {
            console.log(`Procesando chunk ${i + 1}/${chunks.length}...`);

            await this.waitForRateLimit(); // Esperar antes de cada petición

            const extractedData = await this.extractTransactionsWithAI(
                chunks[i],
                i === 0 // Solo buscar accountNumber en el primer chunk
            );

            if (extractedData && Array.isArray(extractedData.transactions)) {
                allTransactions = allTransactions.concat(extractedData.transactions);

                // Capturar accountNumber del primer chunk
                if (i === 0 && extractedData.accountNumber) {
                    accountNumber = extractedData.accountNumber;
                }
            }
        }

        if (allTransactions.length === 0) {
            throw new Error("AI failed to extract valid transactions");
        }

        console.log(`Total de transacciones extraídas: ${allTransactions.length}`);

        // 3.5 Validate Accounts against Tenant DB
        try {
            const tenantDB = await getTenantDB(tenantId, entityId);

            for (const tx of allTransactions) {
                // Validate source_account
                if (tx.source_account) {
                    const match = await findAccountByPartialNumber(tenantDB, tx.source_account);
                    if (match) {
                        console.log(`✅ Statement Source Match: ${tx.source_account} -> ${match.account_number}`);
                        tx.source_account = match.account_number;
                    }
                }

                // Validate destination_account
                if (tx.destination_account) {
                    const match = await findAccountByPartialNumber(tenantDB, tx.destination_account);
                    if (match) {
                        console.log(`✅ Statement Destination Match: ${tx.destination_account} -> ${match.account_number}`);
                        tx.destination_account = match.account_number;
                    }
                }
            }
        } catch (err) {
            console.error("⚠️ Error validating statement accounts:", err);
            // Non-critical, continue
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

    // Dividir texto en chunks manejables
    private splitTextIntoChunks(text: string, chunkSize: number = 8000): string[] {
        const chunks: string[] = [];

        // Dividir por líneas para no cortar transacciones a la mitad
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

        if (currentChunk.trim().length > 0) {
            chunks.push(currentChunk.trim());
        }

        return chunks;
    }

    private async extractTransactionsWithAI(
        text: string,
        includeAccountNumber: boolean = false
    ): Promise<any> {
        const accountNumberInstruction = includeAccountNumber
            ? '"accountNumber": "extracted account number or null",'
            : '';

        const prompt = `
You are a specialized banking assistant focused on bank statement parsing.

Your task is to analyze the following bank statement text and return ONLY a valid JSON object.
Do NOT include explanations, comments, markdown outside strings, or extra text.

=====================
REQUIRED OUTPUT FORMAT
=====================

{
  ${accountNumberInstruction}
  "transactions": [
    {
      "fecha_hora_raw": "Original date-time string as found, or null",
      "operation_date": "DD/MM/YYYY or null",
      "process_date": "DD/MM/YYYY or null",
      "operation_number": "string or null",
      "movement": "Short description of the transaction",
      "channel": "channel if available or null",
      "amount": number,
      "balance": number or null,
      "currency_raw": "raw currency symbol or code",
      "monto": number,
      "currency": "ISO 4217 code (USD, PEN, EUR, etc)",
      "source_account": "string or null",
      "destination_account": "string or null"
    }
  ]
}

=====================
MANDATORY RULES
=====================

- Do NOT overthink missing fields: use null when data is not present.
- NEVER invent bank account numbers.

ACCOUNT INFERENCE RULES (CRITICAL):
- Use the extracted accountNumber as the client's account.
- If amount > 0 (credit / incoming money):
    - destination_account = accountNumber
    - source_account = counterparty reference if present in the movement text, otherwise null
- If amount < 0 (debit / outgoing money):
    - source_account = accountNumber
    - destination_account = counterparty reference if present in the movement text, otherwise null
- Counterparty references may be system names, taxes, commissions, or external identifiers
  (e.g., "INTERCONNECT US-R165349", "REXTIE", "ITF", "COMISION").

AMOUNT & CURRENCY RULES:
- amount MUST be negative for debits and positive for credits.
- monto MUST always be the absolute value of amount.
- currency should be normalized to ISO 4217 when possible.

GENERAL RULES:
- Extract ALL transactions found in the text, even if some fields are missing.
- If no transactions are found, return an empty array.
- Return ONLY JSON. No additional text.

=====================
BANK STATEMENT TEXT
=====================

"""
${text}
"""
`;


        try {
            const model = this.genAI.getGenerativeModel({
                model: "gemini-2.0-flash",
                generationConfig: { responseMimeType: "application/json" }
            });

            const result = await model.generateContent(prompt);
            const content = result.response.text();

            if (!content) {
                throw new Error("No content from Gemini");
            }

            // 1️⃣ Parsear primero
            let parsed: any;
            try {
                parsed = JSON.parse(content);
            } catch (e) {
                console.error("❌ Invalid JSON returned by Gemini:");
                console.error(content);
                throw new Error("Gemini returned invalid JSON");
            }

            const transactions = Array.isArray(parsed.transactions) ? parsed.transactions : [];

            // 2️⃣ Generar tabla Markdown localmente
            const markdown_table = this.generateMarkdownTable(transactions);

            return {
                accountNumber: parsed.accountNumber ?? null,
                markdown_table: markdown_table,
                transactions: transactions
            };

        } catch (err: any) {
            console.error("Gemini API Error:", err);

            // Fallback para errores de rate limiting
            if (err?.message?.includes("429") || err?.status === 429) {
                console.warn("⚠️ Rate limit alcanzado. Esperando 5 segundos antes de reintentar...");
                await new Promise(resolve => setTimeout(resolve, 5000));

                // Reintentar UNA vez
                try {
                    return await this.extractTransactionsWithAI(text, includeAccountNumber);
                } catch (retryErr) {
                    console.error("Reintento falló. Usando fallback de mock data.");
                    throw new Error("Error al extraer transacciones con AI");
                }
            }
            throw err;
        }
    }

    private generateMarkdownTable(transactions: any[]): string {
        if (!transactions || transactions.length === 0) return "";

        let table = "| index | date | time | currency | amount | source_account | destination_account |\n";
        table += "|---|---|---|---|---|---|---|\n";

        transactions.forEach((tx, index) => {
            const date = tx.operation_date || "null";
            const time = tx.fecha_hora_raw || "null"; // Using raw as proxy for time if needed
            const currency = tx.currency_raw || "null";
            const amount = tx.amount?.toFixed(2) || "0.00";
            const source = tx.source_account || "null";
            const dest = tx.destination_account || "null";

            table += `| ${index} | ${date} | ${time} | ${currency} | ${amount} | ${source} | ${dest} |\n`;
        });

        return table;
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

        // Check if file already exists


        const fileId = new mongoose.Types.ObjectId().toString();

        const docs = transactions.map(tx => {
            let dateObj = null;
            try {
                if (tx.operation_date) {
                    const parts = tx.operation_date.split('/');
                    if (parts.length === 3) dateObj = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
                }
            } catch (e) { }

            return {
                fileName,
                fileId,
                fecha_hora: dateObj,
                fecha_hora_raw: tx.fecha_hora_raw,
                monto: Math.abs(tx.amount || 0),
                currency: tx.currency || "PEN",
                currency_raw: tx.currency_raw,
                operation_date: tx.operation_date,
                process_date: tx.process_date,
                operation_number: tx.operation_number,
                movement: tx.movement,
                channel: tx.channel,
                amount: tx.amount,
                balance: tx.balance,
                routing: {
                    entityId: new mongoose.Types.ObjectId(entityId),
                    bank: detail.dbName,
                    accountNumber: accountNumberHint || null
                },
                transactionVariables: {
                    amount: tx.amount,
                    currency: tx.currency,
                    operationDate: dateObj,
                    operationNumber: tx.operation_number,
                    originAccount: tx.source_account ?? null,
                    destinationAccount: tx.destination_account ?? null
                },
                processed: false
            };
        });

        try {
            const result = await TransactionRawPDF.insertMany(docs);

            // Ingest to Master RECO
            await recoService.ingest(
                tenantId,
                entityId,
                'Statement',
                docs
            );

            return result;
        } catch (e: any) {
            console.error("Error saving PDF transactions:", e);
            throw new Error("Database Save Error");
        }
    }
}

export const statementService = new StatementService();
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

export interface InvoiceData {
    items: Array<{
        description: string;
        quantity: number;
        unit?: string;
        unitPrice: number;
        total: number;
    }>;
    subtotal: number;
    tax?: number;
    total: number;
    currency: string;
    date: string | null;
    issuer?: {
        name: string;
        taxId: string;
    };
}

export class GeminiInvoiceService {
    private genAI: GoogleGenerativeAI;

    constructor() {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.warn("⚠️ GEMINI_API_KEY no encontrada en el .env");
        }
        this.genAI = new GoogleGenerativeAI(apiKey || "");
    }

    async analyzeInvoice(fileBuffer: Buffer, mimeType: string): Promise<InvoiceData | null> {
        try {
            const model = this.genAI.getGenerativeModel({ 
                model: "gemini-1.5-flash",
                generationConfig: { responseMimeType: "application/json" }
            });

            const prompt = `Analiza esta imagen de una factura o boleta de gastos y extrae la información requerida de forma estructurada.
            Campos requeridos:
            - items: Lista de productos o servicios detallados. Cada item debe tener:
                - description: Descripción completa del item.
                - quantity: Cantidad (número).
                - unit: Unidad de medida (ej: UND, KG, serv, etc) si existe.
                - unitPrice: Precio unitario.
                - total: Total de ese item.
            - subtotal: Monto base antes de impuestos.
            - tax: Monto total de impuestos (IGV, VAT, etc).
            - total: Monto final a pagar.
            - currency: Moneda del documento (ej: PEN, USD).
            - date: Fecha de emisión en formato ISO (YYYY-MM-DD) o null si no se detecta.
            - issuer: Información de quien emite el documento:
                - name: Nombre o Razón Social.
                - taxId: RUC o Identificador fiscal.

            Responde únicamente con el objeto JSON estructurado siguiendo esta interfaz:
            {
                "items": [ { "description": string, "quantity": number, "unit": string, "unitPrice": number, "total": number } ],
                "subtotal": number,
                "tax": number,
                "total": number,
                "currency": string,
                "date": string,
                "issuer": { "name": string, "taxId": string }
            }`;

            const result = await model.generateContent([
                {
                    inlineData: {
                        data: fileBuffer.toString("base64"),
                        mimeType: mimeType
                    }
                },
                prompt
            ]);

            const response = await result.response;
            const text = response.text();
            
            try {
                return JSON.parse(text) as InvoiceData;
            } catch (parseError) {
                console.error("Error parsing Gemini JSON response:", text);
                return null;
            }
        } catch (error: any) {
            console.error("Error calling Gemini API:", error?.message);
            return null;
        }
    }
}

export const geminiInvoiceService = new GeminiInvoiceService();

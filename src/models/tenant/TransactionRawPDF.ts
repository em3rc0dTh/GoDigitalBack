
import mongoose from "mongoose";
import { getOrCreateModel, getTenantDB } from "../../config/tenantDb";

export interface TransactionRawPDFDocument extends mongoose.Document {
    // Audit
    fileName: string;
    fileId: string; // unique identifier for the file upload (e.g., s3 key or random uuid)

    // Extracted Fields (Mapped to User Request)
    fecha_hora: Date | null;
    fecha_hora_raw: string;

    monto: number;
    currency: string;
    currency_raw: string;

    operation_date: string;
    process_date: string;
    operation_number: string;

    movement: string;
    channel: string;

    amount: number;
    balance: number;

    // Standardized Fields
    routing: {
        entityId: mongoose.Types.ObjectId | null;
        bank: string | null;
        accountNumber: string | null;
    } | null;

    transactionVariables: {
        originAccount: string | null;
        destinationAccount: string | null;
        amount: number | null;
        currency: string | null;
        operationDate: Date | null;
        operationNumber: string | null;
    };

    // Processing Status
    processed: boolean;
    processedAt: Date | null;
    error: string | null;

    createdAt: Date;
    updatedAt: Date;
}

const TransactionRawPDFSchema = new mongoose.Schema(
    {
        fileName: { type: String, required: true },
        fileId: { type: String, required: true, index: true },

        fecha_hora: { type: Date, default: null },
        fecha_hora_raw: { type: String, default: "" },

        monto: { type: Number, default: 0 },
        currency: { type: String, default: "" },
        currency_raw: { type: String, default: "" },

        operation_date: { type: String, default: "" },
        process_date: { type: String, default: "" },
        operation_number: { type: String, default: "" },

        movement: { type: String, default: "" },
        channel: { type: String, default: "" },

        amount: { type: Number, default: 0 },
        balance: { type: Number, default: 0 },

        routing: {
            entityId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "TenantDetail",
                default: null
            },
            bank: {
                type: String,
                default: null
            },
            accountNumber: {
                type: String,
                default: null
            }
        },

        transactionVariables: {
            originAccount: { type: String, default: null },
            destinationAccount: { type: String, default: null },
            amount: { type: Number, default: null },
            currency: { type: String, default: null },
            operationDate: { type: Date, default: null },
            operationNumber: { type: String, default: null }
        },

        processed: { type: Boolean, default: false },
        processedAt: { type: Date, default: null },
        error: { type: String, default: null },
    },
    {
        timestamps: true,
        collection: "Transaction_Raw_PDF",
        strict: false // Allow flexibility if OpenAI adds extras, though validation is good
    }
);

TransactionRawPDFSchema.index({ fileId: 1 });
TransactionRawPDFSchema.index({ "routing.entityId": 1 });

export async function getTransactionRawPDFModel(tenantId: string, detailId: string) {
    const tenantDB = await getTenantDB(tenantId, detailId);
    return getOrCreateModel(
        tenantDB,
        "Transaction_Raw_C_PDF",
        TransactionRawPDFSchema
    );
}

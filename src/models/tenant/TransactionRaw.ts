// src/models/tenant/TransactionRaw.ts
import mongoose from "mongoose";
import { getSystemDB, getOrCreateModel, getTenantDB } from "../../config/tenantDb";

export interface TransactionRawDocument extends mongoose.Document {
    // --- Email data (persistente)
    gmailId: string;
    threadId: string;
    historyId: string;
    messageId: string;
    from: string;
    subject: string;
    receivedAt: Date;
    html: string | null;
    textBody: string | null;
    labels: string[];

    // --- Routing
    routing: {
        entityId: mongoose.Types.ObjectId | null;
        bank: string | null;
        accountNumber: string | null;
    } | null;

    // --- Transaction data
    transactionVariables: {
        originAccount: string | null;
        destinationAccount: string | null;
        amount: number | null;
        currency: string | null;
        operationDate: Date | null;
        operationNumber: string | null;
    };

    transactionType: string | null;

    // --- Conciliación
    systemRawId: mongoose.Types.ObjectId | null;
    imapRawId: mongoose.Types.ObjectId | null;
    matchStatus: boolean;
    matchAt: Date | null;

    // --- Estado
    processed: boolean;
    processedAt: Date | null;
    error: string | null;

    createdAt: Date;
    updatedAt: Date;
}
const TransactionRawSchema = new mongoose.Schema(
    {
        gmailId: { type: String, required: true, index: true },
        threadId: { type: String, required: true },
        historyId: { type: String, required: true },

        messageId: { type: String, required: true, index: true },

        from: { type: String, required: true },
        subject: { type: String, required: true },
        receivedAt: { type: Date, required: true },

        html: { type: String, default: null },
        textBody: { type: String, default: null },
        labels: { type: [String], default: [] },

        routing: {
            entityId: { type: mongoose.Schema.Types.ObjectId, default: null },
            bank: { type: String, default: null },
            accountNumber: { type: String, default: null },
        },

        transactionVariables: {
            originAccount: String,
            destinationAccount: String,
            amount: Number,
            currency: String,
            operationDate: Date,
            operationNumber: String,
        },

        transactionType: { type: String, default: null },

        // conciliación
        systemRawId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Transaction_Raw_Gmail_System",
            default: null,
        },
        imapRawId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Transaction_Raw_IMAP",
            default: null,
        },
        matchStatus: { type: Boolean, default: false },
        matchAt: { type: Date, default: null },

        processed: { type: Boolean, default: false },
        processedAt: { type: Date, default: null },
        error: { type: String, default: null },
    },
    {
        timestamps: true,
        collection: "Transaction_Raw",
        strict: true,
    }
);
TransactionRawSchema.index({ messageId: 1 }, { unique: true });
TransactionRawSchema.index({ matchStatus: 1, receivedAt: -1 });
TransactionRawSchema.index({ "routing.entityId": 1 });

export async function getTransactionRawModel(tenantId: string, detailId: string) {
    const systemDB = await getTenantDB(tenantId, detailId);
    return getOrCreateModel(
        systemDB,
        "Transaction_Raw",
        TransactionRawSchema
    );
}

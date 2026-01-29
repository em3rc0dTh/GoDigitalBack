// src/models/tenant/TransactionRaw.ts
import mongoose from "mongoose";
import { getSystemDB, getOrCreateModel, getTenantDB } from "../../config/tenantDb";

export interface TransactionRawDocument extends mongoose.Document {
    // --- Source
    source?: 'GMAIL' | 'PDF' | 'WEB' | 'API' | 'Statement' | 'IMAP';
    externalId?: string;
    deduplicationHash?: string;

    // --- Email data (optional)
    gmailId?: string;
    threadId?: string;
    historyId?: string;
    messageId?: string;
    from?: string;
    subject?: string;
    receivedAt: Date;
    html?: string | null;
    textBody?: string | null;
    labels?: string[];

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
    linkedSources: {
        source: string;
        sourceId: mongoose.Types.ObjectId;
        externalId: string | null;
        rawData: any;
        extractedAt: Date;
    }[];

    systemRawId: mongoose.Types.ObjectId | null;
    imapRawId: mongoose.Types.ObjectId | null;
    webRawId: mongoose.Types.ObjectId | null;
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
        // --- Source Information (New for RECO)
        source: {
            type: String,
            enum: ['GMAIL', 'PDF', 'WEB', 'API', 'Statement', 'IMAP'],
            default: 'GMAIL', // Backward compatibility
            required: true,
            index: true
        },
        externalId: {
            type: String, // Original ID in source (e.g. fileId, webId)
            default: null,
            index: true
        },

        // --- Gmail data (Made Optional)
        gmailId: { type: String, required: false, index: true },
        threadId: { type: String, required: false },
        historyId: { type: String, required: false },

        messageId: { type: String, required: false, index: true },

        from: { type: String, required: false }, // Optional for PDF/Web
        subject: { type: String, required: false },
        receivedAt: { type: Date, required: true }, // Required for all (use creation date if unavailable)

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
        linkedSources: [{
            _id: false,
            source: { type: String, required: true },
            sourceId: { type: mongoose.Schema.Types.ObjectId, required: true },
            externalId: { type: String, default: null },
            rawData: { type: mongoose.Schema.Types.Mixed, default: {} },
            extractedAt: { type: Date, default: Date.now }
        }],

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
        webRawId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "TransactionRawAccountWeb",
            default: null,
        },
        matchStatus: { type: Boolean, default: false },
        matchAt: { type: Date, default: null },

        processed: { type: Boolean, default: false },
        processedAt: { type: Date, default: null },
        error: { type: String, default: null },
        deduplicationHash: { type: String, default: null, index: true },
    },
    {
        timestamps: true,
        collection: "Transaction_Raw",
        strict: true,
    }
);
TransactionRawSchema.index({ deduplicationHash: 1 }, { unique: true, sparse: true });
TransactionRawSchema.index({ messageId: 1 }, { unique: true, sparse: true });
TransactionRawSchema.index({ matchStatus: 1, receivedAt: -1 });
TransactionRawSchema.index({ "routing.entityId": 1 });
// Index for searching linked sources
TransactionRawSchema.index({ "linkedSources.sourceId": 1 });

export async function getTransactionRawModel(tenantId: string, detailId: string) {
    const systemDB = await getTenantDB(tenantId, detailId);
    if (systemDB.models.Transaction_Raw) {
        return systemDB.models.Transaction_Raw as mongoose.Model<TransactionRawDocument>;
    }
    return systemDB.model<TransactionRawDocument>(
        "Transaction_Raw",
        TransactionRawSchema
    );
}

// src/models/tenant/EmailLog.ts
import mongoose, { Document, Model } from "mongoose";

export interface EmailLogDocument extends Document {
    accountId?: mongoose.Types.ObjectId;
    messageId: string; // Gmail message ID
    threadId: string;
    historyId: string;
    from: string;
    subject: string;
    receivedDate: Date;
    processed: boolean;
    processedAt?: Date;
    transactionsCreated: number;
    rawBody?: string; // Opcional: guardar el email completo
    attachments: Array<{
        filename: string;
        mimeType: string;
        size: number;
        processed: boolean;
    }>;
    error?: string;
    createdAt: Date;
    updatedAt: Date;
}

const EmailLogSchema = new mongoose.Schema({
    accountId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Account",
        required: false,
        index: true
    },
    messageId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    threadId: {
        type: String,
        index: true
    },
    historyId: {
        type: String,
        required: true
    },
    from: {
        type: String,
        required: true
    },
    subject: {
        type: String,
        default: ""
    },
    receivedDate: {
        type: Date,
        required: true,
        index: true
    },
    processed: {
        type: Boolean,
        default: false,
        index: true
    },
    processedAt: {
        type: Date
    },
    transactionsCreated: {
        type: Number,
        default: 0
    },
    rawBody: {
        type: String
    },
    attachments: [{
        filename: String,
        mimeType: String,
        size: Number,
        processed: { type: Boolean, default: false }
    }],
    error: {
        type: String
    }
}, { timestamps: true });

EmailLogSchema.index({ accountId: 1, receivedDate: -1 });
EmailLogSchema.index({ processed: 1, createdAt: 1 });

export function getEmailLogModel(
    connection: mongoose.Connection
): Model<EmailLogDocument> {
    return connection.model<EmailLogDocument>("EmailLog", EmailLogSchema);
}
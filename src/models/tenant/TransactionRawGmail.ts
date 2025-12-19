// src/models/tenant/TransactionRawGmail.ts
import { Schema, model, Types } from 'mongoose';

const TransactionRawGmailSchema = new Schema(
    {
        gmailMessageId: { type: String, required: true, index: true },
        threadId: String,

        from: String,
        to: String,
        subject: String,
        date: Date,

        bodyText: String,
        bodyHtml: String,

        attachments: [
            {
                filename: String,
                mimeType: String,
                attachmentId: String,
                size: Number
            }
        ],

        parsed: { type: Boolean, default: false }
    },
    { timestamps: true }
);

export default model(
    'Transaction_Raw_Gmail',
    TransactionRawGmailSchema
);

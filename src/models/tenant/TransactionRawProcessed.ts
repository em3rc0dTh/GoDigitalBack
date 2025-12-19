// src/models/tenant/TransactionRawProcessed.ts
import { Schema, model, Types } from 'mongoose';

const TransactionRawProcessedSchema = new Schema(
    {
        rawGmailId: {
            type: Types.ObjectId,
            ref: 'Transaction_Raw_Gmail',
            required: true,
            index: true
        },

        amount: Number,
        currency: String,
        date: Date,
        description: String,

        bank: String,
        accountHint: String,

        confidence: {
            type: Number,
            min: 0,
            max: 1
        }
    },
    { timestamps: true }
);

export default model(
    'Transaction_Raw_Processed',
    TransactionRawProcessedSchema
);

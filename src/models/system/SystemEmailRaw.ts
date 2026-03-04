import mongoose from "mongoose";
import { getSystemDB, getOrCreateModel } from "../../config/tenantDb";

export interface SystemEmailRawDocument extends mongoose.Document {
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
    transactionType: string | null;
    processed: boolean;
    processedAt: Date | null;
    error: string | null;
    createdAt: Date;
    updatedAt: Date;
}

const SystemEmailRawSchema = new mongoose.Schema(
    {
        gmailId: {
            type: String,
            required: true,
            unique: true,
            index: true
        },
        threadId: {
            type: String,
            required: true,
            index: true
        },
        historyId: {
            type: String,
            required: true
        },
        messageId: {
            type: String,
            required: true,
            index: true
        },
        from: {
            type: String,
            required: true,
            index: true
        },
        subject: {
            type: String,
            required: true
        },
        receivedAt: {
            type: Date,
            required: true,
            index: true
        },
        html: {
            type: String,
            default: null,
            maxlength: 2_000_000
        },
        textBody: {
            type: String,
            default: null,
            maxlength: 500_000
        },
        labels: {
            type: [String],
            default: []
        },
        routing: {
            type: {
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
            default: null
        },
        transactionVariables: {
            type: {
                originAccount: { type: String, default: null },
                destinationAccount: { type: String, default: null },
                amount: { type: Number, default: null },
                currency: { type: String, default: null },
                operationDate: { type: Date, default: null },
                operationNumber: { type: String, default: null }
            },
            default: () => ({
                originAccount: null,
                destinationAccount: null,
                amount: null,
                currency: null,
                operationDate: null,
                operationNumber: null
            })
        },
        transactionType: {
            type: String,
            default: null
        },
        processed: {
            type: Boolean,
            default: false,
            index: true
        },
        processedAt: {
            type: Date,
            default: null
        },
        error: {
            type: String,
            default: null
        }
    },
    {
        timestamps: true,
        strict: true,
        collection: "Transaction_Raw_Gmail_System"
    }
);

SystemEmailRawSchema.index({ processed: 1, receivedAt: -1 });
SystemEmailRawSchema.index({ "routing.entityId": 1, "routing.bank": 1 });
SystemEmailRawSchema.index({ from: 1, receivedAt: -1 });
SystemEmailRawSchema.index({ messageId: 1 });

export async function getSystemEmailRawModel() {
    const systemDB = await getSystemDB();
    return getOrCreateModel(
        systemDB,
        "Transaction_Raw_Gmail_System",
        SystemEmailRawSchema
    );
}

export default getSystemEmailRawModel;

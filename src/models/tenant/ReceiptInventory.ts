import mongoose, { Document, Model, Schema } from "mongoose";

export interface ReceiptInventoryDocument extends Document {
    user_id: mongoose.Types.ObjectId;  // Ref to system.User
    user_name: string;                // Sanitized name used in folder hierarchy
    source: string;                  // 'cash_request', 'payment_request', etc.
    source_id?: mongoose.Types.ObjectId; // Optional link to specific request
    type: string;                    // 'invoice', 'voucher', etc.
    period: string;                  // 'YYYY-MM1-MM2' e.g. '2024-01-02'
    fileName: string;
    filePath: string;                // Physical path in disk (relative to uploads root)
    mimeType: string;
    size: number;
    base64Url?: string;              // Mantain Base64 compatibility
    extracted_data?: any;           // JSON returned by n8n
    ai_raw_data?: any;              // Full AI response
    status: 'pending' | 'processed' | 'failed';
    createdAt: Date;
    updatedAt: Date;
}

const ReceiptInventorySchema = new Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    user_name: { type: String, required: true },
    source: { type: String, required: true },
    source_id: { type: mongoose.Schema.Types.ObjectId },
    type: { type: String, required: true },
    period: { type: String, required: true },
    fileName: { type: String, required: true },
    filePath: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    base64Url: { type: String },
    extracted_data: { type: mongoose.Schema.Types.Mixed },
    ai_raw_data: { type: mongoose.Schema.Types.Mixed },
    status: {
        type: String,
        enum: ['pending', 'processed', 'failed'],
        default: 'pending'
    }
}, {
    timestamps: true,
    collection: 'receipt_inventory'
});

export function getReceiptInventoryModel(connection: mongoose.Connection): Model<ReceiptInventoryDocument> {
    return connection.model<ReceiptInventoryDocument>("ReceiptInventory", ReceiptInventorySchema);
}

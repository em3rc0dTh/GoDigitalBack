import mongoose, { Document, Model, Schema } from "mongoose";

export interface PaymentRequestDocument extends Document {
    created_by?: mongoose.Types.ObjectId;
    purchase_order_id?: mongoose.Types.ObjectId;
    voucher_id?: mongoose.Types.ObjectId;
    provider_id: mongoose.Types.ObjectId;
    project_id: mongoose.Types.ObjectId;
    subtotal: number;
    tax: number;
    total: number;
    date: Date;
    currency: string;
    dueDate?: Date;
    status: 'pending' | 'approved' | 'paid' | 'rejected';
    notes?: string;
    attachments?: string[]; // URLs or paths
    createdAt: Date;
    updatedAt: Date;
}

const PaymentRequestSchema = new mongoose.Schema({
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    purchase_order_id: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder', required: false },
    voucher_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Voucher', required: false },
    provider_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity', required: true },
    project_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    subtotal: { type: Number, required: true },
    tax: { type: Number, required: true },
    total: { type: Number, required: true },
    currency: { type: String, default: 'USD' },
    date: { type: Date }, // Issue Date
    dueDate: { type: Date }, // Delivery Deadline
    status: {
        type: String,
        enum: ['pending', 'approved', 'paid', 'rejected'],
        default: 'pending'
    },
    notes: { type: String },
    attachments: { type: [String], default: [] }
}, {
    timestamps: true,
    collection: 'payment_requests'
});

export function getPaymentRequestModel(connection: mongoose.Connection): Model<PaymentRequestDocument> {
    return connection.model<PaymentRequestDocument>("PaymentRequest", PaymentRequestSchema);
}

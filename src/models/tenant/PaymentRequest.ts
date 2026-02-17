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
    status: 'pending' | 'approved' | 'authorized' | 'paid' | 'rejected';
    approved_by?: mongoose.Types.ObjectId;
    authorized_by?: mongoose.Types.ObjectId;
    rejected_by?: mongoose.Types.ObjectId;
    paid_by?: mongoose.Types.ObjectId;
    payment_proof?: string; // URL or path to payment voucher
    notes?: string;
    attachments?: string[]; // URLs or paths
    createdAt: Date;
    updatedAt: Date;
    debited_bank_account?: mongoose.Types.ObjectId;
    payment_date?: Date;
    approval_notes?: string;
    authorization_notes?: string;
    payment_notes?: string;
    rejection_reason?: string;
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
        enum: ['pending', 'approved', 'authorized', 'paid', 'rejected'],
        default: 'pending'
    },
    approved_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    authorized_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rejected_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    paid_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    payment_proof: { type: String },
    notes: { type: String },
    attachments: { type: [String], default: [] },
    debited_bank_account: { type: mongoose.Schema.Types.ObjectId, ref: 'Bank_Account' },
    payment_date: { type: Date },
    approval_notes: { type: String },
    authorization_notes: { type: String },
    payment_notes: { type: String },
    rejection_reason: { type: String }
}, {
    timestamps: true,
    collection: 'payment_requests'
});

export function getPaymentRequestModel(connection: mongoose.Connection): Model<PaymentRequestDocument> {
    return connection.model<PaymentRequestDocument>("PaymentRequest", PaymentRequestSchema);
}

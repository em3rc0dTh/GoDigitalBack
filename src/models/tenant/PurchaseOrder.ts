import mongoose, { Document, Model, Schema } from "mongoose";

export interface PurchaseOrderItem {
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
}

export interface PurchaseOrderDocument extends Document {
    poNumber: string;
    created_by?: mongoose.Types.ObjectId;
    provider_id: mongoose.Types.ObjectId;
    project_id?: mongoose.Types.ObjectId;
    business_unit_id?: mongoose.Types.ObjectId;
    items: PurchaseOrderItem[];
    totalAmount: number;
    currency: string;
    status: 'draft' | 'issued' | 'approved' | 'rejected' | 'completed' | 'cancelled';
    issueDate?: Date;
    expectedDeliveryDate?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const PurchaseOrderItemSchema = new mongoose.Schema({
    description: { type: String, required: true },
    quantity: { type: Number, required: true, default: 1 },
    unitPrice: { type: Number, required: true, default: 0 },
    total: { type: Number, required: true, default: 0 }
});

const PurchaseOrderSchema = new mongoose.Schema({
    poNumber: { type: String, unique: true }, // Can be auto-generated or manual
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    provider_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity', required: true },
    project_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
    business_unit_id: { type: mongoose.Schema.Types.ObjectId, ref: 'BusinessUnit' },
    items: { type: [PurchaseOrderItemSchema], default: [] },
    totalAmount: { type: Number, required: true, default: 0 },
    currency: { type: String, default: 'USD' },
    status: {
        type: String,
        enum: ['draft', 'issued', 'approved', 'rejected', 'completed', 'cancelled'],
        default: 'draft'
    },
    issueDate: { type: Date, default: Date.now },
    expectedDeliveryDate: { type: Date }
}, {
    timestamps: true,
    collection: 'purchase_orders'
});

export function getPurchaseOrderModel(connection: mongoose.Connection): Model<PurchaseOrderDocument> {
    return connection.model<PurchaseOrderDocument>("PurchaseOrder", PurchaseOrderSchema);
}

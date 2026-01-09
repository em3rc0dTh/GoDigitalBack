import mongoose, { Document, Model, Schema } from "mongoose";

export interface BusinessUnitDocument extends Document {
    tenantDetailId: mongoose.Types.ObjectId; // Optional link back if needed, but usually context is implied by DB
    name: string;
    description: string;
    areas: any[];
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const BusinessUnitSchema = new mongoose.Schema({
    tenantDetailId: {
        type: mongoose.Schema.Types.ObjectId,
        // ref: 'TenantDetail', // Careful with cross-db refs
        default: null
    },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    areas: { type: [mongoose.Schema.Types.Mixed], default: [] },
    isActive: { type: Boolean, default: true }
}, {
    timestamps: true,
    collection: 'business_units'
});

export function getBusinessUnitModel(connection: mongoose.Connection): Model<BusinessUnitDocument> {
    return connection.model<BusinessUnitDocument>("BusinessUnit", BusinessUnitSchema);
}

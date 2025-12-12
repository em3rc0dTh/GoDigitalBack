// src/models/system/Tenant.ts
import mongoose from "mongoose";
import { getSystemDB, getOrCreateModel } from "../../config/tenantDb";

const TenantSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    dbName: {
        type: String,
        unique: true,
        sparse: true
    },
    ownerEmail: {
        type: String,
        required: true
    },
    country: {
        type: String
    },
    entityType: {
        type: String,
        enum: ["natural", "legal"]
    },
    taxId: {
        type: String,
        unique: true,
        sparse: true
    },
    businessEmail: {
        type: String
    },
    domain: {
        type: String
    },
    // Keep metadata for any additional flexible data
    metadata: {
        type: mongoose.Schema.Types.Mixed
    },
}, { timestamps: true });

export async function getTenantModel() {
    const systemDB = await getSystemDB();
    return getOrCreateModel(systemDB, "Tenant", TenantSchema);
}

export default getTenantModel;
// src/models/system/TenantDetail.ts
import mongoose from "mongoose";
import { getSystemDB, getOrCreateModel } from "../../config/tenantDb";

const TenantDetailSchema = new mongoose.Schema({
    tenantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Tenant",
        required: true,
        index: true
    },
    dbName: {
        type: String,
        required: true,
        unique: true
    },
    country: {
        type: String,
        required: true
    },
    entityType: {
        type: String,
        enum: ["natural", "legal"],
        required: true
    },
    taxId: {
        type: String,
        required: true,
        unique: true
    },
    businessEmail: {
        type: String,
        default: null
    },
    domain: {
        type: String,
        default: null
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
}, {
    timestamps: true,
    strict: true,
});

TenantDetailSchema.index({ tenantId: 1, dbName: 1 });

export async function getTenantDetailModel() {
    const systemDB = await getSystemDB();
    return getOrCreateModel(systemDB, "TenantDetail", TenantDetailSchema);
}

export default getTenantDetailModel;
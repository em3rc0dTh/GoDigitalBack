import mongoose from "mongoose";
import { getSystemDB, getOrCreateModel } from "../../config/tenantDb";

const TenantDetailSchema = new mongoose.Schema({
    tenantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Tenant",
        required: true
    },
    dbName: {
        type: String,
        unique: true,
        sparse: true,
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
    metadata: {
        type: mongoose.Schema.Types.Mixed
    },
}, { timestamps: true });

export async function getTenantDetailModel() {
    const systemDB = await getSystemDB();
    return getOrCreateModel(systemDB, "TenantDetail", TenantDetailSchema);
}

export default getTenantDetailModel;
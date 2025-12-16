// src/models/system/Tenant.ts
import mongoose from "mongoose";
import { getSystemDB, getOrCreateModel } from "../../config/tenantDb";

const TenantSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    ownerEmail: {
        type: String,
        required: true
    },
    dbList: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "TenantDetail"
    }],
    metadata: {
        type: mongoose.Schema.Types.Mixed
    },
}, {
    timestamps: true,
    strict: true,
});

export async function getTenantModel() {
    const systemDB = await getSystemDB();
    const model = getOrCreateModel(systemDB, "Tenant", TenantSchema);

    // Asegurar índices
    try {
        await model.syncIndexes();
        console.log("✅ Tenant indexes synchronized");
    } catch (err) {
        console.error("⚠️  Failed to sync Tenant indexes:", err);
    }

    return model;
}

export default getTenantModel;
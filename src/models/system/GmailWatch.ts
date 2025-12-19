// src/models/system/GmailWatch.ts
import mongoose from "mongoose";
import { getOrCreateModel, getSystemDB } from "../../config/tenantDb";

/**
 * Tracking de suscripciones activas de Gmail Push Notifications
 * por TenantDetail (repositorio)
 */
const GmailWatchSchema = new mongoose.Schema({
    tenantDetailId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "TenantDetail",
        required: true,
        unique: true,
        index: true
    },
    email: {
        type: String,
        required: true,
    },
    historyId: {
        type: String,
        required: true, // Último historyId procesado
    },
    expiration: {
        type: Date,
        required: true, // Gmail watch expira en ~7 días
        index: true
    },
    topicName: {
        type: String,
        required: true, // projects/{project}/topics/{topic}
    },
    accessToken: {
        type: String,
        required: true, // Encrypted en producción
    },
    refreshToken: {
        type: String,
        required: true, // Encrypted en producción
    },
    status: {
        type: String,
        enum: ["active", "expired", "error"],
        default: "active"
    },
    lastError: {
        type: String,
        default: null
    }
}, { timestamps: true });

export async function getGmailWatchModel() {
    const systemDB = await getSystemDB();
    return getOrCreateModel(systemDB, "GmailWatch", GmailWatchSchema);
}

export default getGmailWatchModel;
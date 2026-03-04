// src/models/tenant/TenantInformation.ts
import mongoose from "mongoose";
import { getSystemDB, getOrCreateModel } from "../../config/tenantDb";

const TenantInformationSchema = new mongoose.Schema({
    tenantDetailId: { type: mongoose.Schema.Types.ObjectId, ref: "TenantDetail" }, // Ref > tenantDetail.id
    legalName: { type: String, required: true },
    legalClass: { type: String, required: true },
    taxId: { type: String, required: true },
    baseCurrency: { type: String, default: null },
    contact: {
        type: new mongoose.Schema({
            name: String,
            email: String,
            phone: String,
        }, { _id: false }),
        default: null
    }

}, { timestamps: true });

export async function getTenantInformationModel(connection: mongoose.Connection) {
    return getOrCreateModel(
        connection,
        "TenantInformation",
        TenantInformationSchema
    );
}

export default getTenantInformationModel;

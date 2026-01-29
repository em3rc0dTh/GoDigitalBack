// src/models/tenant/Transaction_Raw_C_Web.ts
import mongoose, { Document, Model } from "mongoose";
import { getOrCreateModel, getTenantDB } from "../../config/tenantDb";

export interface TransactionRawCWebDocument extends Document {
    accountId: mongoose.Types.ObjectId;
    uuid: string;
    descripcion: string;
    fecha_hora: Date;
    fecha_hora_raw: string;
    monto: number;
    currency: string;
    currency_raw: string;
    operation_date: string;
    process_date: string;
    operation_number: string;
    movement: string;
    channel: string;
    amount: number;
    balance: number;
    metadata: any;

    // Reference to Master RECO
    masterId: mongoose.Types.ObjectId | null;

    createdAt: Date;
    updatedAt: Date;
}

const TransactionRawCWebSchema = new mongoose.Schema({
    accountId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Account",
        required: true,
        index: true
    },
    uuid: { type: String, default: null },
    descripcion: { type: String, default: "" },

    fecha_hora: { type: Date, default: null },
    fecha_hora_raw: { type: String, default: "" },

    monto: { type: Number, default: 0 },
    currency: { type: String, default: "" },
    currency_raw: { type: String, default: "" },

    operation_date: { type: String, default: "" },
    process_date: { type: String, default: "" },
    operation_number: { type: String, default: "" },

    movement: { type: String, default: "" },
    channel: { type: String, default: "" },

    amount: { type: Number, default: 0 },
    balance: { type: Number, default: 0 },

    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },

    masterId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Transaction_Raw",
        default: null
    }
}, {
    timestamps: true,
    collection: 'Transaction_Raw_C_Web'
});

TransactionRawCWebSchema.index({ accountId: 1, fecha_hora: -1 });

export async function getTransactionRawCWebModel(tenantId: string, detailId: string) {
    const tenantDB = await getTenantDB(tenantId, detailId);
    return getOrCreateModel(
        tenantDB,
        "Transaction_Raw_C_Web",
        TransactionRawCWebSchema
    );
}

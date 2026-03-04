// src/models/tenant/TransactionRawAccountWeb.ts
import mongoose, { Document, Model } from "mongoose";

export interface TransactionRawAccountWebDocument extends Document {
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
    createdAt: Date;
    updatedAt: Date;
}

const TransactionRawAccountWebSchema = new mongoose.Schema({
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
    }
}, {
    timestamps: true,
    collection: 'transaction_raw_account_web'
});

export function getTransactionRawAccountWebModel(connection: mongoose.Connection): Model<TransactionRawAccountWebDocument> {
    return connection.model<TransactionRawAccountWebDocument>("TransactionRawAccountWeb", TransactionRawAccountWebSchema);
}

import mongoose, { Document, Model } from "mongoose";

export interface AccountDocument extends Document {
    alias?: string;
    bank_name: string;
    account_holder: string;
    bank_account_type: string;
    account_number: string;
    currency?: string;
    account_type?: string;
    tx_count: number;
    oldest?: Date | null;
    newest?: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

const AccountSchema = new mongoose.Schema({
    alias: { type: String },
    bank_name: { type: String, required: true },
    account_holder: { type: String, required: true },
    bank_account_type: { type: String, required: true },
    account_number: { type: String, required: true },
    currency: { type: String },
    account_type: { type: String },
    tx_count: { type: Number, default: 0 },
    oldest: { type: Date, default: null },
    newest: { type: Date, default: null },
}, { timestamps: true });

export function getAccountModel(
    connection: mongoose.Connection
): Model<AccountDocument> {
    return connection.model<AccountDocument>("Account", AccountSchema);
}

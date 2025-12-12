import mongoose from "mongoose";

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

export default AccountSchema;

export function getAccountModel(connection: mongoose.Connection) {
    return connection.model("Account", AccountSchema);
}
import mongoose, { Document, Model, Schema } from "mongoose";

export interface TenantFileDocument extends Document {
    fileName: string;
    mimeType: string;
    size: number;
    base64Url?: string;
    createdAt: Date;
    updatedAt: Date;
}

const TenantFileSchema = new Schema({
    fileName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size:     { type: Number, required: true },
    base64Url: { type: String }, // optional if we store binary
}, {
    timestamps: true,
    collection: 'tenant_files'
});

export function getTenantFileModel(connection: mongoose.Connection): Model<TenantFileDocument> {
    return connection.model<TenantFileDocument>("TenantFile", TenantFileSchema);
}

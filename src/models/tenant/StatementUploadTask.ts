import mongoose, { Document, Model, Schema } from 'mongoose';
import { getTenantDB, getOrCreateModel } from '../../config/tenantDb';

export interface IStatementUploadTask {
    tenantId: string;
    entityId: string;
    fileName: string;
    fileBuffer: Buffer;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    error?: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface IStatementUploadTaskDocument extends IStatementUploadTask, Document {}

const StatementUploadTaskSchema = new Schema<IStatementUploadTaskDocument>(
    {
        tenantId: { type: String, required: true },
        entityId: { type: String, required: true },
        fileName: { type: String, required: true },
        fileBuffer: { type: Buffer, required: true },
        status: { 
            type: String, 
            enum: ['pending', 'processing', 'completed', 'failed'], 
            default: 'pending' 
        },
        error: { type: String }
    },
    { timestamps: true }
);

// Indexes for fast querying by the worker
StatementUploadTaskSchema.index({ status: 1, createdAt: 1 });

export const getStatementUploadTaskModel = async (tenantId: string, detailId: string): Promise<Model<IStatementUploadTaskDocument>> => {
    // Note: this model is created in the tenant database, NOT system
    const db = await getTenantDB(tenantId, detailId); 
    return getOrCreateModel(db, 'StatementUploadTask', StatementUploadTaskSchema) as Model<IStatementUploadTaskDocument>;
};

import mongoose, { Document, Model, Schema } from "mongoose";

export interface ProjectDocument extends Document {
    name: string;
    code?: string;
    description?: string;
    projectOwner?: mongoose.Types.ObjectId;
    business_unit_id?: mongoose.Types.ObjectId;
    status: 'active' | 'completed' | 'on_hold' | 'cancelled';
    startDate?: Date;
    endDate?: Date;
    isActive: boolean; // General soft delete mechanism if needed
    budgets?: {
        id: string;
        currency: string;
        allocated_amount: number;
        approved_by: string;
        approved_at: Date;
        notes?: string;
        is_active: boolean;
    }[];
    createdAt: Date;
    updatedAt: Date;
}

const ProjectSchema = new mongoose.Schema({
    name: { type: String, required: true },
    code: { type: String },
    description: { type: String },
    projectOwner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    business_unit_id: { type: mongoose.Schema.Types.ObjectId, ref: 'BusinessUnit' },
    status: {
        type: String,
        enum: ['active', 'completed', 'on_hold', 'cancelled', 'planned'],
        default: 'active'
    },
    startDate: { type: Date },
    endDate: { type: Date },
    isActive: { type: Boolean, default: true },
    budgets: [{
        id: { type: String },
        currency: { type: String },
        allocated_amount: { type: Number },
        approved_by: { type: String },
        approved_at: { type: Date },
        notes: { type: String },
        is_active: { type: Boolean, default: true }
    }]
}, {
    timestamps: true,
    collection: 'projects'
});

export function getProjectModel(connection: mongoose.Connection): Model<ProjectDocument> {
    return connection.model<ProjectDocument>("Project", ProjectSchema);
}

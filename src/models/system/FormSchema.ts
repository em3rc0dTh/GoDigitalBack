import mongoose, { Document, Model, Schema } from "mongoose";
import { getSystemDB, getOrCreateModel } from "../../config/tenantDb";

export interface FormSchemaDocument extends Document {
    name: string;
    schema: any;
    uiSchema?: any;
    description?: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const FormSchemaSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    schema: { type: mongoose.Schema.Types.Mixed, required: true },
    uiSchema: { type: mongoose.Schema.Types.Mixed, default: {} },
    description: { type: String },
    isActive: { type: Boolean, default: true }
}, {
    timestamps: true,
    collection: 'form_schemas'
});

export async function getFormSchemaModel(): Promise<Model<FormSchemaDocument>> {
    const systemDB = await getSystemDB();
    return getOrCreateModel(systemDB, "FormSchema", FormSchemaSchema) as Model<FormSchemaDocument>;
}

export default getFormSchemaModel;

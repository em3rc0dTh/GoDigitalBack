import { Document } from "mongoose";
import getFormSchemaModel, { FormSchemaDocument } from "../../models/system/FormSchema";

export class FormSchemaService {

    async createSchema(data: Partial<FormSchemaDocument>): Promise<FormSchemaDocument> {
        const FormSchema = await getFormSchemaModel();
        return await FormSchema.create(data);
    }

    async getSchemaById(id: string): Promise<FormSchemaDocument | null> {
        const FormSchema = await getFormSchemaModel();
        return await FormSchema.findById(id);
    }

    async getSchemaByName(name: string): Promise<FormSchemaDocument | null> {
        const FormSchema = await getFormSchemaModel();
        return await FormSchema.findOne({ name });
    }

    async listSchemas(filter: any = {}): Promise<FormSchemaDocument[]> {
        const FormSchema = await getFormSchemaModel();
        return await FormSchema.find(filter);
    }

    async updateSchema(id: string, data: Partial<FormSchemaDocument>): Promise<FormSchemaDocument | null> {
        const FormSchema = await getFormSchemaModel();
        return await FormSchema.findByIdAndUpdate(id, data, { new: true });
    }
}

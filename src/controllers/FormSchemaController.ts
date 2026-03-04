import { Request, Response } from "express";
import { FormSchemaService } from "../services/system/FormSchemaService";

const formSchemaService = new FormSchemaService();

export const createFormSchema = async (req: Request, res: Response) => {
    try {
        const schema = await formSchemaService.createSchema(req.body);
        res.status(201).json(schema);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getFormSchemaById = async (req: Request, res: Response) => {
    try {
        const schema = await formSchemaService.getSchemaById(req.params.id);
        if (!schema) return res.status(404).json({ error: "Schema not found" });
        res.json(schema);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getFormSchemaByName = async (req: Request, res: Response) => {
    try {
        const schema = await formSchemaService.getSchemaByName(req.params.name);
        if (!schema) return res.status(404).json({ error: "Schema not found" });
        res.json(schema);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const listFormSchemas = async (req: Request, res: Response) => {
    try {
        const schemas = await formSchemaService.listSchemas(req.query);
        res.json(schemas);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const updateFormSchema = async (req: Request, res: Response) => {
    try {
        const schema = await formSchemaService.updateSchema(req.params.id, req.body);
        if (!schema) return res.status(404).json({ error: "Schema not found" });
        res.json(schema);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

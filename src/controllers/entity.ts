
import { Request, Response } from "express";
import mongoose from "mongoose";
import { getEntityModel } from "../models/tenant/Entity";

export const getEntities = async (req: Request, res: Response) => {
    try {
        if (!req.tenantDB) {
            return res.status(500).json({ error: "Tenant connection not available" });
        }

        const Entity = getEntityModel(req.tenantDB);

        // Support filtering by vendor_type or other fields via query params
        const filter: any = {};
        if (req.query.vendor_type) {
            filter.vendor_type = req.query.vendor_type;
        }
        if (req.query.legal_class) {
            filter.legal_class = req.query.legal_class;
        }
        if (req.query.entity_classes) {
            filter.entity_classes = { $in: [req.query.entity_classes] };
        }
        if (req.query.name) {
            filter.name = { $regex: new RegExp(req.query.name as string, 'i') };
        }
        if (req.query.q) {
            filter.name = { $regex: new RegExp(req.query.q as string, 'i') };
        }

        const docs = await Entity.find(filter).sort({ createdAt: -1 }).lean();

        const normalized = docs.map((d: any) => ({
            _id: d._id.toString(),
            company_id: d.company_id,
            name: d.name,
            entity_classes: d.entity_classes,
            legal_class: d.legal_class,
            business_type: d.business_type,
            vendor_type: d.vendor_type,
            identifiers: d.identifiers,
            contact: d.contact,
            is_active: d.is_active,
            createdAt: d.createdAt,
            updatedAt: d.updatedAt
        }));

        return res.json(normalized);
    } catch (err) {
        console.error("GET /entities error:", err);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};

export const getProviders = async (req: Request, res: Response) => {
    try {
        if (!req.tenantDB) {
            return res.status(500).json({ error: "Tenant connection not available" });
        }

        const Entity = getEntityModel(req.tenantDB);

        // Filter for providers
        // We look for vendor_type "Proveedor" or "provider" or entity_classes containing "provider" or "vendor"
        const baseFilter = {
            $or: [
                { vendor_type: { $regex: /proveedor|provider|supplier|vendor/i } },
                { entity_classes: { $in: [/^provider$/i, /^vendor$/i, /^supplier$/i] } }
            ]
        };

        let filter: any = baseFilter;
        if (req.query.name) {
            filter = {
                $and: [
                    baseFilter,
                    { name: { $regex: new RegExp(req.query.name as string, 'i') } }
                ]
            };
        } else if (req.query.q) {
            filter = {
                $and: [
                    baseFilter,
                    { name: { $regex: new RegExp(req.query.q as string, 'i') } }
                ]
            };
        }

        const docs = await Entity.find(filter).sort({ name: 1 }).lean();

        const normalized = docs.map((d: any) => ({
            _id: d._id.toString(),
            company_id: d.company_id,
            name: d.name,
            entity_classes: d.entity_classes,
            legal_class: d.legal_class,
            business_type: d.business_type,
            vendor_type: d.vendor_type,
            identifiers: d.identifiers,
            contact: d.contact,
            is_active: d.is_active,
            createdAt: d.createdAt,
            updatedAt: d.updatedAt
        }));

        return res.json(normalized);
    } catch (err) {
        console.error("GET /entities/providers error:", err);
        return res.status(500).json({ error: "Error fetching providers" });
    }
};

export const createEntity = async (req: Request, res: Response) => {
    try {
        if (!req.tenantDB) {
            return res.status(500).json({ error: "Tenant connection not available" });
        }

        const Entity = getEntityModel(req.tenantDB);
        const data = req.body;

        if (data.vendor_type) {
            const lower = String(data.vendor_type).toLowerCase();
            if (lower.includes('proveedor') || lower.includes('provider')) data.vendor_type = 'provider';
            else if (lower.includes('supplier')) data.vendor_type = 'supplier';
            else if (lower.includes('vendor')) data.vendor_type = 'vendor';
            else data.vendor_type = 'provider'; // default fallback for unrecognized, or leave as is if we shouldn't overwrite? Let's leave if unrecognized but schema limits to enum.
        }

        const newEntity = new Entity(data);
        const doc = await newEntity.save();

        return res.status(201).json(doc);
    } catch (err) {
        console.error("POST /entities error:", err);
        return res.status(500).json({ error: "Error saving entity" });
    }
};

export const getEntityById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: "Invalid entity ID" });
        }

        if (!req.tenantDB) {
            return res.status(500).json({ error: "Tenant connection not available" });
        }

        const Entity = getEntityModel(req.tenantDB);
        const doc = await Entity.findById(id).lean();

        if (!doc) {
            return res.status(404).json({ error: "Entity not found" });
        }

        return res.json({
            ...doc,
            _id: doc._id.toString()
        });
    } catch (err) {
        console.error("GET /entities/:id error:", err);
        return res.status(500).json({ error: "Error getting entity" });
    }
};

export const updateEntity = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: "Invalid entity ID" });
        }

        if (!req.tenantDB) {
            return res.status(500).json({ error: "Tenant connection not available" });
        }

        const Entity = getEntityModel(req.tenantDB);
        const data = req.body;

        if (data.vendor_type) {
            const lower = String(data.vendor_type).toLowerCase();
            if (lower.includes('proveedor') || lower.includes('provider')) data.vendor_type = 'provider';
            else if (lower.includes('supplier')) data.vendor_type = 'supplier';
            else if (lower.includes('vendor')) data.vendor_type = 'vendor';
        }

        const updated = await Entity.findByIdAndUpdate(
            id,
            { $set: req.body },
            { new: true, runValidators: true }
        );

        if (!updated) {
            return res.status(404).json({ error: "Entity not found" });
        }

        return res.json(updated);
    } catch (err) {
        console.error("PUT /entities/:id error:", err);
        return res.status(500).json({ error: "Error updating entity" });
    }
};

export const deleteEntity = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: "Invalid entity ID" });
        }

        if (!req.tenantDB) {
            return res.status(500).json({ error: "Tenant connection not available" });
        }

        const Entity = getEntityModel(req.tenantDB);

        const deleted = await Entity.findByIdAndDelete(id);
        if (!deleted) {
            return res.status(404).json({ error: "Entity not found" });
        }

        return res.json({ ok: true, message: "Entity deleted successfully" });
    } catch (err) {
        console.error("DELETE /entities/:id error:", err);
        return res.status(500).json({ error: "Error deleting entity" });
    }
};

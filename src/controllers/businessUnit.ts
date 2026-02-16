
import { Request, Response } from "express";
import mongoose from "mongoose";
import { getBusinessUnitModel } from "../models/tenant/BusinessUnit";
import { getUserModel } from "../models/system/User";

export const getBusinessUnits = async (req: Request, res: Response) => {
    try {
        if (!req.tenantDB) {
            return res.status(500).json({ error: "Tenant connection not available" });
        }

        const BusinessUnit = getBusinessUnitModel(req.tenantDB);
        const User = await getUserModel();

        const filter: any = {};
        if (req.query.isActive) {
            filter.isActive = req.query.isActive === 'true';
        }

        const docs = await BusinessUnit.find(filter)
            .populate({ path: 'admin_id', model: User, select: 'email name avatar' }) // Populate admin details if needed
            .sort({ createdAt: -1 })
            .lean();

        const normalized = docs.map((d: any) => ({
            ...d,
            _id: d._id.toString()
        }));

        return res.json(normalized);
    } catch (err) {
        console.error("GET /business-units error:", err);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};

export const createBusinessUnit = async (req: Request, res: Response) => {
    try {
        if (!req.tenantDB) {
            return res.status(500).json({ error: "Tenant connection not available" });
        }

        const BusinessUnit = getBusinessUnitModel(req.tenantDB);
        const data = req.body;

        // Resolve adminEmail to admin_id
        if (data.adminEmail) {
            const User = await getUserModel();
            const adminUser = await User.findOne({ email: data.adminEmail });

            if (!adminUser) {
                return res.status(404).json({ error: `Admin user with email ${data.adminEmail} not found` });
            }

            data.admin_id = adminUser._id;
        }

        const newBusinessUnit = new BusinessUnit(data);
        const doc = await newBusinessUnit.save();

        return res.status(201).json(doc);
    } catch (err) {
        console.error("POST /business-units error:", err);
        return res.status(500).json({ error: "Error saving business unit" });
    }
};

export const getBusinessUnitById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: "Invalid business unit ID" });
        }

        if (!req.tenantDB) {
            return res.status(500).json({ error: "Tenant connection not available" });
        }

        const BusinessUnit = getBusinessUnitModel(req.tenantDB);
        const User = await getUserModel();
        const doc = await BusinessUnit.findById(id)
            .populate({ path: 'admin_id', model: User, select: 'email name avatar' })
            .lean();

        if (!doc) {
            return res.status(404).json({ error: "Business unit not found" });
        }

        return res.json({
            ...doc,
            _id: doc._id.toString()
        });
    } catch (err) {
        console.error("GET /business-units/:id error:", err);
        return res.status(500).json({ error: "Error getting business unit" });
    }
};

export const updateBusinessUnit = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: "Invalid business unit ID" });
        }

        if (!req.tenantDB) {
            return res.status(500).json({ error: "Tenant connection not available" });
        }

        const BusinessUnit = getBusinessUnitModel(req.tenantDB);
        const data = req.body;

        // Resolve adminEmail to admin_id
        if (data.adminEmail) {
            const User = await getUserModel();
            const adminUser = await User.findOne({ email: data.adminEmail });

            if (!adminUser) {
                return res.status(404).json({ error: `Admin user with email ${data.adminEmail} not found` });
            }

            data.admin_id = adminUser._id;
        }

        const updated = await BusinessUnit.findByIdAndUpdate(
            id,
            { $set: data },
            { new: true, runValidators: true }
        );

        if (!updated) {
            return res.status(404).json({ error: "Business unit not found" });
        }

        return res.json(updated);
    } catch (err) {
        console.error("PUT /business-units/:id error:", err);
        return res.status(500).json({ error: "Error updating business unit" });
    }
};

export const deleteBusinessUnit = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: "Invalid business unit ID" });
        }

        if (!req.tenantDB) {
            return res.status(500).json({ error: "Tenant connection not available" });
        }

        const BusinessUnit = getBusinessUnitModel(req.tenantDB);

        const deleted = await BusinessUnit.findByIdAndDelete(id);
        if (!deleted) {
            return res.status(404).json({ error: "Business unit not found" });
        }

        return res.json({ ok: true, message: "Business unit deleted successfully" });
    } catch (err) {
        console.error("DELETE /business-units/:id error:", err);
        return res.status(500).json({ error: "Error deleting business unit" });
    }
};

import { Request, Response } from "express";
import mongoose from "mongoose";
import { getProjectModel } from "../models/tenant/Project";

export const getProjects = async (req: Request, res: Response) => {
    try {
        if (!req.tenantDB) {
            return res.status(500).json({ error: "Tenant connection not available" });
        }

        const Project = getProjectModel(req.tenantDB);

        const filter: any = {};
        if (req.query.status) {
            filter.status = req.query.status;
        }

        const docs = await Project.find(filter).sort({ createdAt: -1 }).lean();

        const normalized = docs.map((d: any) => ({
            ...d,
            _id: d._id.toString()
        }));

        return res.json(normalized);
    } catch (err) {
        console.error("GET /projects error:", err);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};

export const createProject = async (req: Request, res: Response) => {
    try {
        if (!req.tenantDB) {
            return res.status(500).json({ error: "Tenant connection not available" });
        }

        const Project = getProjectModel(req.tenantDB);
        const data = req.body;

        const newProject = new Project(data);
        const doc = await newProject.save();

        return res.status(201).json(doc);
    } catch (err) {
        console.error("POST /projects error:", err);
        return res.status(500).json({ error: "Error saving project" });
    }
};

export const getProjectById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: "Invalid project ID" });
        }

        if (!req.tenantDB) {
            return res.status(500).json({ error: "Tenant connection not available" });
        }

        const Project = getProjectModel(req.tenantDB);
        const doc = await Project.findById(id).lean();

        if (!doc) {
            return res.status(404).json({ error: "Project not found" });
        }

        return res.json({
            ...doc,
            _id: doc._id.toString()
        });
    } catch (err) {
        console.error("GET /projects/:id error:", err);
        return res.status(500).json({ error: "Error getting project" });
    }
};

export const updateProject = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: "Invalid project ID" });
        }

        if (!req.tenantDB) {
            return res.status(500).json({ error: "Tenant connection not available" });
        }

        const Project = getProjectModel(req.tenantDB);

        const updated = await Project.findByIdAndUpdate(
            id,
            { $set: req.body },
            { new: true, runValidators: true }
        );

        if (!updated) {
            return res.status(404).json({ error: "Project not found" });
        }

        return res.json(updated);
    } catch (err) {
        console.error("PUT /projects/:id error:", err);
        return res.status(500).json({ error: "Error updating project" });
    }
};

export const deleteProject = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: "Invalid project ID" });
        }

        if (!req.tenantDB) {
            return res.status(500).json({ error: "Tenant connection not available" });
        }

        const Project = getProjectModel(req.tenantDB);

        const deleted = await Project.findByIdAndDelete(id);
        if (!deleted) {
            return res.status(404).json({ error: "Project not found" });
        }

        return res.json({ ok: true, message: "Project deleted successfully" });
    } catch (err) {
        console.error("DELETE /projects/:id error:", err);
        return res.status(500).json({ error: "Error deleting project" });
    }
};

// src/controllers/permissions.ts
import { Request, Response } from "express";
import getPermissionModel from "../models/system/Permission";

/**
 * GET /api/permissions
 * List all permissions
 */
export async function listPermissions(req: Request, res: Response) {
    try {
        const Permission = await getPermissionModel();
        const permissions = await Permission.find({ status: "active" }).sort({ name: 1 });

        return res.json({
            success: true,
            count: permissions.length,
            permissions: permissions.map((p) => ({
                id: p._id,
                name: p.name,
                description: p.description,
                status: p.status,
                createdAt: p.createdAt,
                updatedAt: p.updatedAt,
            })),
        });
    } catch (error: any) {
        console.error("Error listing permissions:", error);
        return res.status(500).json({
            error: "Failed to list permissions",
            details: error.message,
        });
    }
}

/**
 * GET /api/permissions/:id
 * Get a single permission by ID
 */
export async function getPermissionById(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const Permission = await getPermissionModel();

        const permission = await Permission.findById(id);

        if (!permission) {
            return res.status(404).json({ error: "Permission not found" });
        }

        return res.json({
            success: true,
            permission: {
                id: permission._id,
                name: permission.name,
                description: permission.description,
                status: permission.status,
                createdAt: permission.createdAt,
                updatedAt: permission.updatedAt,
            },
        });
    } catch (error: any) {
        console.error("Error getting permission:", error);
        return res.status(500).json({
            error: "Failed to get permission",
            details: error.message,
        });
    }
}

/**
 * POST /api/permissions
 * Create a new permission
 * Body: { name, description? }
 */
export async function createPermission(req: Request, res: Response) {
    try {
        const { name, description } = req.body;

        if (!name) {
            return res.status(400).json({ error: "Permission name is required" });
        }

        const Permission = await getPermissionModel();

        // Check if permission name already exists
        const existing = await Permission.findOne({ name });
        if (existing) {
            return res.status(409).json({ error: "Permission name already exists" });
        }

        const permission = await Permission.create({
            name: name.toLowerCase().trim(),
            description: description || null,
            status: "active",
        });

        return res.status(201).json({
            success: true,
            message: "Permission created successfully",
            permission: {
                id: permission._id,
                name: permission.name,
                description: permission.description,
                status: permission.status,
            },
        });
    } catch (error: any) {
        console.error("Error creating permission:", error);
        return res.status(500).json({
            error: "Failed to create permission",
            details: error.message,
        });
    }
}

/**
 * PUT /api/permissions/:id
 * Update an existing permission
 * Body: { name?, description?, status? }
 */
export async function updatePermission(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const { name, description, status } = req.body;

        const Permission = await getPermissionModel();
        const permission = await Permission.findById(id);

        if (!permission) {
            return res.status(404).json({ error: "Permission not found" });
        }

        // Check if new name conflicts with existing permission
        if (name && name !== permission.name) {
            const existing = await Permission.findOne({ name, _id: { $ne: id } });
            if (existing) {
                return res.status(409).json({ error: "Permission name already exists" });
            }
            permission.name = name.toLowerCase().trim();
        }

        if (description !== undefined) permission.description = description;
        if (status) permission.status = status;

        await permission.save();

        return res.json({
            success: true,
            message: "Permission updated successfully",
            permission: {
                id: permission._id,
                name: permission.name,
                description: permission.description,
                status: permission.status,
            },
        });
    } catch (error: any) {
        console.error("Error updating permission:", error);
        return res.status(500).json({
            error: "Failed to update permission",
            details: error.message,
        });
    }
}

/**
 * DELETE /api/permissions/:id
 * Delete a permission (soft delete - set status to inactive)
 */
export async function deletePermission(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const Permission = await getPermissionModel();

        const permission = await Permission.findById(id);

        if (!permission) {
            return res.status(404).json({ error: "Permission not found" });
        }

        permission.status = "inactive";
        await permission.save();

        return res.json({
            success: true,
            message: "Permission deleted successfully",
        });
    } catch (error: any) {
        console.error("Error deleting permission:", error);
        return res.status(500).json({
            error: "Failed to delete permission",
            details: error.message,
        });
    }
}

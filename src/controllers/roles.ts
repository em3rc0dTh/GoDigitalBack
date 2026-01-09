// src/controllers/roles.ts
import { Request, Response } from "express";
import getRolesModel from "../models/system/Roles";
import getPermissionModel from "../models/system/Permission";

/**
 * GET /api/roles
 * List all roles
 */
export async function listRoles(req: Request, res: Response) {
    try {
        const Role = await getRolesModel();
        const roles = await Role.find({ status: "active" }).sort({ name: 1 });

        return res.json({
            success: true,
            count: roles.length,
            roles: roles.map((r) => ({
                id: r._id,
                name: r.name,
                description: r.description,
                permissions: r.permissions,
                status: r.status,
                createdAt: r.createdAt,
                updatedAt: r.updatedAt,
            })),
        });
    } catch (error: any) {
        console.error("Error listing roles:", error);
        return res.status(500).json({
            error: "Failed to list roles",
            details: error.message,
        });
    }
}

/**
 * GET /api/roles/:id
 * Get a single role by ID
 */
export async function getRoleById(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const Role = await getRolesModel();

        const role = await Role.findById(id);

        if (!role) {
            return res.status(404).json({ error: "Role not found" });
        }

        return res.json({
            success: true,
            role: {
                id: role._id,
                name: role.name,
                description: role.description,
                permissions: role.permissions,
                status: role.status,
                createdAt: role.createdAt,
                updatedAt: role.updatedAt,
            },
        });
    } catch (error: any) {
        console.error("Error getting role:", error);
        return res.status(500).json({
            error: "Failed to get role",
            details: error.message,
        });
    }
}

/**
 * POST /api/roles
 * Create a new role
 * Body: { name, description?, permissions? }
 */
export async function createRole(req: Request, res: Response) {
    try {
        const { name, description, permissions } = req.body;

        if (!name) {
            return res.status(400).json({ error: "Role name is required" });
        }

        const Role = await getRolesModel();

        // Check if role name already exists
        const existing = await Role.findOne({ name });
        if (existing) {
            return res.status(409).json({ error: "Role name already exists" });
        }

        // Validate permissions exist
        if (permissions && Array.isArray(permissions)) {
            const Permission = await getPermissionModel();
            const validPermissions = await Permission.find({
                name: { $in: permissions },
            });

            if (validPermissions.length !== permissions.length) {
                return res.status(400).json({
                    error: "Some permissions do not exist",
                });
            }
        }

        const role = await Role.create({
            name: name.toLowerCase().trim(),
            description: description || null,
            permissions: permissions || [],
            status: "active",
        });

        return res.status(201).json({
            success: true,
            message: "Role created successfully",
            role: {
                id: role._id,
                name: role.name,
                description: role.description,
                permissions: role.permissions,
                status: role.status,
            },
        });
    } catch (error: any) {
        console.error("Error creating role:", error);
        return res.status(500).json({
            error: "Failed to create role",
            details: error.message,
        });
    }
}

/**
 * PUT /api/roles/:id
 * Update an existing role
 * Body: { name?, description?, permissions?, status? }
 */
export async function updateRole(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const { name, description, permissions, status } = req.body;

        const Role = await getRolesModel();
        const role = await Role.findById(id);

        if (!role) {
            return res.status(404).json({ error: "Role not found" });
        }

        // Check if new name conflicts with existing role
        if (name && name !== role.name) {
            const existing = await Role.findOne({ name, _id: { $ne: id } });
            if (existing) {
                return res.status(409).json({ error: "Role name already exists" });
            }
            role.name = name.toLowerCase().trim();
        }

        // Validate permissions
        if (permissions && Array.isArray(permissions)) {
            const Permission = await getPermissionModel();
            const validPermissions = await Permission.find({
                name: { $in: permissions },
            });

            if (validPermissions.length !== permissions.length) {
                return res.status(400).json({
                    error: "Some permissions do not exist",
                });
            }
            role.permissions = permissions;
        }

        if (description !== undefined) role.description = description;
        if (status) role.status = status;

        await role.save();

        return res.json({
            success: true,
            message: "Role updated successfully",
            role: {
                id: role._id,
                name: role.name,
                description: role.description,
                permissions: role.permissions,
                status: role.status,
            },
        });
    } catch (error: any) {
        console.error("Error updating role:", error);
        return res.status(500).json({
            error: "Failed to update role",
            details: error.message,
        });
    }
}

/**
 * DELETE /api/roles/:id
 * Delete a role (soft delete - set status to inactive)
 */
export async function deleteRole(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const Role = await getRolesModel();

        const role = await Role.findById(id);

        if (!role) {
            return res.status(404).json({ error: "Role not found" });
        }

        // Prevent deletion of system roles
        if (["superadmin", "admin", "standard"].includes(role.name)) {
            return res.status(403).json({
                error: "Cannot delete system roles",
            });
        }

        role.status = "inactive";
        await role.save();

        return res.json({
            success: true,
            message: "Role deleted successfully",
        });
    } catch (error: any) {
        console.error("Error deleting role:", error);
        return res.status(500).json({
            error: "Failed to delete role",
            details: error.message,
        });
    }
}

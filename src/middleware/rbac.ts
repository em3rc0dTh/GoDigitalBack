import { Request, Response, NextFunction } from "express";
import getRolesModel from "../models/system/Roles";

/**
 * Middleware to check if the current user has the required permission.
 * Assumes req.role is populated by tenantContext.
 */
export const checkPermission = (permission: string) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { role: roleName } = req;

            if (!roleName) {
                return res.status(401).json({ error: "No role found in request context" });
            }

            // Superadmin bypasses everything
            if (roleName === "superadmin") {
                return next();
            }

            const Role = await getRolesModel();
            const role = await Role.findOne({ name: roleName, status: "active" });

            if (!role) {
                return res.status(403).json({ error: "Role not found or inactive" });
            }

            // Check if permission exists in role
            // Handling the "*" wildcard for safety, although superadmin check is separate
            if (role.permissions.includes("*") || role.permissions.includes(permission)) {
                return next();
            }

            return res.status(403).json({ 
                error: "Insufficient permissions", 
                required: permission 
            });

        } catch (error) {
            console.error("RBAC Middleware Error:", error);
            return res.status(500).json({ error: "Internal authorization error" });
        }
    };
};

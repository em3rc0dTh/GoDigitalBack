// src/config/seedRolesAndPermissions.ts
import getPermissionModel from "../models/system/Permission";
import getRolesModel from "../models/system/Roles";

/**
 * Seed default permissions and roles into System DB
 */
export async function seedRolesAndPermissions() {
    try {
        const Permission = await getPermissionModel();
        const Role = await getRolesModel();

        // ============================================
        // PERMISSIONS
        // ============================================
        const defaultPermissions = [
            { name: "users:read", description: "View users" },
            { name: "users:write", description: "Create and edit users" },
            { name: "users:delete", description: "Delete users" },
            { name: "roles:read", description: "View roles" },
            { name: "roles:write", description: "Create and edit roles" },
            { name: "accounts:read", description: "View accounts" },
            { name: "accounts:write", description: "Create and edit accounts" },
            { name: "accounts:delete", description: "Delete accounts" },
            { name: "transactions:read", description: "View transactions" },
            { name: "transactions:write", description: "Create and edit transactions" },
            { name: "tenants:read", description: "View tenant information" },
            { name: "tenants:write", description: "Edit tenant information" },
            { name: "tenants:provision", description: "Provision new databases" },
        ];

        for (const perm of defaultPermissions) {
            await Permission.findOneAndUpdate(
                { name: perm.name },
                { $set: perm },
                { upsert: true, new: true }
            );
        }

        console.log(`✅ Seeded ${defaultPermissions.length} permissions`);

        // ============================================
        // ROLES
        // ============================================
        const defaultRoles = [
            {
                name: "superadmin",
                description: "Super administrator with full system access",
                permissions: [
                    "users:read",
                    "users:write",
                    "users:delete",
                    "roles:read",
                    "roles:write",
                    "accounts:read",
                    "accounts:write",
                    "accounts:delete",
                    "transactions:read",
                    "transactions:write",
                    "tenants:read",
                    "tenants:write",
                    "tenants:provision",
                ],
            },
            {
                name: "admin",
                description: "Administrator with most permissions",
                permissions: [
                    "users:read",
                    "users:write",
                    "roles:read",
                    "accounts:read",
                    "accounts:write",
                    "accounts:delete",
                    "transactions:read",
                    "transactions:write",
                    "tenants:read",
                    "tenants:write",
                ],
            },
            {
                name: "standard",
                description: "Standard user with basic read access",
                permissions: [
                    "accounts:read",
                    "transactions:read",
                ],
            },
        ];

        for (const role of defaultRoles) {
            await Role.findOneAndUpdate(
                { name: role.name },
                { $set: role },
                { upsert: true, new: true }
            );
        }

        console.log(`✅ Seeded ${defaultRoles.length} roles (superadmin, admin, standard)`);
    } catch (error) {
        console.error("❌ Error seeding roles and permissions:", error);
        throw error;
    }
}

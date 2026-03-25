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
            // Governance
            { name: "members:view", description: "View workspace members" },
            { name: "members:manage", description: "Invite, update or remove members" },
            { name: "roles:view", description: "View roles and permissions" },
            { name: "roles:manage", description: "Create or modify roles" },
            { name: "tenant:view", description: "View tenant settings" },
            { name: "tenant:manage", description: "Modify tenant settings" },
            
            // Finance
            { name: "accounts:view", description: "View bank accounts" },
            { name: "accounts:manage", description: "Create or modify bank accounts" },
            { name: "banks:ingest", description: "Ingest bank statements" },
            { name: "banks:view_raw", description: "View raw bank data" },
            { name: "reco:manage", description: "Manage reconciliation (RECO)" },
            
            // Projects
            { name: "projects:view", description: "View projects" },
            { name: "projects:manage", description: "Create or modify projects" },
            { name: "budgets:view", description: "View budgets" },
            { name: "budgets:manage", description: "Create or modify budgets" },
            
            // Operations
            { name: "payment_req:view", description: "View payment/expense requests" },
            { name: "payment_req:create", description: "Create payment/expense requests" },
            { name: "payment_req:authorize", description: "Authorize payment/expense requests" },
            { name: "payment_req:pay", description: "Execute payments (mark as paid)" },
            { name: "proof:upload", description: "Upload proof of payment" },
            { name: "proof:review", description: "Review and check proof of payment" },
            
            // General
            { name: "entities:view", description: "View vendors and customers" },
            { name: "entities:manage", description: "Manage vendors and customers" },
            { name: "audit:view", description: "View audit logs" }
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
                description: "Full system access and multi-tenancy management",
                permissions: ["*"],
                status: "active"
            },
            {
                name: "admin",
                description: "Company administrator with financial authorization power",
                permissions: [
                    "members:view", "members:manage",
                    "roles:view", "roles:manage",
                    "tenant:view", "tenant:manage",
                    "accounts:view", "accounts:manage",
                    "banks:view_raw", "banks:ingest",
                    "projects:view", "projects:manage",
                    "budgets:view", "budgets:manage",
                    "payment_req:view", "payment_req:create", "payment_req:authorize",
                    "proof:upload", "entities:view", "entities:manage", "reco:manage", "audit:view"
                ],
                status: "active"
            },
            {
                name: "treasurer",
                description: "Treasury management, payments, and reconciliation",
                permissions: [
                    "members:view", "tenant:view",
                    "accounts:view", "accounts:manage",
                    "banks:view_raw", "banks:ingest",
                    "projects:view", "budgets:view",
                    "payment_req:view", "payment_req:create", "payment_req:pay",
                    "proof:upload", "proof:review",
                    "entities:view", "entities:manage", "reco:manage"
                ],
                status: "active"
            },
            {
                name: "standard",
                description: "Operational user for requests and expense reports",
                permissions: [
                    "tenant:view",
                    "accounts:view",
                    "projects:view",
                    "payment_req:view", "payment_req:create",
                    "proof:upload",
                    "entities:view"
                ],
                status: "active"
            }
        ];

        for (const role of defaultRoles) {
            console.log(`⏳ Seeding role: ${role.name}...`);
            await Role.findOneAndUpdate(
                { name: role.name },
                { $set: role },
                { upsert: true, new: true }
            );
            console.log(`✅ Role ${role.name} seeded with ${role.permissions.length} permissions`);
        }

        console.log(`✅ Seeded ${defaultRoles.length} roles (superadmin, admin, treasurer, standard)`);
    } catch (error) {
        console.error("❌ Error seeding roles and permissions:", error);
        throw error;
    }
}

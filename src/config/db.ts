// src/config/db.ts
import { getSystemDB } from "./tenantDb";
import { seedRolesAndPermissions } from "./seedRolesAndPermissions";

export async function connectDB() {
    try {
        const systemDB = await getSystemDB();
        console.log("✅ System Database connected successfully");

        // Seed default roles and permissions
        await seedRolesAndPermissions();
    } catch (err) {
        console.error("❌ Failed to connect to System Database:", err);
        process.exit(1);
    }
}
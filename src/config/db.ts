// src/config/db.ts
import { getSystemDB } from "./tenantDb";

/**
 * Conecta al System Database
 * Las conexiones a Tenant DBs se manejan dinámicamente
 */
export async function connectDB() {
    try {
        await getSystemDB();
        console.log("✅ System Database connected successfully");
    } catch (err) {
        console.error("❌ Failed to connect to System Database:", err);
        process.exit(1);
    }
}
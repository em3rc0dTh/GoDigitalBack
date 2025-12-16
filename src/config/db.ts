// src/config/db.ts
import { getSystemDB } from "./tenantDb";

export async function connectDB() {
    try {
        const systemDB = await getSystemDB();
        console.log("✅ System Database connected successfully");
    } catch (err) {
        console.error("❌ Failed to connect to System Database:", err);
        process.exit(1);
    }
}
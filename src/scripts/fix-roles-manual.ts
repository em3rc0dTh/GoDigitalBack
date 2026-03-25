
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const SYSTEM_DB_URI = process.env.SYSTEM_DB_URI || "mongodb://127.0.0.1:27017/system";

async function fixRoles() {
    try {
        console.log("Connecting to:", SYSTEM_DB_URI);
        const connection = await mongoose.createConnection(SYSTEM_DB_URI).asPromise();
        console.log("Connected to System DB");

        const Role = connection.model("Roles", new mongoose.Schema({
            name: String,
            permissions: [String],
            status: String
        }, { collection: 'roles' })); // The collection name was lowercase in seed script? No, getOrCreateModel usually uses the name provided. 
        
        // Wait, let's check the collection name. In Roles.ts it says getOrCreateModel(systemDB, "Roles", RolesSchema);
        // Mongoose pluralizes "Roles" to "roles" or "roles" usually.

        const standardRole = await Role.findOne({ name: "standard" });
        if (!standardRole) {
            console.log("Standard role not found!");
        } else {
            console.log("Current standard permissions:", standardRole.permissions);
            const newPermissions = Array.from(new Set([...standardRole.permissions, "tenant:view", "accounts:view", "projects:view"]));
            standardRole.permissions = newPermissions;
            await standardRole.save();
            console.log("Updated standard permissions:", standardRole.permissions);
        }

        await connection.close();
        console.log("Done");
    } catch (err) {
        console.error("Error:", err);
    }
}

fixRoles();

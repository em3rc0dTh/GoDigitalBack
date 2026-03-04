import mongoose, { Document, Model } from "mongoose";

// === PERMISSIONS ===
const ResourcePermissionSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    description: String,
    status: { type: String, default: "active" }
}, { _id: false }); // Schema says name is PK, so we can disable auto _id or keep it. Mongoose likes _id. keeping default.

// === ROLES ===
const ResourceRoleSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    description: String,
    permissions: [{ type: String }], // Array of permission names
    status: { type: String, default: "active" }
});

export function getResourceRoleModel(connection: mongoose.Connection) {
    return connection.model("ResourceRole", ResourceRoleSchema);
}

export function getResourcePermissionModel(connection: mongoose.Connection) {
    return connection.model("ResourcePermission", ResourcePermissionSchema);
}

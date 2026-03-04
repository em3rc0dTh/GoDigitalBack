// src/models/system/Roles.ts
import mongoose from "mongoose";
import { getSystemDB, getOrCreateModel } from "../../config/tenantDb";

const RolesSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true
    },
    description: {
        type: String,
        default: null
    },
    permissions: {
        type: [mongoose.Schema.Types.Mixed], // Changed from ObjectId to String (name reference)
        ref: "Permission",
        default: []
    },
    status: {
        type: String,
        enum: ["active", "inactive"],
        default: "active"
    },
}, {
    timestamps: true,
    strict: true,
});

RolesSchema.index({ tenantId: 1, name: 1 });

export async function getRolesModel() {
    const systemDB = await getSystemDB();
    return getOrCreateModel(systemDB, "Roles", RolesSchema);
}

export default getRolesModel;

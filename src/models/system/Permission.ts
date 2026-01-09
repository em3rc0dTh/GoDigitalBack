// src/models/system/Permission.ts
import mongoose from "mongoose";
import { getSystemDB, getOrCreateModel } from "../../config/tenantDb";

const PermissionSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true
    },
    description: {
        type: String,
        default: null
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

PermissionSchema.index({ name: 1 });

export async function getPermissionModel() {
    const systemDB = await getSystemDB();
    return getOrCreateModel(systemDB, "Permission", PermissionSchema);
}

export default getPermissionModel;

// src/models/system/User.ts
import mongoose from "mongoose";
import { getSystemDB, getOrCreateModel } from "../../config/tenantDb";

const UserSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    fullName: { type: String, required: true },
    status: {
        type: String,
        enum: ["active", "invited", "suspended"],
        default: "active"
    },
}, {
    timestamps: true,
    strict: true,
    collection: 'users'
});

export async function getUserModel() {
    const systemDB = await getSystemDB();
    return getOrCreateModel(systemDB, "User", UserSchema);
}

export default getUserModel;
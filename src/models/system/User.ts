// src/models/system/User.ts
import mongoose from "mongoose";
import { getSystemDB, getOrCreateModel } from "../../config/tenantDb";

const UserSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true }, // Renamed from fullName
    isActive: { type: Boolean, default: true }, // New field
    googleId: { type: String, unique: true, sparse: true }, // 🆕 Google Login
    avatar: { type: String, default: null }, // 🆕 Profile Picture
    status: {
        type: String,
        enum: ["active", "invited", "suspended"],
        default: "active"
    },
    role: { type: String, default: 'standard' }, // Simple role field as fallback or primary
    emailVerified: { type: Boolean, default: false },
    emailVerificationToken: { type: String, default: null },
    resetPasswordToken: { type: String, default: null },
    resetPasswordExpires: { type: Date, default: null },
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
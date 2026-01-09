// src/models/system/User.ts
import mongoose from "mongoose";
import { getSystemDB, getOrCreateModel } from "../../config/tenantDb";

const UserSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true }, // Renamed from fullName
    isActive: { type: Boolean, default: true }, // New field
    status: {
        type: String,
        enum: ["active", "invited", "suspended"],
        default: "active"
    },
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
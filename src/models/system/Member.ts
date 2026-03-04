// src/models/system/Member.ts
import mongoose from "mongoose";
import { getSystemDB, getOrCreateModel } from "../../config/tenantDb";

const MemberSchema = new mongoose.Schema({
    tenantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Tenant",
        required: true,
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
    },
    role: {
        type: mongoose.Schema.Types.Mixed, // Changed from [String] to String
        ref: "Role",
        required: true,
    },
    permissionsExtra: { // Added permissions_extra
        type: mongoose.Schema.Types.Mixed,
        ref: "Permission",
        default: [],
    },
    status: {
        type: String,
        enum: ["active", "invited", "suspended"],
        default: "active",
    },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    isStandard: {
        type: Boolean,
        default: false,
    },
    resourceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Resource",
        default: null,
    },
}, {
    timestamps: true,
    strict: true,
    collection: 'members'
});

MemberSchema.index({ tenantId: 1, userId: 1 }, { unique: true });

export async function getMemberModel() {
    const systemDB = await getSystemDB();
    return getOrCreateModel(systemDB, "Member", MemberSchema);
}

export default getMemberModel;
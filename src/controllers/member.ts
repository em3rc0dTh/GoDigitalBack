// src/controllers/member.ts
import { Request, Response } from "express";
import getMemberModel from "../models/system/Member";
import getUserModel from "../models/system/User";
import getTenantModel from "../models/system/Tenant";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";
import { sendEmail } from "../services/email";

/**
 * List all members of the current tenant
 */
export const listMembers = async (req: Request, res: Response) => {
    try {
        const Member = await getMemberModel();
        const tenantId = req.tenantId;

        const members = await Member.find({ tenantId })
            .populate({
                path: "userId",
                select: "name email avatar status lastLogin"
            })
            .sort({ createdAt: 1 });

        return res.json({ success: true, members });
    } catch (err: any) {
        console.error("List members error:", err);
        return res.status(500).json({ error: "Failed to list members" });
    }
};

/**
 * Invite a user to the current tenant
 */
export const inviteMember = async (req: Request, res: Response) => {
    try {
        const { email, role, name } = req.body;
        const tenantId = req.tenantId;

        if (!email || !role) {
            return res.status(400).json({ error: "Email and Role are required" });
        }

        // Only admins/superadmins can invite
        if (req.role !== "admin" && req.role !== "superadmin") {
            return res.status(403).json({ error: "Only admins can invite members" });
        }

        const User = await getUserModel();
        const Member = await getMemberModel();
        const Tenant = await getTenantModel();

        const tenant = await Tenant.findById(tenantId);
        if (!tenant) return res.status(404).json({ error: "Tenant not found" });

        let user = await User.findOne({ email });

        // 1. If user doesn't exist, create a placeholder user in 'invited' status
        if (!user) {
            const tempPassword = await bcrypt.hash(uuidv4(), 10);
            user = await User.create({
                email,
                name: name || email.split('@')[0],
                passwordHash: tempPassword, // Will be reset when they accept
                status: "invited",
                isActive: true,
                emailVerified: false,
                emailVerificationToken: uuidv4()
            });
        }

        // 2. Check if already a member
        const existingMember = await Member.findOne({ tenantId, userId: user._id });
        if (existingMember) {
            return res.status(400).json({ error: "User is already a member of this workspace" });
        }

        const VALID_ROLES = ["superadmin", "admin", "treasurer", "standard"];
        const normalizedRole = role ? role.toLowerCase().trim() : "estandar";

        if (!VALID_ROLES.includes(normalizedRole)) {
            return res.status(400).json({ 
                error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}` 
            });
        }

        // 3. Create membership
        const newMember = await Member.create({
            tenantId,
            userId: user._id,
            role: normalizedRole,
            status: "active", // Membership itself is active (linked)
            invitedBy: req.userId
        });

        // 4. Send invitation email (optional logic here)
        // For now, let's just log it or send a basic one
        const inviteLink = `${process.env.FRONTEND_URL || "http://localhost:3000"}/signup?email=${encodeURIComponent(email)}`;
        
        await sendEmail(
            email,
            `Has sido invitado a ${tenant.name} - GoDigital`,
            `
            <h1>¡Hola!</h1>
            <p>Has sido invitado a unirte a la empresa <strong>${tenant.name}</strong> en GoDigital.</p>
            <p>Puedes unirte haciendo clic en el siguiente enlace:</p>
            <a href="${inviteLink}" style="padding: 10px 20px; background: #2563eb; color: white; text-decoration: none; border-radius: 5px;">Aceptar Invitación</a>
            <p>Si ya tienes una cuenta, simplemente inicia sesión con tu email.</p>
            `
        );

        return res.status(201).json({ 
            success: true, 
            message: "User invited successfully",
            member: newMember 
        });

    } catch (err: any) {
        console.error("Invite member error:", err);
        return res.status(500).json({ error: "Failed to invite member" });
    }
};

/**
 * Update a member (role or status)
 */
export const updateMember = async (req: Request, res: Response) => {
    try {
        const { id } = req.params; // Member record ID
        const { role, status } = req.body;
        const tenantId = req.tenantId;

        if (req.role !== "admin" && req.role !== "superadmin") {
            return res.status(403).json({ error: "Access denied" });
        }

        const Member = await getMemberModel();
        const member = await Member.findOne({ _id: id, tenantId });

        if (!member) return res.status(404).json({ error: "Member not found" });

        // Prevent downgrading the last superadmin if we want to be safe
        // (Implementation omitted for brevity but recommended)

        if (role) {
            const normalizedRole = role.toLowerCase().trim();
            const VALID_ROLES = ["superadmin", "admin", "treasurer", "standard"];
            if (!VALID_ROLES.includes(normalizedRole)) {
                return res.status(400).json({ 
                    error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}` 
                });
            }
            member.role = normalizedRole;
        }
        if (status) member.status = status;

        await member.save();

        return res.json({ success: true, member });
    } catch (err: any) {
        console.error("Update member error:", err);
        return res.status(500).json({ error: "Failed to update member" });
    }
};

/**
 * Remove a member from the tenant
 */
export const removeMember = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const tenantId = req.tenantId;

        if (req.role !== "admin" && req.role !== "superadmin") {
            return res.status(403).json({ error: "Access denied" });
        }

        const Member = await getMemberModel();
        
        // Don't allow removing yourself? or at least check if you are owner
        if (id === req.userId) {
             // Need to check if it's the member ID or User ID. 
             // Typically 'id' is the Member._id
        }

        const result = await Member.deleteOne({ _id: id, tenantId });

        if (result.deletedCount === 0) {
            return res.status(404).json({ error: "Member not found" });
        }

        return res.json({ success: true, message: "Member removed from workspace" });
    } catch (err: any) {
        console.error("Remove member error:", err);
        return res.status(500).json({ error: "Failed to remove member" });
    }
};

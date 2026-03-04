
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import getUserModel from "../models/system/User";
import getTenantModel from "../models/system/Tenant";
import getMemberModel from "../models/system/Member";
import getTenantDetailModel from "../models/system/TenantDetail";
import { sendEmail } from "../services/email";
import { getOAuth2Client } from "../services/gmail/auth";

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRES_IN = "7d";
const SALT_ROUNDS = 10;

export class AuthService {

    async login(email: string, password: string): Promise<any> {
        const User = await getUserModel();
        const TenantDetail = await getTenantDetailModel();
        const Member = await getMemberModel();
        // Tenant model is loaded by getMemberModel or not? It was awaited in controller.
        // It's safe to load it if needed, but getMemberModel might not ensure Tenant model is loaded if not imported.
        // Controller imported it explicitly.
        await getTenantModel();

        const user = await User.findOne({ email });
        if (!user) throw new Error("Invalid credentials");

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) throw new Error("Invalid credentials");

        if (!user.emailVerified) {
            const error: any = new Error("Please verify your email address before logging in");
            error.code = "EMAIL_NOT_VERIFIED";
            error.email = user.email;
            throw error;
        }

        const members = await Member.find({ userId: user._id, status: "active" }).populate("tenantId");

        const workspaces = await Promise.all(
            members.map(async (m: any) => {
                const tenant = m.tenantId;
                const details = await TenantDetail.find({ _id: { $in: tenant.dbList } }).select('dbName country entityType');
                return {
                    tenantId: tenant._id.toString(),
                    name: tenant.name,
                    role: m.role,
                    databases: details.map((d: any) => ({
                        id: d._id.toString(),
                        dbName: d.dbName,
                        country: d.country,
                        entityType: d.entityType,
                    })),
                    hasDatabase: details.length > 0,
                };
            })
        );

        if (workspaces.length === 0) throw new Error("No active workspace found for this user");
        const primaryWorkspace = workspaces[0];

        const token = jwt.sign(
            { userId: user._id.toString(), tenantId: primaryWorkspace.tenantId, email: user.email, fullName: user.name, role: primaryWorkspace.role },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        return {
            user: { email: user.email, name: user.name, role: primaryWorkspace.role, token },
            workspaces,
            token
        };
    }

    async signup(email: string, password: string, fullName: string) {
        const User = await getUserModel();
        const Tenant = await getTenantModel();
        const Member = await getMemberModel();

        if (await User.findOne({ email })) throw new Error("User already exists");

        const tenant = await Tenant.create({ name: `Workspace of ${fullName}`, ownerEmail: email, dbList: [] });
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
        const verificationToken = uuidv4();

        const user = await User.create({
            email,
            passwordHash,
            name: fullName,
            isActive: true,
            status: "active",
            emailVerified: false,
            emailVerificationToken: verificationToken
        });

        await Member.create({
            tenantId: tenant._id, userId: user._id, role: "superadmin", status: "active",
        });

        const verificationLink = `${process.env.FRONTEND_URL || "http://localhost:3000"}/verify-email?token=${verificationToken}`;

        await sendEmail(
            email,
            "Confirm Your Email - GoDigital",
            this.getVerificationEmailTemplate(fullName, verificationLink)
        );

        return { email: user.email };
    }

    async forgotPassword(email: string) {
        const User = await getUserModel();
        const user = await User.findOne({ email });

        if (!user) return { success: true }; // Security

        const token = uuidv4();
        const expires = new Date(Date.now() + 600000); // 1 hour

        user.resetPasswordToken = token;
        user.resetPasswordExpires = expires;
        await user.save();

        const resetLink = `${process.env.FRONTEND_URL || "http://localhost:3000"}/reset-password?token=${token}`;

        await sendEmail(
            email,
            "Password Reset Request",
            this.getPasswordResetEmailTemplate(resetLink)
        );

        return { success: true };
    }

    async resetPassword(token: string, newPassword: string) {
        const User = await getUserModel();
        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) throw new Error("Invalid or expired token");

        user.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
        user.resetPasswordToken = null;
        user.resetPasswordExpires = null;
        await user.save();

        return { success: true };
    }

    async verifyEmail(token: string) {
        const User = await getUserModel();
        const Member = await getMemberModel();
        const TenantDetail = await getTenantDetailModel();
        await getTenantModel();

        const user = await User.findOne({ emailVerificationToken: token });

        if (!user) throw new Error("Invalid or expired verification token");
        if (user.emailVerified) throw new Error("Email already verified");

        user.emailVerified = true;
        user.emailVerificationToken = null;
        await user.save();

        await sendEmail(
            user.email,
            "Welcome to GoDigital!",
            this.getWelcomeEmailTemplate(user.name)
        );

        // Generate Session logic duplicated from Login/CreateSession
        // TODO: Extract createSession Logic
        // For now, inline or private helper
        return await this.createSessionForUser(user);
    }

    async resendVerification(email: string) {
        const User = await getUserModel();
        const user = await User.findOne({ email });

        if (!user) return { success: true };
        if (user.emailVerified) throw new Error("Email already verified");

        const verificationToken = uuidv4();
        user.emailVerificationToken = verificationToken;
        await user.save();

        const verificationLink = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;

        await sendEmail(
            email,
            "Confirm Your Email - GoDigital",
            this.getVerificationEmailTemplate(user.name || user.email, verificationLink)
        );

        return { success: true };
    }

    async googleLogin(token: string) {
        const client = getOAuth2Client();
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: process.env.GMAIL_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        if (!payload || !payload.email) throw new Error("Invalid Google token");

        const { email, sub: googleId, picture } = payload;
        const User = await getUserModel();
        const user = await User.findOne({ email });

        if (!user) throw new Error("User not found. Please sign up first.");

        let updated = false;
        if (!user.googleId) {
            user.googleId = googleId;
            updated = true;
        }
        if (!user.avatar && picture) {
            user.avatar = picture;
            updated = true;
        }
        if (updated) await user.save();

        if (!user.isActive) throw new Error("User is suspended");

        return await this.createSessionForUser(user);
    }

    // --- Private Helpers ---

    private async createSessionForUser(user: any) {
        const Member = await getMemberModel();
        const TenantDetail = await getTenantDetailModel();

        const members = await Member.find({ userId: user._id, status: "active" }).populate("tenantId");

        if (members.length === 0) throw new Error("No active workspace found");

        const primaryMember = members[0];
        const tenant = primaryMember.tenantId as any;

        const details = await TenantDetail.find({ _id: { $in: tenant.dbList } }).select('dbName country entityType');

        const workspaces = [{
            tenantId: tenant._id.toString(),
            name: tenant.name,
            role: primaryMember.role,
            databases: details.map((d: any) => ({
                id: d._id.toString(),
                dbName: d.dbName,
                country: d.country,
                entityType: d.entityType,
            })),
            hasDatabase: details.length > 0,
        }];

        const jwtToken = jwt.sign(
            {
                userId: user._id.toString(),
                tenantId: tenant._id.toString(),
                email: user.email,
                fullName: user.name,
                role: primaryMember.role
            },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        return {
            user: { email: user.email, name: user.name, role: primaryMember.role, token: jwtToken },
            workspaces,
            token: jwtToken
        };
    }

    private getVerificationEmailTemplate(name: string, link: string) {
        return `
  <!DOCTYPE html>
  <html lang="en">
    <head><meta charset="UTF-8" /><title>Email Verification</title></head>
    <body style="margin:0; padding:0; background-color:#f4f6f8; font-family:Arial, Helvetica, sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 0;">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:10px; overflow:hidden; box-shadow:0 4px 12px rgba(0,0,0,0.08);">
          <tr><td style="background:#0f172a; padding:24px; text-align:center;"><h1 style="color:#ffffff; margin:0; font-size:24px;">GoDigital</h1></td></tr>
          <tr><td style="padding:32px; color:#1f2937;">
            <h2 style="margin-top:0;">Confirm your email address</h2>
            <p style="font-size:15px; line-height:1.6;">Hi ${name},</p>
            <p style="font-size:15px; line-height:1.6;">Thank you for signing up for GoDigital! Please confirm your email address by clicking the button below.</p>
            <div style="text-align:center; margin:32px 0;"><a href="${link}" style="background:#2563eb; color:#ffffff; padding:14px 28px; text-decoration:none; border-radius:6px; font-weight:bold; display:inline-block;">Verify Email Address</a></div>
            <p style="font-size:14px; color:#4b5563;">If you didn't create an account, you can safely ignore this email.</p>
            <p style="font-size:13px; word-break:break-all; color:#2563eb;"><a href="${link}">Verify Email Address</a></p>
            <hr style="border:none; border-top:1px solid #e5e7eb; margin:32px 0;" />
            <p style="font-size:13px; color:#6b7280;">© ${new Date().getFullYear()} GoDigital. All rights reserved.</p>
          </td></tr>
        </table>
      </td></tr></table>
    </body>
  </html>`;
    }

    private getPasswordResetEmailTemplate(link: string) {
        return `
  <!DOCTYPE html>
  <html lang="en">
    <head><meta charset="UTF-8" /><title>Password Reset</title></head>
    <body style="margin:0; padding:0; background-color:#f4f6f8; font-family:Arial, Helvetica, sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 0;">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:10px; overflow:hidden; box-shadow:0 4px 12px rgba(0,0,0,0.08);">
          <tr><td style="background:#0f172a; padding:24px; text-align:center;"><h1 style="color:#ffffff; margin:0; font-size:24px;">GoDigital</h1></td></tr>
          <tr><td style="padding:32px; color:#1f2937;">
            <h2 style="margin-top:0;">Reset your password</h2>
            <p style="font-size:15px; line-height:1.6;">We received a request to reset your password. Click the button below to create a new one.</p>
            <div style="text-align:center; margin:32px 0;"><a href="${link}" style="background:#2563eb; color:#ffffff; padding:14px 28px; text-decoration:none; border-radius:6px; font-weight:bold; display:inline-block;">Reset Password</a></div>
            <p style="font-size:14px; color:#4b5563;">This link is valid for 10 minutes. If you didn’t request a password reset, you can safely ignore this email.</p>
            <p style="font-size:13px; word-break:break-all; color:#2563eb;"><a href="${link}">Reset Password</a></p>
            <hr style="border:none; border-top:1px solid #e5e7eb; margin:32px 0;" />
            <p style="font-size:13px; color:#6b7280;">© ${new Date().getFullYear()} GoDigital. All rights reserved.</p>
          </td></tr>
        </table>
      </td></tr></table>
    </body>
  </html>`;
    }

    private getWelcomeEmailTemplate(name: string) {
        return `
  <!DOCTYPE html>
  <html lang="en">
    <head><meta charset="UTF-8" /><title>Welcome</title></head>
    <body style="margin:0; padding:0; background-color:#f4f6f8; font-family:Arial, Helvetica, sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 0;">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:10px; overflow:hidden; box-shadow:0 4px 12px rgba(0,0,0,0.08);">
          <tr><td style="background:#0f172a; padding:24px; text-align:center;"><h1 style="color:#ffffff; margin:0; font-size:24px;">GoDigital</h1></td></tr>
          <tr><td style="padding:32px; color:#1f2937;">
            <h2 style="margin-top:0;">Welcome to GoDigital!</h2>
            <p style="font-size:15px; line-height:1.6;">Hi ${name},</p>
            <p style="font-size:15px; line-height:1.6;">Your email has been successfully verified! You're all set to start using GoDigital.</p>
            <div style="text-align:center; margin:32px 0;"><a href="${process.env.FRONTEND_URL || "http://localhost:3000"}" style="background:#2563eb; color:#ffffff; padding:14px 28px; text-decoration:none; border-radius:6px; font-weight:bold; display:inline-block;">Get Started</a></div>
            <hr style="border:none; border-top:1px solid #e5e7eb; margin:32px 0;" />
            <p style="font-size:13px; color:#6b7280;">© ${new Date().getFullYear()} GoDigital. All rights reserved.</p>
          </td></tr>
        </table>
      </td></tr></table>
    </body>
  </html>`;
    }
}

export const authService = new AuthService();

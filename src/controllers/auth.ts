// src/controllers/auth.ts
import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import getUserModel from "../models/system/User";
import getTenantModel from "../models/system/Tenant";
import getMemberModel from "../models/system/Member";
import getTenantDetailModel from "../models/system/TenantDetail";
import { getTenantDB } from "../config/tenantDb";
import { sendEmail } from "../services/email";
import getTenantInformationModel from "../models/tenant/TenantInformation";
import { OAuth2Client } from "google-auth-library"; // 🆕
import { getOAuth2Client } from "../services/gmail/auth"; // Reuse existing client factory

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRES_IN = "7d";
const SALT_ROUNDS = 10;

// === LOGIN HANDLER ===
export const loginHandler = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });

    const User = await getUserModel();
    const Member = await getMemberModel();
    const Tenant = await getTenantModel(); // 👈 OBLIGATORIO
    const TenantDetail = await getTenantDetailModel();

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    // 🔒 CRITICAL: Check if email is verified
    if (!user.emailVerified) {
      return res.status(403).json({
        error: "Please verify your email address before logging in",
        code: "EMAIL_NOT_VERIFIED",
        email: user.email
      });
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

    if (workspaces.length === 0) return res.status(403).json({ error: "No active workspace found for this user" });
    const primaryWorkspace = workspaces[0];

    const token = jwt.sign(
      { userId: user._id.toString(), tenantId: primaryWorkspace.tenantId, email: user.email, fullName: user.name, role: primaryWorkspace.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.cookie("session_token", token, {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({ success: true, user: { email: user.email, name: user.name, role: primaryWorkspace.role, token }, workspaces });
  } catch (err: any) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Login failed" });
  }
};

// === SIGNUP HANDLER ===
export const signupHandler = async (req: Request, res: Response) => {
  try {
    const { email, password, fullName } = req.body; // Frontend sends fullName, mapped to name
    if (!email || !password || !fullName) return res.status(400).json({ error: "Required fields missing" });

    const User = await getUserModel();
    const Tenant = await getTenantModel();
    const Member = await getMemberModel();

    const existingUser = await User.findOne({ email });
    if (existingUser && existingUser.status !== "invited") {
       return res.status(409).json({ error: "User already exists" });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    
    // Si ya existe pero estaba invitado, lo actualizamos
    let user;
    if (existingUser) {
        existingUser.name = fullName;
        existingUser.passwordHash = passwordHash;
        existingUser.status = "active";
        existingUser.emailVerified = false; // Requiere verificación igual
        existingUser.emailVerificationToken = uuidv4();
        await existingUser.save();
        user = existingUser;
    } else {
        user = await User.create({
            email,
            passwordHash,
            name: fullName,
            isActive: true,
            status: "active",
            emailVerified: false,
            emailVerificationToken: uuidv4()
        });
    }

    const tenant = await Tenant.create({ name: `Workspace of ${fullName}`, ownerEmail: email, dbList: [] });

    await Member.create({
      tenantId: tenant._id, userId: user._id, role: "superadmin", status: "active",
    });

    // Send Email Verification Email
    const verificationLink = `${process.env.FRONTEND_URL || "http://localhost:3000"}/verify-email?token=${user.emailVerificationToken}`;

    await sendEmail(
      email,
      "Confirm Your Email - GoDigital",
      `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <title>Email Verification</title>
    </head>
    <body style="margin:0; padding:0; background-color:#f4f6f8; font-family:Arial, Helvetica, sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td align="center" style="padding:40px 0;">
            <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:10px; overflow:hidden; box-shadow:0 4px 12px rgba(0,0,0,0.08);">
              
              <!-- Header -->
              <tr>
                <td style="background:#0f172a; padding:24px; text-align:center;">
                  <h1 style="color:#ffffff; margin:0; font-size:24px;">
                    GoDigital
                  </h1>
                </td>
              </tr>

              <!-- Body -->
              <tr>
                <td style="padding:32px; color:#1f2937;">
                  <h2 style="margin-top:0;">Confirm your email address</h2>

                  <p style="font-size:15px; line-height:1.6;">
                    Hi ${fullName},
                  </p>

                  <p style="font-size:15px; line-height:1.6;">
                    Thank you for signing up for GoDigital! Please confirm your email address by clicking the button below.
                  </p>

                  <div style="text-align:center; margin:32px 0;">
                    <a href="${verificationLink}"
                      style="
                        background:#2563eb;
                        color:#ffffff;
                        padding:14px 28px;
                        text-decoration:none;
                        border-radius:6px;
                        font-weight:bold;
                        display:inline-block;
                      ">
                      Verify Email Address
                    </a>
                  </div>

                  <p style="font-size:14px; color:#4b5563;">
                    If you didn't create an account with GoDigital, you can safely ignore this email.
                  </p>

                  <p style="font-size:14px; color:#4b5563;">
                    If the button doesn't work, copy and paste this link into your browser:
                  </p>

                  <p style="font-size:13px; word-break:break-all; color:#2563eb;">
                    <a href="${verificationLink}">Verify Email Address</a>
                  </p>

                  <hr style="border:none; border-top:1px solid #e5e7eb; margin:32px 0;" />

                  <p style="font-size:13px; color:#6b7280;">
                    © ${new Date().getFullYear()} GoDigital. All rights reserved.
                  </p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>
  `
    );

    return res.status(201).json({
      success: true,
      message: "Account created. Please check your email to verify your account.",
      email: user.email
    });
  } catch (err: any) {
    console.error("Signup error:", err);
    return res.status(500).json({ error: "Signup failed" });
  }
};

// === FORGOT PASSWORD ===
export const forgotPasswordHandler = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const User = await getUserModel();
    const user = await User.findOne({ email });

    if (!user) {
      // Security: always return success to prevent enumeration
      return res.json({ success: true, message: "If email exists, reset link sent." });
    }

    const token = uuidv4();
    const expires = new Date(Date.now() + 600000); // 1 hour

    user.resetPasswordToken = token;
    user.resetPasswordExpires = expires;
    await user.save();

    const resetLink = `${process.env.FRONTEND_URL || "http://localhost:3000"}/reset-password?token=${token}`;

    await sendEmail(
      email,
      "Password Reset Request",
      `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <title>Password Reset</title>
    </head>
    <body style="margin:0; padding:0; background-color:#f4f6f8; font-family:Arial, Helvetica, sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td align="center" style="padding:40px 0;">
            <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:10px; overflow:hidden; box-shadow:0 4px 12px rgba(0,0,0,0.08);">
              
              <!-- Header -->
              <tr>
                <td style="background:#0f172a; padding:24px; text-align:center;">
                  <h1 style="color:#ffffff; margin:0; font-size:24px;">
                    GoDigital
                  </h1>
                </td>
              </tr>

              <!-- Body -->
              <tr>
                <td style="padding:32px; color:#1f2937;">
                  <h2 style="margin-top:0;">Reset your password</h2>

                  <p style="font-size:15px; line-height:1.6;">
                    We received a request to reset your password.  
                    Click the button below to create a new one.
                  </p>

                  <div style="text-align:center; margin:32px 0;">
                    <a href="${resetLink}"
                      style="
                        background:#2563eb;
                        color:#ffffff;
                        padding:14px 28px;
                        text-decoration:none;
                        border-radius:6px;
                        font-weight:bold;
                        display:inline-block;
                      ">
                      Reset Password
                    </a>
                  </div>

                  <p style="font-size:14px; color:#4b5563;">
                    This link is valid for <strong>10 minutes</strong>.  
                    If you didn’t request a password reset, you can safely ignore this email.
                  </p>

                  <p style="font-size:14px; color:#4b5563;">
                    If the button doesn’t work, copy and paste this link into your browser:
                  </p>

                  <p style="font-size:13px; word-break:break-all; color:#2563eb;">
                    <a href="${resetLink}">Reset Password</a>
                  </p>

                  <hr style="border:none; border-top:1px solid #e5e7eb; margin:32px 0;" />

                  <p style="font-size:13px; color:#6b7280;">
                    © ${new Date().getFullYear()} GoDigital. All rights reserved.
                  </p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>
  `
    );


    return res.json({ success: true, message: "If email exists, reset link sent." });
  } catch (err) {
    console.error("Forgot Password error:", err);
    return res.status(500).json({ error: "Error processing request" });
  }
};

// === RESET PASSWORD ===
export const resetPasswordHandler = async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;
    const User = await getUserModel();

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) return res.status(400).json({ error: "Invalid or expired token" });

    user.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    return res.json({ success: true, message: "Password updated successfully" });
  } catch (err) {
    console.error("Reset Password error:", err);
    return res.status(500).json({ error: "Error resetting password" });
  }
};

// === VERIFY EMAIL ===
export const verifyEmailHandler = async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    const User = await getUserModel();
    const Tenant = await getTenantModel();
    const TenantDetail = await getTenantDetailModel();
    const Member = await getMemberModel();

    const user = await User.findOne({
      emailVerificationToken: token
    });

    if (!user) {
      return res.status(400).json({ error: "Invalid or expired verification token" });
    }

    if (user.emailVerified) {
      return res.status(400).json({ error: "Email already verified" });
    }

    // Mark email as verified
    user.emailVerified = true;
    user.emailVerificationToken = null;
    await user.save();

    // Send welcome email
    await sendEmail(
      user.email,
      "Welcome to GoDigital!",
      `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <title>Welcome</title>
    </head>
    <body style="margin:0; padding:0; background-color:#f4f6f8; font-family:Arial, Helvetica, sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td align="center" style="padding:40px 0;">
            <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:10px; overflow:hidden; box-shadow:0 4px 12px rgba(0,0,0,0.08);">
              
              <!-- Header -->
              <tr>
                <td style="background:#0f172a; padding:24px; text-align:center;">
                  <h1 style="color:#ffffff; margin:0; font-size:24px;">
                    GoDigital
                  </h1>
                </td>
              </tr>

              <!-- Body -->
              <tr>
                <td style="padding:32px; color:#1f2937;">
                  <h2 style="margin-top:0;">Welcome to GoDigital!</h2>

                  <p style="font-size:15px; line-height:1.6;">
                    Hi ${user.name},
                  </p>

                  <p style="font-size:15px; line-height:1.6;">
                    Your email has been successfully verified! You're all set to start using GoDigital.
                  </p>

                  <p style="font-size:15px; line-height:1.6;">
                    We're excited to have you on board. If you have any questions or need assistance, feel free to reach out to our support team.
                  </p>

                  <div style="text-align:center; margin:32px 0;">
                    <a href="${process.env.FRONTEND_URL || "http://localhost:3000"}"
                      style="
                        background:#2563eb;
                        color:#ffffff;
                        padding:14px 28px;
                        text-decoration:none;
                        border-radius:6px;
                        font-weight:bold;
                        display:inline-block;
                      ">
                      Get Started
                    </a>
                  </div>

                  <hr style="border:none; border-top:1px solid #e5e7eb; margin:32px 0;" />

                  <p style="font-size:13px; color:#6b7280;">
                    © ${new Date().getFullYear()} GoDigital. All rights reserved.
                  </p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>
  `
    );

    // Get user's workspace
    const members = await Member.find({ userId: user._id, status: "active" }).populate("tenantId");

    if (members.length === 0) {
      return res.status(403).json({ error: "No active workspace found" });
    }

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

    // Generate JWT token
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

    res.cookie("session_token", jwtToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({
      success: true,
      message: "Email verified successfully",
      user: {
        email: user.email,
        name: user.name,
        role: primaryMember.role,
        token: jwtToken
      },
      workspaces
    });
  } catch (err) {
    console.error("Verify Email error:", err);
    return res.status(500).json({ error: "Error verifying email" });
  }
};

// === RESEND VERIFICATION EMAIL ===
export const resendVerificationHandler = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const User = await getUserModel();

    const user = await User.findOne({ email });

    if (!user) {
      // Seguridad: no revelar si el email existe
      return res.json({ success: true, message: "If account exists, email sent." });
    }

    if (user.emailVerified) {
      return res.status(400).json({ error: "Email already verified" });
    }

    // Generar nuevo token
    const verificationToken = uuidv4();
    user.emailVerificationToken = verificationToken;
    await user.save();

    const verificationLink = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;

    await sendEmail(
      email,
      "Confirm Your Email - GoDigital",
      `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <title>Email Verification</title>
    </head>
    <body style="margin:0; padding:0; background-color:#f4f6f8; font-family:Arial, Helvetica, sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td align="center" style="padding:40px 0;">
            <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:10px; overflow:hidden; box-shadow:0 4px 12px rgba(0,0,0,0.08);">
              
              <!-- Header -->
              <tr>
                <td style="background:#0f172a; padding:24px; text-align:center;">
                  <h1 style="color:#ffffff; margin:0; font-size:24px;">
                    GoDigital
                  </h1>
                </td>
              </tr>

              <!-- Body -->
              <tr>
                <td style="padding:32px; color:#1f2937;">
                  <h2 style="margin-top:0;">Confirm your email address</h2>

                  <p style="font-size:15px; line-height:1.6;">
                    Hi ${user.name || user.email},
                  </p>

                  <p style="font-size:15px; line-height:1.6;">
                    Thank you for signing up for GoDigital! Please confirm your email address by clicking the button below.
                  </p>

                  <div style="text-align:center; margin:32px 0;">
                    <a href="${verificationLink}"
                      style="
                        background:#2563eb;
                        color:#ffffff;
                        padding:14px 28px;
                        text-decoration:none;
                        border-radius:6px;
                        font-weight:bold;
                        display:inline-block;
                      ">
                      Verify Email Address
                    </a>
                  </div>

                  <p style="font-size:14px; color:#4b5563;">
                    If you didn't create an account with GoDigital, you can safely ignore this email.
                  </p>

                  <p style="font-size:14px; color:#4b5563;">
                    If the button doesn't work, copy and paste this link into your browser:
                  </p>

                  <p style="font-size:13px; word-break:break-all; color:#2563eb;">
                    <a href="${verificationLink}">Verify Email Address</a>
                  </p>

                  <hr style="border:none; border-top:1px solid #e5e7eb; margin:32px 0;" />

                  <p style="font-size:13px; color:#6b7280;">
                    © ${new Date().getFullYear()} GoDigital. All rights reserved.
                  </p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>
  `
    );


    return res.json({ success: true, message: "Verification email sent" });
  } catch (err) {
    console.error("Resend verification error:", err);
    return res.status(500).json({ error: "Error sending email" });
  }
};

// Compat wrapper (legacy support if needed)
export const authHandler = async (req: Request, res: Response) => {
  const { action } = req.body;
  if (action === "login") return loginHandler(req, res);
  if (action === "signup") return signupHandler(req, res);
  return res.status(400).json({ error: "Invalid action" });
};

async function provisionTenantDatabase(detailId: string, dbName: string, tenantId: string) {
  try {
    console.log(`🔧 Provisioning physical database: ${dbName}`);
    const tenantDB = await getTenantDB(tenantId, detailId);
    console.log(`✅ Tenant database provisioned: ${dbName}`);
  } catch (err: any) {
    console.error(`❌ Failed to provision tenant database ${dbName}:`, err.message);
    throw err;
  }
}

export const provisionDatabaseHandler = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const detailData = req.body;

    console.log(`📦 Starting provisioning for tenant ${id}`);
    console.log(`📋 Detail data:`, detailData);

    // Validate required fields
    if (!detailData.country || !detailData.entityType || !detailData.taxId) {
      return res.status(400).json({
        error: "country, entityType, and taxId are required"
      });
    }

    // Generate unique database name
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const autoDbName = `GoDigital_${timestamp}_${random}`;

    console.log(`🏷️  Generated database name: ${autoDbName}`);

    // Get models - IMPORTANT: These connect to System DB
    const Tenant = await getTenantModel();
    const TenantDetail = await getTenantDetailModel();

    console.log(`✅ Models loaded from System DB`);

    // Verificar que el tenant existe
    const tenant = await Tenant.findById(id);

    if (!tenant) {
      console.error(`❌ Tenant ${id} not found`);
      return res.status(404).json({ error: "Tenant not found" });
    }

    console.log(`✅ Tenant found: ${tenant.name}`);

    // Check if user has permission
    if (req.tenantId !== id && req.role !== "superadmin") {
      return res.status(403).json({ error: "Access denied" });
    }

    // Check if taxId already exists
    const existingTaxId = await TenantDetail.findOne({ taxId: detailData.taxId });
    if (existingTaxId) {
      console.error(`❌ Tax ID ${detailData.taxId} already exists`);
      return res.status(409).json({
        error: "Tax ID already exists",
        field: "taxId"
      });
    }

    console.log(`✅ Tax ID ${detailData.taxId} is unique`);

    // 1️⃣ Create tenant detail record in System DB
    console.log(`💾 Creating TenantDetail document...`);
    console.log(`🔍 TenantDetail model DB:`, TenantDetail.db?.name);
    console.log(`🔍 TenantDetail collection:`, TenantDetail.collection?.name);

    // Crear el documento de TenantDetail (usando SOLO los campos del esquema)
    const detailDoc = {
      tenantId: tenant._id,
      dbName: autoDbName,
      country: detailData.country,
      entityType: detailData.entityType,
      taxId: detailData.taxId,
      businessEmail: detailData.businessEmail || null,
      domain: detailData.domain || null,
      metadata: detailData.metadata || {}
    };


    console.log(`📦 Document to save:`, detailDoc);

    // CRÍTICO: Usar TenantDetail.create() que usa la conexión correcta
    const detail = await TenantDetail.create(detailDoc);
    const tenantDB = await getTenantDB(tenant.id, detail._id.toString());
    const TenantInformation = await getTenantInformationModel(tenantDB);
    console.log(`✅ TenantDetail created with ID: ${detail._id}`);
    console.log(`📄 Detail saved to collection:`, detail.collection?.name);

    //TODO: Get all from front (add in form)
    await TenantInformation.create({
      tenantDetailId: detail._id,
      legalName: detailData.taxId,
      legalClass: detailData.entityType,
      taxId: detailData.taxId,
      baseCurrency: null,
      contact: null
    });

    // Verify it was saved in the correct collection
    const verification = await TenantDetail.findById(detail._id);
    if (!verification) {
      throw new Error("TenantDetail was not saved to database!");
    }
    console.log(`✅ Verification: TenantDetail exists in tenantdetails collection`);

    // 2️⃣ Add detail to tenant's dbList
    // IMPORTANTE: Usar updateOne en lugar de save() para evitar mezclar campos
    const updateResult = await Tenant.updateOne(
      { _id: tenant._id },
      { $push: { dbList: detail._id } }
    );

    console.log(`✅ Added detail ${detail._id} to Tenant.dbList`);
    console.log(`📝 Update result:`, updateResult);

    // Verify tenant was updated correctly
    const updatedTenant = await Tenant.findById(id).lean();
    console.log(`✅ Tenant dbList now has ${updatedTenant?.dbList.length} databases`);

    // VERIFICACIÓN CRÍTICA: Asegurar que el tenant NO tiene campos de TenantDetail
    const tenantKeys = Object.keys(updatedTenant || {});
    const invalidKeys = ['country', 'entityType', 'taxId', 'dbName', 'businessEmail', 'domain'];
    const contaminatedKeys = tenantKeys.filter(k => invalidKeys.includes(k));

    if (contaminatedKeys.length > 0) {
      console.error(`⚠️ WARNING: Tenant has invalid fields: ${contaminatedKeys.join(', ')}`);
      // Limpiar campos contaminados
      await Tenant.updateOne(
        { _id: tenant._id },
        { $unset: Object.fromEntries(contaminatedKeys.map(k => [k, ""])) }
      );
      console.log(`✅ Cleaned contaminated fields from Tenant`);
    }

    // 3️⃣ Provision the physical database
    await provisionTenantDatabase(detail._id.toString(), autoDbName, tenant._id.toString());

    return res.json({
      success: true,
      message: "Database provisioned successfully",
      detail: {
        id: detail._id.toString(),
        tenantId: tenant._id.toString(),
        dbName: detail.dbName,
        country: detail.country,
        entityType: detail.entityType,
        taxId: detail.taxId,
        businessEmail: detail.businessEmail,
        domain: detail.domain
      }
    });

  } catch (err: any) {
    console.error("❌ Provisioning error:", err);
    console.error("❌ Error stack:", err.stack);

    if (err.code === 11000) {
      const field = err.message.includes('taxId') ? 'taxId' : 'dbName';
      return res.status(409).json({
        error: `${field} already exists`,
        field
      });
    }
    return res.status(500).json({
      error: "An error occurred during provisioning",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};

export const getTenantHandler = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const Tenant = await getTenantModel();
    const TenantDetail = await getTenantDetailModel();

    const tenant = await Tenant.findById(id);

    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    // Verify user has access to this tenant
    if (req.tenantId !== id && req.role !== "superadmin") {
      return res.status(403).json({ error: "Access denied" });
    }

    // Get all databases for this tenant
    const details = await TenantDetail.find({
      _id: { $in: tenant.dbList }
    });

    return res.json({
      id: tenant._id.toString(),
      name: tenant.name,
      ownerEmail: tenant.ownerEmail,
      databases: details.map((d: any) => ({
        id: d._id.toString(),
        dbName: d.dbName,
        country: d.country,
        entityType: d.entityType,
        taxId: d.taxId,
        businessEmail: d.businessEmail,
        domain: d.domain,
        createdAt: d.createdAt,
      })),
      metadata: tenant.metadata,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
    });

  } catch (err: any) {
    console.error("❌ Get tenant error:", err);
    return res.status(500).json({
      error: "An error occurred while fetching tenant",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};

export const updateTenantHandler = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // CRÍTICO: Remove ALL fields that shouldn't be updated
    // Campos del sistema que nunca se actualizan
    delete updateData._id;
    delete updateData.createdAt;
    delete updateData.updatedAt;
    delete updateData.__v;

    // dbList se maneja solo a través de provisioning
    delete updateData.dbList;

    // IMPORTANTE: Campos que pertenecen a TenantDetail, NO a Tenant
    delete updateData.country;
    delete updateData.entityType;
    delete updateData.taxId;
    delete updateData.dbName;
    delete updateData.businessEmail;
    delete updateData.domain;

    // Solo permitir actualizar name y metadata
    const allowedFields = ['name', 'metadata'];
    const filteredUpdate: Record<string, any> = {};

    for (const key of allowedFields) {
      if (updateData[key] !== undefined) {
        filteredUpdate[key] = updateData[key];
      }
    }

    if (Object.keys(filteredUpdate).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    console.log(`📝 Update request for tenant ${id}:`, filteredUpdate);

    const Tenant = await getTenantModel();
    const tenant = await Tenant.findById(id);

    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    // Verify user has permission to update this tenant
    if (req.tenantId !== id && req.role !== "superadmin" && req.role !== "admin") {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    // Usar updateOne para evitar contaminar el documento
    const result = await Tenant.updateOne(
      { _id: id },
      { $set: filteredUpdate }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    console.log(`✅ Tenant ${id} updated successfully`);

    // Obtener el tenant actualizado (solo campos válidos)
    const updatedTenant = await Tenant.findById(id)
      .select('_id name ownerEmail metadata createdAt updatedAt')
      .lean();

    return res.json({
      success: true,
      message: "Tenant updated successfully",
      tenant: {
        id: updatedTenant._id.toString(),
        name: updatedTenant.name,
        ownerEmail: updatedTenant.ownerEmail,
        metadata: updatedTenant.metadata,
      }
    });

  } catch (err: any) {
    console.error("❌ Update tenant error:", err);
    return res.status(500).json({
      error: "An error occurred while updating tenant",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};

export const getTenantDetailHandler = async (req: Request, res: Response) => {
  try {
    const { detailId } = req.params;

    const TenantDetail = await getTenantDetailModel();
    const detail = await TenantDetail.findById(detailId).populate('tenantId');

    if (!detail) {
      return res.status(404).json({ error: "TenantDetail not found" });
    }

    // Verify user has access to this tenant
    const tenantId = (detail.tenantId as any)._id.toString();
    if (req.tenantId !== tenantId && req.role !== "superadmin") {
      return res.status(403).json({ error: "Access denied" });
    }

    return res.json({
      id: detail._id.toString(),
      tenantId: tenantId,
      dbName: detail.dbName,
      country: detail.country,
      entityType: detail.entityType,
      taxId: detail.taxId,
      businessEmail: detail.businessEmail,
      domain: detail.domain,
      metadata: detail.metadata,
      createdAt: detail.createdAt,
      updatedAt: detail.updatedAt,
    });

  } catch (err: any) {
    console.error("❌ Get tenant detail error:", err);
    return res.status(500).json({
      error: "An error occurred while fetching tenant detail",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};

export const updateTenantDetailHandler = async (req: Request, res: Response) => {
  try {
    const { detailId } = req.params;
    const updateData = req.body;

    // Remove fields that shouldn't be updated
    delete updateData._id;
    delete updateData.tenantId;
    delete updateData.dbName; // dbName cannot be changed
    delete updateData.createdAt;
    delete updateData.updatedAt;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    console.log(`📝 Update request for tenant detail ${detailId}:`, updateData);

    const TenantDetail = await getTenantDetailModel();
    const detail = await TenantDetail.findById(detailId).populate('tenantId');

    if (!detail) {
      return res.status(404).json({ error: "TenantDetail not found" });
    }

    // Verify user has permission
    const tenantId = (detail.tenantId as any)._id.toString();
    if (req.tenantId !== tenantId && req.role !== "superadmin" && req.role !== "admin") {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    // Check if taxId is being updated and if it already exists
    if (updateData.taxId && updateData.taxId !== detail.taxId) {
      const existingTaxId = await TenantDetail.findOne({
        taxId: updateData.taxId,
        _id: { $ne: detailId }
      });
      if (existingTaxId) {
        return res.status(409).json({
          error: "Tax ID already exists",
          field: "taxId"
        });
      }
    }

    // Update fields
    Object.assign(detail, updateData);
    await detail.save();

    console.log(`✅ TenantDetail ${detailId} updated successfully`);

    return res.json({
      success: true,
      message: "Tenant detail updated successfully",
      detail: {
        id: detail._id.toString(),
        tenantId: tenantId,
        dbName: detail.dbName,
        country: detail.country,
        entityType: detail.entityType,
        taxId: detail.taxId,
        businessEmail: detail.businessEmail,
        domain: detail.domain,
      }
    });

  } catch (err: any) {
    console.error("❌ Update tenant detail error:", err);
    if (err.code === 11000) {
      return res.status(409).json({
        error: "Tax ID already exists",
        field: "taxId"
      });
    }
    return res.status(500).json({
      error: "An error occurred while updating tenant detail",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};

export const logoutHandler = (req: Request, res: Response) => {
  res.clearCookie("session_token", { path: "/" });
  return res.json({ success: true });
};

export async function getTenantsListWithDetails(req: Request, res: Response) {
  try {
    const tenantId = req.params.id;

    // Validar que el usuario tenga acceso
    if (req.role !== "superadmin" && req.tenantId !== tenantId) {
      return res.status(403).json({ error: "Access denied" });
    }

    const Tenant = await getTenantModel();
    const TenantDetail = await getTenantDetailModel();

    // Buscar solo el tenant indicado
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    // Traer detalles de ese tenant
    const details = await TenantDetail.find({ tenantId: tenant._id });

    const result = {
      tenantId: tenant._id,
      name: tenant.name,
      code: tenant.code,
      role: req.role,
      details: details.map(d => ({
        detailId: d._id,
        dbName: d.dbName,
        createdAt: d.createdAt,
        status: d.status ?? "ready",
        entityType: d.entityType,
        taxId: d.taxId,
      }))
    };

    return res.json(result);

  } catch (err: any) {
    console.error(`Error getting tenant details for id=${req.params.id}:`, err);
    return res.status(500).json({
      error: "Failed to load tenant details",
      details: process.env.NODE_ENV === "development" ? err.message : undefined
    });
  }
}

export const selectWorkspaceHandler = async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.body;
    const userId = req.userId;

    if (!tenantId) return res.status(400).json({ error: "Tenant ID required" });

    const Member = await getMemberModel();
    const User = await getUserModel();

    const member = await Member.findOne({ userId: userId, tenantId: tenantId, status: "active" });
    if (!member) return res.status(403).json({ error: "No access to this workspace" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const token = jwt.sign(
      { userId: user._id.toString(), tenantId: tenantId, email: user.email, fullName: user.name, role: member.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.cookie("session_token", token, {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({ success: true, token, role: member.role });
  } catch (err: any) {
    console.error("Select workspace error:", err);
    return res.status(500).json({ error: "Select workspace failed" });
  }
};

export const listWorkspacesHandler = async (req: Request, res: Response) => {
  try {
    const User = await getUserModel();
    const Member = await getMemberModel();
    const TenantDetail = await getTenantDetailModel();

    const user = await User.findById(req.userId);
    if (!user) return res.status(401).json({ error: "User not found" });

    const members = await Member.find({ userId: user._id, status: "active" }).populate("tenantId");

    const workspaces = await Promise.all(
      members.map(async (m: any) => {
        const tenant = m.tenantId;
        if (!tenant) return null;
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

    return res.json({ success: true, workspaces: workspaces.filter(Boolean) });
  } catch (err: any) {
    console.error("List workspaces error:", err);
    return res.status(500).json({ error: "Failed to list workspaces" });
  }
};

// Helper to generate session
async function createSessionForUser(user: any, res: Response) {
  const Member = await getMemberModel();
  const TenantDetail = await getTenantDetailModel();
  const JWT_SECRET = process.env.JWT_SECRET!;
  const JWT_EXPIRES_IN = "7d";

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

  if (workspaces.length === 0) return res.status(403).json({ error: "No active workspace found for this user" });
  const primaryWorkspace = workspaces[0];

  const token = jwt.sign(
    { userId: user._id.toString(), tenantId: primaryWorkspace.tenantId, email: user.email, fullName: user.name, role: primaryWorkspace.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  res.cookie("session_token", token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  return res.json({ success: true, user: { email: user.email, name: user.name, role: primaryWorkspace.role, token, avatar: user.avatar }, workspaces });
}

// === GOOGLE LOGIN ===
export const googleLoginHandler = async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: "Google token required" });

    const client = getOAuth2Client();
    // Verify token
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GMAIL_CLIENT_ID, // verify against our client ID
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.email) return res.status(400).json({ error: "Invalid Google token" });

    const { email, sub: googleId, picture, name } = payload;

    const User = await getUserModel();
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ error: "User not found. Please sign up first." });
    }

    // Link Google Account if not linked
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

    if (!user.isActive) {
      return res.status(403).json({ error: "User is suspended" });
    }

    // Create session
    return createSessionForUser(user, res);

  } catch (err: any) {
    console.error("Google Login error:", err);
    return res.status(500).json({ error: "Google Login failed" });
  }
};

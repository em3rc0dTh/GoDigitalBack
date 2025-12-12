// src/controllers/auth.ts
import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import getUserModel from "../models/system/User";
import getTenantModel from "../models/system/Tenant";
import getMemberModel from "../models/system/Member";
import { getTenantDB } from "../config/tenantDb";

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRES_IN = "7d";
const SALT_ROUNDS = 10;

export const authHandler = async (req: Request, res: Response) => {
  try {
    const { action, email, password, fullName } = req.body;

    if (!action || !email || !password) {
      return res.status(400).json({
        error: "action, email and password are required",
      });
    }

    const User = await getUserModel();
    const Tenant = await getTenantModel();
    const Member = await getMemberModel();

    if (action === "login") {
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const members = await Member.find({
        userId: user._id,
        status: "active"
      }).populate("tenantId");

      const workspaces = members.map((m: any) => ({
        tenantId: m.tenantId._id.toString(),
        name: m.tenantId.name,
        role: m.role,
        dbName: m.tenantId.dbName || null,
      }));

      if (workspaces.length === 0) {
        return res.status(403).json({
          error: "No active workspace found for this user"
        });
      }

      const primaryWorkspace = workspaces[0];

      const token = jwt.sign(
        {
          userId: user._id.toString(),
          tenantId: primaryWorkspace.tenantId,
          email: user.email,
          fullName: user.fullName,
          role: primaryWorkspace.role,
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );

      res.cookie("session_token", token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      return res.json({
        success: true,
        user: {
          email: user.email,
          fullName: user.fullName,
          role: primaryWorkspace.role,
          token,
        },
        workspaces,
      });
    }

    if (action === "signup") {
      if (!fullName) {
        return res.status(400).json({
          error: "Full name is required for signup",
        });
      }

      const exists = await User.findOne({ email });
      if (exists) {
        return res.status(409).json({ error: "User already exists" });
      }

      // Create tenant WITHOUT database
      const tenant = await Tenant.create({
        name: `Workspace of ${fullName}`,
        ownerEmail: email,
        // dbName is intentionally left empty - will be set during provisioning
      });

      console.log(`✅ Tenant created: ${tenant._id} (database not provisioned yet)`);

      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      const user = await User.create({
        email,
        passwordHash,
        fullName,
        status: "active",
      });

      console.log(`✅ User created: ${user._id}`);

      await Member.create({
        tenantId: tenant._id,
        userId: user._id,
        role: "superadmin",
        status: "active",
      });

      console.log(`✅ Member created for user ${user._id} in tenant ${tenant._id}`);

      const token = jwt.sign(
        {
          userId: user._id.toString(),
          tenantId: tenant._id.toString(),
          email: user.email,
          fullName: user.fullName,
          role: "superadmin",
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );

      res.cookie("session_token", token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      return res.status(201).json({
        success: true,
        user: {
          email: user.email,
          fullName: user.fullName,
          role: "superadmin",
          token,
        },
        workspaces: [{
          tenantId: tenant._id.toString(),
          name: tenant.name,
          role: "superadmin",
          dbName: null, // Database not provisioned yet
        }],
      });
    }

    return res.status(400).json({ error: "Invalid action" });

  } catch (err: any) {
    console.error("Auth error:", err);
    return res.status(500).json({
      error: "An error occurred during authentication",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};

async function provisionTenantDatabase(tenantId: string, dbName: string) {
  try {
    // IMPORTANT: getTenantDB will now work because dbName was just set
    const tenantDB = await getTenantDB(tenantId);

    // Create the collections for the tenant
    await tenantDB.createCollection("accounts");
    await tenantDB.createCollection("transactions");

    console.log(`✅ Tenant database provisioned: ${dbName}`);
  } catch (err: any) {
    console.error(`❌ Failed to provision tenant database ${dbName}:`, err.message);
    throw err;
  }
}

export const provisionDatabaseHandler = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { ...otherParams } = req.body;

    const autoDbName = `GoDigital_${Math.random().toString(36).substring(2, 8)}`;

    console.log(`📦 Provisioning request for tenant ${id} with dbName: ${autoDbName}`);

    const Tenant = await getTenantModel();
    const tenant = await Tenant.findById(id);

    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    if (tenant.dbName) {
      return res.status(400).json({
        error: "Tenant already has a database assigned",
        existingDbName: tenant.dbName
      });
    }

    tenant.dbName = autoDbName;

    if (otherParams.country) tenant.country = otherParams.country;
    if (otherParams.entityType) tenant.entityType = otherParams.entityType;
    if (otherParams.taxId) tenant.taxId = otherParams.taxId;
    if (otherParams.businessEmail) tenant.businessEmail = otherParams.businessEmail;
    if (otherParams.domain) tenant.domain = otherParams.domain;

    await tenant.save();

    console.log(`✅ Tenant ${id} updated with dbName: ${autoDbName}`);

    // Provision the database after updating the tenant
    await provisionTenantDatabase(tenant._id.toString(), autoDbName);

    return res.json({
      success: true,
      message: "Database provisioned successfully",
      tenant: {
        id: tenant._id.toString(),
        name: tenant.name,
        dbName: tenant.dbName, // Should match providedDbName exactly
        ownerEmail: tenant.ownerEmail,
        country: tenant.country,
        entityType: tenant.entityType,
        taxId: tenant.taxId,
      }
    });

  } catch (err: any) {
    console.error("❌ Provisioning error:", err);
    if (err.code === 11000) {
      return res.status(409).json({ error: "Database name already exists" });
    }
    return res.status(500).json({
      error: "An error occurred during provisioning",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};

export const logoutHandler = (req: Request, res: Response) => {
  res.clearCookie("session_token", { path: "/" });
  return res.json({ success: true });
};

export const updateTenantHandler = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    delete updateData.dbName; // dbName can only be set via provisioning
    delete updateData._id;
    delete updateData.createdAt;
    delete updateData.updatedAt;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    console.log(`📝 Update request for tenant ${id}:`, updateData);

    const Tenant = await getTenantModel();
    const tenant = await Tenant.findById(id);

    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    // Verify user has permission to update this tenant
    if (req.role !== "superadmin" && req.role !== "admin") {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    // Update tenant fields
    Object.assign(tenant, updateData);
    await tenant.save();

    console.log(`✅ Tenant ${id} updated successfully`);

    return res.json({
      success: true,
      message: "Tenant updated successfully",
      tenant: {
        id: tenant._id.toString(),
        name: tenant.name,
        dbName: tenant.dbName,
        ownerEmail: tenant.ownerEmail,
        country: tenant.country,
        entityType: tenant.entityType,
        taxId: tenant.taxId,
        businessEmail: tenant.businessEmail,
        domain: tenant.domain,
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

export const getTenantHandler = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const Tenant = await getTenantModel();
    const tenant = await Tenant.findById(id);

    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    // Verify user has access to this tenant
    if (req.tenantId !== id && req.role !== "superadmin") {
      return res.status(403).json({ error: "Access denied" });
    }

    return res.json({
      id: tenant._id.toString(),
      name: tenant.name,
      dbName: tenant.dbName || null,
      ownerEmail: tenant.ownerEmail,
      country: tenant.country || null,
      entityType: tenant.entityType || null,
      taxId: tenant.taxId || null,
      businessEmail: tenant.businessEmail || null,
      domain: tenant.domain || null,
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

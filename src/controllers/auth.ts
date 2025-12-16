// src/controllers/auth.ts
import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import getUserModel from "../models/system/User";
import getTenantModel from "../models/system/Tenant";
import getMemberModel from "../models/system/Member";
import getTenantDetailModel from "../models/system/TenantDetail";
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
    const TenantDetail = await getTenantDetailModel();

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

      // Build workspaces with their databases
      const workspaces = await Promise.all(
        members.map(async (m: any) => {
          const tenant = m.tenantId;

          // Get all databases for this tenant
          const details = await TenantDetail.find({
            _id: { $in: tenant.dbList }
          }).select('dbName country entityType');

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
        dbList: [], // Empty array, will be populated during provisioning
      });

      console.log(`✅ Tenant created: ${tenant._id} (no databases provisioned yet)`);

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
          databases: [], // No databases yet
          hasDatabase: false,
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

async function provisionTenantDatabase(detailId: string, dbName: string, tenantId: string) {
  try {
    console.log(`🔧 Provisioning physical database: ${dbName}`);
    const tenantDB = await getTenantDB(tenantId, detailId);
    await tenantDB.createCollection("accounts");
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

    console.log(`✅ TenantDetail created with ID: ${detail._id}`);
    console.log(`📄 Detail saved to collection:`, detail.collection?.name);

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

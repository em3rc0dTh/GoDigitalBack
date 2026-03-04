
import getTenantModel from "../../models/system/Tenant";
import getTenantDetailModel from "../../models/system/TenantDetail";
import { getTenantDB } from "../../config/tenantDb";
import getTenantInformationModel from "../../models/tenant/TenantInformation";

export class SystemTenantService {

    async provisionDatabase(id: string, detailData: any, userRole: string, userTenantId: string) {
        // Validation
        if (!detailData.country || !detailData.entityType || !detailData.taxId) {
            throw new Error("country, entityType, and taxId are required");
        }

        const Tenant = await getTenantModel();
        const TenantDetail = await getTenantDetailModel();

        const tenant = await Tenant.findById(id);
        if (!tenant) throw new Error("Tenant not found");

        // Verify permissions
        if (userTenantId !== id && userRole !== "superadmin") {
            const error: any = new Error("Access denied");
            error.status = 403;
            throw error;
        }

        // Check taxId
        const existingTaxId = await TenantDetail.findOne({ taxId: detailData.taxId });
        if (existingTaxId) {
            const error: any = new Error("Tax ID already exists");
            error.status = 409;
            error.field = "taxId";
            throw error;
        }

        // Generate DB Name
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 15);
        const autoDbName = `GoDigital_${timestamp}_${random}`;

        // Create TenantDetail
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

        const detail = await TenantDetail.create(detailDoc);

        // Setup Physical DB
        await this.provisionPhysicalDatabase(detail._id.toString(), autoDbName, tenant._id.toString(), detailData);

        // Update Tenant
        await Tenant.updateOne(
            { _id: tenant._id },
            { $push: { dbList: detail._id } }
        );

        // Clean Tenant (Legacy safeguard)
        const updatedTenant = await Tenant.findById(id).lean();
        if (updatedTenant) {
            const invalidKeys = ['country', 'entityType', 'taxId', 'dbName', 'businessEmail', 'domain'];
            const contaminatedKeys = Object.keys(updatedTenant).filter(k => invalidKeys.includes(k));
            if (contaminatedKeys.length > 0) {
                await Tenant.updateOne(
                    { _id: tenant._id },
                    { $unset: Object.fromEntries(contaminatedKeys.map(k => [k, ""])) }
                );
            }
        }

        return {
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
        };
    }

    private async provisionPhysicalDatabase(detailId: string, dbName: string, tenantId: string, detailData: any) {
        console.log(`🔧 Provisioning physical database: ${dbName}`);
        const tenantDB = await getTenantDB(tenantId, detailId);

        // Init TenantInformation
        const TenantInformation = await getTenantInformationModel(tenantDB);
        await TenantInformation.create({
            tenantDetailId: detailId,
            legalName: detailData.taxId, // Logic from controller
            legalClass: detailData.entityType,
            taxId: detailData.taxId,
            baseCurrency: null,
            contact: null
        });

        console.log(`✅ Tenant database provisioned: ${dbName}`);
    }

    async getTenant(id: string, userRole: string, userTenantId: string) {
        const Tenant = await getTenantModel();
        const TenantDetail = await getTenantDetailModel();

        const tenant = await Tenant.findById(id);
        if (!tenant) throw new Error("Tenant not found");

        if (userTenantId !== id && userRole !== "superadmin") {
            const error: any = new Error("Access denied");
            error.status = 403;
            throw error;
        }

        const details = await TenantDetail.find({
            _id: { $in: tenant.dbList }
        });

        return {
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
        };
    }

    async updateTenant(id: string, updateData: any, userRole: string, userTenantId: string) {
        // Validation logic
        delete updateData._id;
        delete updateData.createdAt;
        delete updateData.updatedAt;
        delete updateData.__v;
        delete updateData.dbList;
        delete updateData.country;
        delete updateData.entityType;
        delete updateData.taxId;
        delete updateData.dbName;
        delete updateData.businessEmail;
        delete updateData.domain;

        const allowedFields = ['name', 'metadata'];
        const filteredUpdate: Record<string, any> = {};

        for (const key of allowedFields) {
            if (updateData[key] !== undefined) {
                filteredUpdate[key] = updateData[key];
            }
        }

        if (Object.keys(filteredUpdate).length === 0) {
            throw new Error("No valid fields to update");
        }

        const Tenant = await getTenantModel();
        const tenant = await Tenant.findById(id);
        if (!tenant) throw new Error("Tenant not found");

        if (userTenantId !== id && userRole !== "superadmin" && userRole !== "admin") {
            const error: any = new Error("Insufficient permissions");
            error.status = 403;
            throw error;
        }

        await Tenant.updateOne({ _id: id }, { $set: filteredUpdate });

        const updatedTenant = await Tenant.findById(id)
            .select('_id name ownerEmail metadata createdAt updatedAt')
            .lean();

        return {
            message: "Tenant updated successfully",
            tenant: {
                id: updatedTenant?._id.toString(),
                name: updatedTenant?.name,
                ownerEmail: updatedTenant?.ownerEmail,
                metadata: updatedTenant?.metadata,
            }
        };
    }

    async getTenantDetail(detailId: string, userRole: string, userTenantId: string) {
        const TenantDetail = await getTenantDetailModel();
        const detail = await TenantDetail.findById(detailId).populate('tenantId');

        if (!detail) throw new Error("TenantDetail not found");

        const tenantId = (detail.tenantId as any)._id.toString();
        if (userTenantId !== tenantId && userRole !== "superadmin") {
            const error: any = new Error("Access denied");
            error.status = 403;
            throw error;
        }

        return {
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
        };
    }

    async updateTenantDetail(detailId: string, updateData: any, userRole: string, userTenantId: string) {
        delete updateData._id;
        delete updateData.tenantId;
        delete updateData.dbName;
        delete updateData.createdAt;
        delete updateData.updatedAt;

        if (Object.keys(updateData).length === 0) {
            throw new Error("No valid fields to update");
        }

        const TenantDetail = await getTenantDetailModel();
        const detail = await TenantDetail.findById(detailId).populate('tenantId');

        if (!detail) throw new Error("TenantDetail not found");

        const tenantId = (detail.tenantId as any)._id.toString();
        if (userTenantId !== tenantId && userRole !== "superadmin" && userRole !== "admin") {
            const error: any = new Error("Insufficient permissions");
            error.status = 403;
            throw error;
        }

        if (updateData.taxId && updateData.taxId !== detail.taxId) {
            const existingTaxId = await TenantDetail.findOne({
                taxId: updateData.taxId,
                _id: { $ne: detailId }
            });
            if (existingTaxId) {
                const error: any = new Error("Tax ID already exists");
                error.status = 409;
                error.field = "taxId";
                throw error;
            }
        }

        Object.assign(detail, updateData);
        await detail.save();

        return {
            message: "Tenant detail updated successfully",
            detail: {
                id: detail._id.toString(),
                tenantId: tenantId,
                dbName: detail.dbName,
                country: detail.country,
                entityType: detail.entityType,
                taxId: detail.taxId,
                businessEmail: detail.businessEmail,
                domain: detail.domain
            }
        };
    }

    async listTenantsWithDetails(targetTenantId: string, userRole: string, userTenantId: string) {
        if (userRole !== "superadmin" && userTenantId !== targetTenantId) {
            const error: any = new Error("Access denied");
            error.status = 403;
            throw error;
        }

        const Tenant = await getTenantModel();
        const TenantDetail = await getTenantDetailModel();

        const tenant = await Tenant.findById(targetTenantId);
        if (!tenant) throw new Error("Tenant not found");

        const details = await TenantDetail.find({ tenantId: tenant._id });

        return {
            tenantId: tenant._id,
            name: tenant.name,
            code: tenant.code,
            role: userRole,
            details: details.map(d => ({
                detailId: d._id,
                dbName: d.dbName,
                createdAt: d.createdAt,
                status: d.status ?? "ready",
                entityType: d.entityType,
                taxId: d.taxId,
            }))
        };
    }
}

export const systemTenantService = new SystemTenantService();

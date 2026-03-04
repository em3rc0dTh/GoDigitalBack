// src/middleware/tenantContext.ts
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { getTenantDB } from "../config/tenantDb";
import getTenantModel from "../models/system/Tenant";
import getTenantDetailModel from "../models/system/TenantDetail";
import { Connection } from "mongoose";

const JWT_SECRET = process.env.JWT_SECRET!;

declare global {
    namespace Express {
        interface Request {
            userId?: string;
            tenantId?: string;
            role?: string;
            tenantDB?: Connection;
            tenantDetailId?: string; // NEW: Current active database detail
            tenantProvisioned?: boolean;
        }
    }
}

export async function tenantContext(req: Request, res: Response, next: NextFunction) {
    try {
        const token = req.cookies.session_token || req.headers.authorization?.replace("Bearer ", "");

        if (!token) {
            return res.status(401).json({ error: "No authentication token" });
        }

        const decoded = jwt.verify(token, JWT_SECRET) as any;

        if (!decoded.tenantId) {
            return res.status(401).json({ error: "Invalid token: missing tenantId" });
        }

        // Set basic auth info
        req.userId = decoded.userId;
        req.tenantId = decoded.tenantId;
        req.role = decoded.role;

        // Check if tenant exists and has databases
        const Tenant = await getTenantModel();
        const TenantDetail = await getTenantDetailModel();

        const tenant = await Tenant.findById(decoded.tenantId);

        if (!tenant) {
            return res.status(404).json({ error: "Tenant not found" });
        }

        // Check if tenant has any provisioned databases
        if (!tenant.dbList || tenant.dbList.length === 0) {
            console.log(`ℹ️  Tenant ${decoded.tenantId} has no databases provisioned yet`);
            req.tenantProvisioned = false;
            req.tenantDB = undefined;
            req.tenantDetailId = undefined;
            return next(); // Allow request to continue (for provisioning endpoint)
        }

        // Get the detailId from header or use the first one as default
        const detailIdFromHeader = req.headers['x-tenant-detail-id'] as string;
        let activeDetailId = detailIdFromHeader;

        // If no specific detail requested, use the first one
        if (!activeDetailId) {
            activeDetailId = tenant.dbList[0].toString();
            console.log(`ℹ️  Using default database: ${activeDetailId}`);
        }

        // Verify the detail exists and belongs to this tenant
        const detail = await TenantDetail.findOne({
            _id: activeDetailId,
            tenantId: tenant._id
        });

        if (!detail) {
            return res.status(404).json({
                error: "Database not found or does not belong to this tenant",
                availableDatabases: tenant.dbList.map((id: any) => id.toString())
            });
        }

        // Connect to the specific database
        try {
            const tenantDB = await getTenantDB(decoded.tenantId, activeDetailId);
            req.tenantDB = tenantDB;
            req.tenantDetailId = activeDetailId;
            req.tenantProvisioned = true;
            next();
        } catch (err: any) {
            console.error("Tenant DB connection error:", err);
            return res.status(500).json({
                error: "Failed to connect to tenant database",
                details: process.env.NODE_ENV === "development" ? err.message : undefined
            });
        }
    } catch (err) {
        console.error("Tenant context error:", err);
        return res.status(401).json({ error: "Invalid or expired token" });
    }
}
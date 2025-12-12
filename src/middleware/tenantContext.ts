// src/middleware/tenantContext.ts
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { getTenantDB } from "../config/tenantDb";
import getTenantModel from "../models/system/Tenant";
import { Connection } from "mongoose";

const JWT_SECRET = process.env.JWT_SECRET!;

declare global {
    namespace Express {
        interface Request {
            userId?: string;
            tenantId?: string;
            role?: string;
            tenantDB?: Connection;
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

        // Check if tenant has database provisioned
        const Tenant = await getTenantModel();
        const tenant = await Tenant.findById(decoded.tenantId);

        if (!tenant) {
            return res.status(404).json({ error: "Tenant not found" });
        }

        // KEY FIX: Check if tenant has dbName before trying to connect
        if (!tenant.dbName) {
            console.log(`ℹ️  Tenant ${decoded.tenantId} not provisioned yet`);
            req.tenantProvisioned = false;
            req.tenantDB = undefined;
            return next(); // Allow request to continue (for provisioning endpoint)
        }

        // Only connect if dbName exists
        try {
            const tenantDB = await getTenantDB(decoded.tenantId);
            req.tenantDB = tenantDB;
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
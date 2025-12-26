// src/config/tenantDb.ts - FIXED getOrCreateModel

import mongoose, { Connection } from "mongoose";

const SYSTEM_DB_URI = process.env.SYSTEM_DB_URI || "mongodb://127.0.0.1:27017/system";
const isDocker = process.env.DOCKER === "true";
const tenantConnections = new Map<string, Connection>();
let systemConnection: Connection | null = null;

export async function getSystemDB(): Promise<Connection> {
    if (systemConnection) return systemConnection;

    systemConnection = mongoose.createConnection(SYSTEM_DB_URI, {
        maxPoolSize: 10,
        minPoolSize: 2,
    });

    await systemConnection.asPromise();
    console.log("✅ System DB connected");

    return systemConnection;
}

/**
 * Helper para obtener o crear modelos de forma segura
 * IMPORTANTE: Fuerza strict mode si no está definido en el schema
 */
export function getOrCreateModel(
    connection: Connection,
    name: string,
    schema: mongoose.Schema
) {
    if (connection.models[name]) {
        return connection.models[name];
    }

    // CRÍTICO: Forzar strict mode si no está configurado
    if (schema.get('strict') === undefined) {
        schema.set('strict', true);
        console.log(`⚠️  Forcing strict mode for model: ${name}`);
    }

    return connection.model(name, schema);
}

export async function getTenantDB(tenantId: string, detailId: string): Promise<Connection> {
    console.log(`🔍 getTenantDB called for tenant: ${tenantId}, detail: ${detailId}`);

    if (tenantConnections.has(detailId)) {
        console.log(`✅ Using cached connection for detail: ${detailId}`);
        return tenantConnections.get(detailId)!;
    }

    try {
        const getTenantModel = (await import("../models/system/Tenant")).default;
        const getTenantDetailModel = (await import("../models/system/TenantDetail")).default;

        const Tenant = await getTenantModel();
        const TenantDetail = await getTenantDetailModel();

        const tenant = await Tenant.findById(tenantId);
        if (!tenant) {
            console.error(`❌ Tenant ${tenantId} not found`);
            throw new Error(`Tenant ${tenantId} not found`);
        }

        const detail = await TenantDetail.findOne({
            _id: detailId,
            tenantId: tenantId
        });

        if (!detail) {
            console.error(`❌ TenantDetail ${detailId} not found`);
            throw new Error(`TenantDetail ${detailId} not found`);
        }

        console.log(`📋 TenantDetail found: ${detail._id}, dbName: ${detail.dbName}`);

        if (!detail.dbName) {
            console.error(`❌ TenantDetail ${detailId} has no dbName`);
            throw new Error(`TenantDetail ${detailId} has no dbName`);
        }

        const dbUri = isDocker
            ? `mongodb://admin:admin123@godigital-mongo:27017/${detail.dbName}?authSource=admin`
            : `mongodb://127.0.0.1:27017/${detail.dbName}`;
        // const dbUri = `mongodb://admin:admin123@godigital-mongo:27017/${detail.dbName}?authSource=admin` || `mongodb://127.0.0.1:27017/${detail.dbName}`;
        // console.log(`🔗 Connecting to: ${dbUri}`);

        const connection = mongoose.createConnection(dbUri, {
            maxPoolSize: 5,
            minPoolSize: 1,
        });

        await connection.asPromise();
        console.log(`✅ Tenant DB connected: ${detail.dbName}`);

        tenantConnections.set(detailId, connection);

        return connection;
    } catch (error: any) {
        console.error(`❌ Error getting tenant DB:`, error.message);
        throw error;
    }
}

export async function closeTenantDB(detailId: string): Promise<void> {
    const conn = tenantConnections.get(detailId);
    if (conn) {
        await conn.close();
        tenantConnections.delete(detailId);
        console.log(`🔒 Tenant DB closed: ${detailId}`);
    }
}

export async function closeTenantConnections(tenantId: string): Promise<void> {
    const getTenantDetailModel = (await import("../models/system/TenantDetail")).default;
    const TenantDetail = await getTenantDetailModel();

    const details = await TenantDetail.find({ tenantId }).select('_id');

    for (const detail of details) {
        await closeTenantDB(detail._id.toString());
    }
}

export async function closeAllConnections(): Promise<void> {
    for (const [detailId, conn] of tenantConnections.entries()) {
        await conn.close();
        console.log(`🔒 Tenant DB closed: ${detailId}`);
    }
    tenantConnections.clear();

    if (systemConnection) {
        await systemConnection.close();
        systemConnection = null;
        console.log("🔒 System DB closed");
    }
}
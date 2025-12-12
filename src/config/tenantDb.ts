// src/config/tenantDb.ts (with debugging)
import mongoose, { Connection } from "mongoose";

const SYSTEM_DB_URI = process.env.SYSTEM_DB_URI || "mongodb://127.0.0.1:27017/system";

// Cache de conexiones
const tenantConnections = new Map<string, Connection>();
let systemConnection: Connection | null = null;

/**
 * Obtiene la conexión al System Database
 */
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
 */
export function getOrCreateModel(
    connection: Connection,
    name: string,
    schema: mongoose.Schema
) {
    if (connection.models[name]) {
        return connection.models[name];
    }
    return connection.model(name, schema);
}

/**
 * Obtiene la conexión a la base de datos de un tenant específico
 */
export async function getTenantDB(tenantId: string): Promise<Connection> {
    console.log(`🔍 getTenantDB called for tenantId: ${tenantId}`);

    // Verificar cache
    if (tenantConnections.has(tenantId)) {
        console.log(`✅ Using cached connection for tenant: ${tenantId}`);
        return tenantConnections.get(tenantId)!;
    }

    try {
        // ⭐ IMPORTANTE: Importar el modelo, NO crearlo aquí
        const getTenantModel = (await import("../models/system/Tenant")).default;
        const Tenant = await getTenantModel();

        const tenant = await Tenant.findById(tenantId);

        if (!tenant) {
            console.error(`❌ Tenant ${tenantId} not found`);
            throw new Error(`Tenant ${tenantId} not found`);
        }

        console.log(`📋 Tenant found: ${tenant._id}, dbName: ${tenant.dbName || 'NULL'}`);

        if (!tenant.dbName) {
            console.error(`❌ Tenant ${tenantId} has no dbName configured`);
            throw new Error(`Tenant ${tenantId} has no dbName configured`);
        }

        // Crear nueva conexión para el tenant
        const dbUri = `mongodb://127.0.0.1:27017/${tenant.dbName}`;
        console.log(`🔗 Connecting to: ${dbUri}`);

        const connection = mongoose.createConnection(dbUri, {
            maxPoolSize: 5,
            minPoolSize: 1,
        });

        await connection.asPromise();
        console.log(`✅ Tenant DB connected: ${tenant.dbName}`);

        // Guardar en cache
        tenantConnections.set(tenantId, connection);

        return connection;
    } catch (error: any) {
        console.error(`❌ Error getting tenant DB for ${tenantId}:`, error.message);
        console.error(`Stack trace:`, error.stack);
        throw error;
    }
}

/**
 * Cierra la conexión de un tenant
 */
export async function closeTenantDB(tenantId: string): Promise<void> {
    const conn = tenantConnections.get(tenantId);
    if (conn) {
        await conn.close();
        tenantConnections.delete(tenantId);
        console.log(`🔒 Tenant DB closed: ${tenantId}`);
    }
}

/**
 * Cierra todas las conexiones
 */
export async function closeAllConnections(): Promise<void> {
    for (const [tenantId, conn] of tenantConnections.entries()) {
        await conn.close();
        console.log(`🔒 Tenant DB closed: ${tenantId}`);
    }
    tenantConnections.clear();

    if (systemConnection) {
        await systemConnection.close();
        systemConnection = null;
        console.log("🔒 System DB closed");
    }
}
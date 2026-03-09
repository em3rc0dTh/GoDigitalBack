// src/services/temporal.ts
// Singleton del cliente Temporal para GoDigitalBack.
// Requiere instalar: npm install @temporalio/client
//
// Activar con: USE_TEMPORAL=true en .env
// Servidor:    TEMPORAL_ADDRESS=localhost:7233

import { Client, Connection } from '@temporalio/client';

let _client: Client | null = null;
let _connection: Connection | null = null;

/** ¿Está habilitado Temporal mediante feature flag? */
export function isTemporalEnabled(): boolean {
    return process.env.USE_TEMPORAL === 'true';
}

/**
 * Retorna el cliente Temporal (singleton con lazy init).
 * Si Temporal no está disponible, lanza error — siempre envuelve en try/catch.
 */
export async function getTemporalClient(): Promise<Client> {
    if (_client) return _client;

    _connection = await Connection.connect({
        address: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233',
    });

    _client = new Client({ connection: _connection });
    console.log('✅ [Temporal] Cliente conectado a', process.env.TEMPORAL_ADDRESS ?? 'localhost:7233');
    return _client;
}

/** Convención de ID de workflow para PaymentRequests */
export function prWorkflowId(prId: string): string {
    return `payment-request-${prId}`;
}

/** Cierra la conexión (útil en shutdown graceful) */
export async function closeTemporalConnection(): Promise<void> {
    if (_connection) {
        await _connection.close();
        _client = null;
        _connection = null;
    }
}

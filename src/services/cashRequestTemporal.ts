// src/services/cashRequestTemporal.ts
// Integración Temporal para el módulo CashRequest.
// Mismo patrón que paymentRequestTemporal.ts.

import { getTemporalClient, isTemporalEnabled } from './temporal';

export function crWorkflowId(crId: string): string {
    return `cash-request-${crId}`;
}

// ── Start workflow ─────────────────────────────────────────────────────────────
export async function startCRWorkflow(input: Record<string, unknown>): Promise<void> {
    if (!isTemporalEnabled()) return;
    try {
        const client = await getTemporalClient();
        const wfId = crWorkflowId(input._id as string);
        await client.workflow.start('cashRequestWorkflow', {
            taskQueue: 'cash-requests',
            workflowId: wfId,
            args: [input],
        });
        console.log(`✅ [Temporal] CashRequest Workflow iniciado — ${wfId}`);
        console.log(`   🌐 http://localhost:8080/namespaces/default/workflows/${wfId}`);
    } catch (err: any) {
        console.error('⚠️ [Temporal] Error iniciando CR workflow:', err?.message);
    }
}

// ── Signals ────────────────────────────────────────────────────────────────────
async function sendSignal(crId: string, signalName: string, payload: unknown): Promise<void> {
    if (!isTemporalEnabled()) return;
    try {
        const client = await getTemporalClient();
        const handle = client.workflow.getHandle(crWorkflowId(crId));
        await handle.signal(signalName, payload);
        console.log(`✅ [Temporal] Signal '${signalName}' enviada — CR ${crId}`);
    } catch (err: any) {
        console.error(`⚠️ [Temporal] Error señal '${signalName}':`, err?.message);
    }
}

export const signalApprove = (crId: string, userId: string, userName: string, notes?: string) =>
    sendSignal(crId, 'aprobar', { userId, userName, notes });

export const signalAuthorize = (
    crId: string, userId: string, userName: string,
    authorizedAmount: number, expensePeriodDays: number, notes?: string,
) => sendSignal(crId, 'autorizar', { userId, userName, authorizedAmount, expensePeriodDays, notes });

export const signalPay = (crId: string, userId: string, userName: string, paymentProof: string, notes?: string) =>
    sendSignal(crId, 'pagar', { userId, userName, paymentProof, notes });

export const signalSubmitExpense = (
    crId: string, userId: string, userName: string,
    totalSpent: number, files: string[], notes?: string,
) => sendSignal(crId, 'submit_expense', { userId, userName, totalSpent, files, notes });

export const signalReview = (
    crId: string, userId: string, userName: string,
    totalSpent: number, authorizedAmount: number, balance: number, notes?: string,
) => sendSignal(crId, 'iniciar_revision', { userId, userName, totalSpent, authorizedAmount, balance, notes });

export const signalClose = (crId: string, userId: string, userName: string, proof?: string, notes?: string) =>
    sendSignal(crId, 'cerrar', { userId, userName, proof, notes });

export const signalReject = (crId: string, userId: string, userName: string, reason: string) =>
    sendSignal(crId, 'rechazar', { userId, userName, reason });

// ── Query status ───────────────────────────────────────────────────────────────
export async function getCRWorkflowStatus(crId: string): Promise<unknown | null> {
    if (!isTemporalEnabled()) return null;
    try {
        const client = await getTemporalClient();
        const handle = client.workflow.getHandle(crWorkflowId(crId));
        return await handle.query('estado');
    } catch (err: any) {
        console.error('⚠️ [Temporal] Error consultando estado CR:', err?.message);
        return null;
    }
}

// ── Build input from Mongoose docs ────────────────────────────────────────────
export function buildCRInput(
    doc: any,
    project: any,
    employee: any,
    supervisor: any,
    superAdmin: any,
    tenantDetailId: string,
): Record<string, unknown> {
    return {
        _id:             doc._id.toString(),
        tenantId:        tenantDetailId,
        projectId:       doc.project_id?.toString() ?? '',
        projectName:     project?.name ?? 'Unknown Project',
        employeeId:      doc.created_by?.toString() ?? '',
        employeeName:    employee?.name ?? 'Unknown',
        employeeEmail:   employee?.email ?? '',
        supervisorEmail: supervisor?.email ?? '',
        supervisorName:  supervisor?.name ?? '',
        superAdminEmail: superAdmin?.email ?? '',
        superAdminName:  superAdmin?.name ?? '',
        requestedAmount: doc.requested_amount ?? 0,
        currency:        doc.currency ?? 'PEN',
        purpose:         doc.purpose ?? '',
        notes:           doc.notes,
        status:          'created',
    };
}

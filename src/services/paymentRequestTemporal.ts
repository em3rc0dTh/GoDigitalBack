// src/services/paymentRequestTemporal.ts
// Funciones de integración Temporal para el módulo PaymentRequest.
//
// Patrón de uso en los controllers:
//   const { temporalPR } = await import('../services/paymentRequestTemporal');
//   await temporalPR.start(doc, project, provider, creator, owner);
//   await temporalPR.signalApprove(prId, userId, userName, notes);
//   ...
//
// Todas las funciones tienen try/catch interno — NUNCA rompen el endpoint.

import { getTemporalClient, isTemporalEnabled, prWorkflowId } from './temporal';

// ── Tipo de datos que se envía al workflow al iniciarse ────────────────────────
// Corresponde exactamente a PaymentRequest en temporal-suite/workflows/src/paymentRequest/types.ts
interface TemporalPRInput {
    _id: string;
    tenantId: string;
    projectId: string;
    projectName: string;
    providerId: string;
    providerName: string;
    subtotal: number;
    tax: number;
    total: number;
    currency: string;
    date?: string;
    dueDate?: string;
    notes?: string;
    status: 'pending';
    createdBy: string;
    createdByName: string;
    createdByEmail: string;
    projectOwnerEmail: string;
    projectOwnerName: string;
    attachments?: string[];
}

// ── Tarea: arrancar el workflow ────────────────────────────────────────────────
export async function startPRWorkflow(input: TemporalPRInput): Promise<void> {
    if (!isTemporalEnabled()) return;

    try {
        const client = await getTemporalClient();
        const wfId = prWorkflowId(input._id);

        await client.workflow.start('paymentRequestWorkflow', {
            taskQueue: 'payment-requests',
            workflowId: wfId,
            args: [input],
        });

        console.log(`✅ [Temporal] Workflow iniciado — ${wfId}`);
        console.log(`   🌐 http://localhost:8080/namespaces/default/workflows/${wfId}`);
    } catch (err: any) {
        console.error('⚠️ [Temporal] Error iniciando workflow PR (no afecta la respuesta):', err?.message);
    }
}

// ── Tarea: señal de aprobación ─────────────────────────────────────────────────
export async function signalApprove(
    prId: string,
    userId: string,
    userName: string,
    notes?: string,
): Promise<void> {
    if (!isTemporalEnabled()) return;

    try {
        const client = await getTemporalClient();
        const handle = client.workflow.getHandle(prWorkflowId(prId));
        await handle.signal('aprobar', { userId, userName, notes });
        console.log(`✅ [Temporal] Signal 'aprobar' enviada — PR ${prId}`);
    } catch (err: any) {
        console.error('⚠️ [Temporal] Error señal aprobar:', err?.message);
    }
}

// ── Tarea: señal de autorización ───────────────────────────────────────────────
export async function signalAuthorize(
    prId: string,
    userId: string,
    userName: string,
    paymentDate: string,
    bankAccountId: string,
    bankAccountName: string,
    notes?: string,
): Promise<void> {
    if (!isTemporalEnabled()) return;

    try {
        const client = await getTemporalClient();
        const handle = client.workflow.getHandle(prWorkflowId(prId));
        await handle.signal('autorizar', {
            userId,
            userName,
            paymentDate,
            bankAccountId,
            bankAccountName,
            notes,
        });
        console.log(`✅ [Temporal] Signal 'autorizar' enviada — PR ${prId}`);
    } catch (err: any) {
        console.error('⚠️ [Temporal] Error señal autorizar:', err?.message);
    }
}

// ── Tarea: señal de pago ───────────────────────────────────────────────────────
export async function signalPay(
    prId: string,
    userId: string,
    userName: string,
    paymentProof: string,
    notes?: string,
): Promise<void> {
    if (!isTemporalEnabled()) return;

    try {
        const client = await getTemporalClient();
        const handle = client.workflow.getHandle(prWorkflowId(prId));
        await handle.signal('pagar', { userId, userName, paymentProof, notes });
        console.log(`✅ [Temporal] Signal 'pagar' enviada — PR ${prId}`);
    } catch (err: any) {
        console.error('⚠️ [Temporal] Error señal pagar:', err?.message);
    }
}

// ── Tarea: señal de rechazo ────────────────────────────────────────────────────
export async function signalReject(
    prId: string,
    userId: string,
    userName: string,
    reason: string,
): Promise<void> {
    if (!isTemporalEnabled()) return;

    try {
        const client = await getTemporalClient();
        const handle = client.workflow.getHandle(prWorkflowId(prId));
        await handle.signal('rechazar', { userId, userName, reason });
        console.log(`✅ [Temporal] Signal 'rechazar' enviada — PR ${prId}`);
    } catch (err: any) {
        console.error('⚠️ [Temporal] Error señal rechazar:', err?.message);
    }
}

// ── Tarea: consultar estado del workflow ───────────────────────────────────────
export async function getWorkflowStatus(prId: string): Promise<unknown | null> {
    if (!isTemporalEnabled()) return null;

    try {
        const client = await getTemporalClient();
        const handle = client.workflow.getHandle(prWorkflowId(prId));
        const status = await handle.query('estado');
        return status;
    } catch (err: any) {
        console.error('⚠️ [Temporal] Error consultando estado:', err?.message);
        return null;
    }
}

// ── Helper para construir el input del workflow desde documentos de Mongoose ───
export function buildTemporalPRInput(
    doc: any,
    project: any,
    provider: any,
    creator: any,
    owner: any,
    tenantDetailId: string,
): TemporalPRInput {
    return {
        _id: doc._id.toString(),
        tenantId: tenantDetailId,
        projectId: doc.project_id?.toString() ?? '',
        projectName: project?.name ?? 'Unknown Project',
        providerId: doc.provider_id?.toString() ?? '',
        providerName: provider?.name ?? 'Unknown Provider',
        subtotal: doc.subtotal ?? 0,
        tax: doc.tax ?? 0,
        total: doc.total ?? 0,
        currency: doc.currency ?? 'USD',
        date: doc.date?.toISOString().split('T')[0],
        dueDate: doc.dueDate?.toISOString().split('T')[0],
        notes: doc.notes,
        status: 'pending',
        createdBy: doc.created_by?.toString() ?? '',
        createdByName: creator?.name ?? 'Unknown',
        createdByEmail: creator?.email ?? '',
        projectOwnerEmail: owner?.email ?? '',
        projectOwnerName: owner?.name ?? '',
        attachments: doc.attachments ?? [],
    };
}

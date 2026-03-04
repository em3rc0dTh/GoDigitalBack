import { ParsedTransaction } from './parser';

export interface NormalizedTransaction {
    amount: number;
    currency: string;
    date: Date;
    description: string;
    bank: string;
    confidence: number;
}

/**
 * Normaliza transacción cruda
 */
export function normalizeTransaction(
    tx: ParsedTransaction,
    from: string
): NormalizedTransaction {

    return {
        amount: tx.monto ? parseFloat(tx.monto) : 0,
        currency: tx.currency ?? 'PEN',
        date: tx.fecha ? parseDate(tx.fecha) : new Date(),
        description: tx.descripcion ?? '',
        bank: detectBank(from),
        confidence: calculateConfidence(tx)
    };
}

/* Helpers */

function parseDate(date: string): Date {
    const [d, m, y] = date.split('/');
    return new Date(`${y}-${m}-${d}`);
}

function detectBank(from: string): string {
    if (from.includes('bcp')) return 'BCP';
    if (from.includes('interbank')) return 'INTERBANK';
    return 'UNKNOWN';
}

function calculateConfidence(tx: ParsedTransaction): number {
    let score = 0;
    if (tx.monto) score += 0.4;
    if (tx.fecha) score += 0.4;
    if (tx.descripcion) score += 0.2;
    return score;
}

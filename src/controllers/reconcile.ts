
import { Request, Response } from 'express';
import mongoose from 'mongoose';
import getTenantDetailModel from '../models/system/TenantDetail';
import { getSystemEmailRawModel } from '../models/system/SystemEmailRaw';
import { getSystemDB, getTenantDB } from '../config/tenantDb';
import { getAccountModel } from '../models/tenant/Account';
import { getTransactionModel } from '../models/tenant/Transaction';
import { getTransactionRawPDFModel } from '../models/tenant/TransactionRawPDF';
import { TransactionRawIMAPSchema } from '../models/tenant/TransactionRawIMAP';
import { recoService } from '../services/reco';
import { findAccountByPartialNumber } from '../services/accountMatch';
import axios from 'axios';
// Helper to extract numeric amount from string "S/ 1,250.00" or similar
function extractAmount(text: string): number | null {
    const match = text.match(/(?:S\/|USD|\$)\s?([\d,]+\.?\d*)/i);
    if (match && match[1]) {
        return parseFloat(match[1].replace(/,/g, ''));
    }
    return null;
}

// Helper to extract account number (simple pattern for 13-14 digits or 3-4 blocks)
function extractAccount(text: string, context: 'origin' | 'destination'): string | null {
    // Regex for typical format 191-12345678-0-99 or similar
    // We look for patterns like XXX-XXXXXXXX-X-XX
    const accounts = text.match(/\d{3,4}-\d{7,8}-\d{1}-\d{2}/g);

    if (!accounts) return null;

    if (context === 'destination') {
        const destMatch = text.match(/(?:a la cuenta|Hacia la cuenta)[:\s]+(\d{3,4}-\d{7,8}-\d{1}-\d{2})/i);
        if (destMatch) return destMatch[1];
        if (accounts.length > 1) return accounts[1];
        return accounts[0];
    }

    if (context === 'origin') {
        const originMatch = text.match(/(?:Desde la cuenta)[:\s]+(\d{3,4}-\d{7,8}-\d{1}-\d{2})/i);
        if (originMatch) return originMatch[1];
        if (accounts.length > 0) return accounts[0];
    }

    return null;
}

import { syncService } from '../services/syncService';

export const reconcileAll = async (req: Request, res: Response) => {
    try {
        const { tenantDetailId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(tenantDetailId)) {
            return res.status(400).json({ error: 'Invalid tenantDetailId' });
        }

        console.log(`\n🔄 [Manual Request] Reconciliación solicitada para: ${tenantDetailId}`);

        // Usamos la lógica centralizada
        await syncService.syncTenant(tenantDetailId);

        res.status(200).json({
            message: 'Reconciliation finished successfully',
        });

    } catch (error: any) {
        console.error("Reconciliation error:", error);
        res.status(500).json({ error: error.message });
    }
};


// src/services/syncService.ts
import mongoose from 'mongoose';
import axios from 'axios';
import getTenantDetailModel from '../models/system/TenantDetail';
import { getSystemEmailRawModel } from '../models/system/SystemEmailRaw';
import { getSystemDB, getTenantDB } from '../config/tenantDb';
import { getAccountModel } from '../models/tenant/Account';
import { getTransactionModel } from '../models/tenant/Transaction';
import { getTransactionRawPDFModel } from '../models/tenant/TransactionRawPDF';
import { TransactionRawIMAPSchema } from '../models/tenant/TransactionRawIMAP';
import { recoService } from './reco';
import { findAccountByPartialNumber } from './accountMatch';

// Helpers extracted from reconcile controller
function extractAmount(text: string): number | null {
    const match = text.match(/(?:S\/|USD|\$)\s?([\d,]+\.?\d*)/i);
    if (match && match[1]) {
        return parseFloat(match[1].replace(/,/g, ''));
    }
    return null;
}

function extractAccount(text: string, context: 'origin' | 'destination'): string | null {
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

export class SyncService {
    /**
     * Sincroniza todos los tenants activos
     */
    async syncAllTenants() {
        console.log("🚀 [Sync] Iniciando sincronización global de todos los tenants...");
        const TenantDetail = await getTenantDetailModel();
        const allDetails = await TenantDetail.find({});

        const summary = {
            totalTenants: allDetails.length,
            processed: 0,
            errors: 0
        };

        for (const detail of allDetails) {
            try {
                await this.syncTenant(detail._id.toString());
                summary.processed++;
            } catch (err) {
                console.error(`❌ [Sync] Error sincronizando tenant ${detail._id}:`, err);
                summary.errors++;
            }
        }

        console.log(`🏁 [Sync] Finalizado: ${summary.processed} exitosos, ${summary.errors} errores.`);
        return summary;
    }

    /**
     * Sincroniza un tenant específico (Gmail, IMAP, Web, Statements)
     */
    async syncTenant(tenantDetailId: string) {
        const TenantDetail = await getTenantDetailModel();
        const detail = await TenantDetail.findById(tenantDetailId);
        if (!detail) throw new Error('TenantDetail not found');

        const tenantId = detail.tenantId.toString();
        const entityId = detail._id.toString();

        console.log(`\n[Sync] ─────────────────────────────────────────────────────────`);
        console.log(`[Sync] Procesando ${detail.dbName} (${entityId})`);

        // 1. GMAIL API
        try {
            const SystemEmailRaw = await getSystemEmailRawModel();
            const gmailTransactions = await SystemEmailRaw.find({
                'routing.entityId': new mongoose.Types.ObjectId(entityId),
                processed: false
            }).lean();

            if (gmailTransactions.length > 0) {
                const result = await recoService.ingest(tenantId, entityId, 'GMAIL', gmailTransactions);
                if (result.processedIds?.length > 0) {
                    await SystemEmailRaw.updateMany(
                        { _id: { $in: result.processedIds } },
                        { $set: { processed: true, processedAt: new Date() } }
                    );
                }
                console.log(`✅ [Gmail] ${gmailTransactions.length} items procesados.`);
            }
        } catch (e: any) {
            console.error(`❌ [Gmail] Error: ${e.message}`);
        }

        const tenantDB = await getTenantDB(tenantId, entityId);

        // 2. WEB TRANSACTIONS
        try {
            const Account = getAccountModel(tenantDB);
            const accounts = await Account.find({ entity_id: new mongoose.Types.ObjectId(entityId) });

            for (const account of accounts) {
                const Transaction = getTransactionModel(tenantDB, account.account_number);
                const transactions = await Transaction.find({ accountId: account._id, processed: false }).lean();

                if (transactions.length > 0) {
                    const transactionsWithAccount = transactions.map((t: any) => ({
                        ...t,
                        source_account: account.account_number
                    }));

                    const result = await recoService.ingest(tenantId, entityId, 'WEB', transactionsWithAccount);
                    if (result.processedIds?.length > 0) {
                        await Transaction.updateMany(
                            { _id: { $in: result.processedIds } },
                            { $set: { processed: true, processedAt: new Date() } }
                        );
                    }
                }
            }
            console.log(`✅ [Web] Procesado para ${accounts.length} cuentas.`);
        } catch (e: any) {
            console.error(`❌ [Web] Error: ${e.message}`);
        }

        // 3. STATEMENTS
        try {
            const TransactionRawPDF = await getTransactionRawPDFModel(tenantId, entityId);
            const statements = await TransactionRawPDF.find({
                "routing.entityId": new mongoose.Types.ObjectId(entityId),
                processed: false
            }).lean();

            if (statements.length > 0) {
                const result = await recoService.ingest(tenantId, entityId, 'Statement', statements);
                if (result.processedIds?.length > 0) {
                    await TransactionRawPDF.updateMany(
                        { _id: { $in: result.processedIds } },
                        { $set: { processed: true, processedAt: new Date() } }
                    );
                }
                console.log(`✅ [Statements] ${statements.length} items procesados.`);
            }
        } catch (e: any) {
            console.error(`❌ [Statements] Error: ${e.message}`);
        }

        // 4. IMAP
        try {
            const systemDB = await getSystemDB();
            const IMAP_SERVICE_URL = process.env.IMAP_SERVICE_URL || "http://localhost:8000";
            if (!detail.dbName) throw new Error("TenantDetail has no dbName");

            const targetTenantDB = systemDB.useDb(detail.dbName);
            const TransactionRawIMAPModel = targetTenantDB.models.Transaction_Raw_IMAP || targetTenantDB.model("Transaction_Raw_IMAP", TransactionRawIMAPSchema);

            const response = await axios.get(`${IMAP_SERVICE_URL}/emails/raw/by-tenant-detail/${entityId}`, {
                headers: { "x-database-name": detail.dbName }
            });

            const imapTransactions = Array.isArray(response.data) ? response.data : (response.data.data || []);

            if (imapTransactions.length > 0) {
                for (const tx of imapTransactions) {
                    // Extraction regex logic...
                    const hasVars = tx.transactionVariables && (tx.transactionVariables.amount || tx.transactionVariables.originAccount);
                    if (!hasVars) {
                        const content = tx.text_body || tx.html_body || "";
                        if (content.length > 10) {
                            const amount = extractAmount(content);
                            const destinationAccount = extractAccount(content, 'destination');
                            const originAccount = extractAccount(content, 'origin');

                            if (amount !== null) {
                                const newVars = {
                                    amount: amount,
                                    currency: content.includes("USD") || content.includes("$") ? "USD" : "PEN",
                                    operationDate: tx.fetched_at || new Date(),
                                    operationNumber: null,
                                    originAccount: originAccount,
                                    destinationAccount: destinationAccount
                                };
                                tx.transactionVariables = newVars;
                                tx.transactionType = "Transferencia";
                                await TransactionRawIMAPModel.updateOne({ _id: tx._id }, { $set: { transactionVariables: newVars, transactionType: tx.transactionType } });
                            }
                        }
                    }

                    if (tx.source_account) {
                        const match = await findAccountByPartialNumber(tenantDB, tx.source_account);
                        if (match) tx.source_account = match.account_number;
                    }
                    if (tx.transactionVariables?.originAccount) {
                        const match = await findAccountByPartialNumber(tenantDB, tx.transactionVariables.originAccount);
                        if (match) tx.transactionVariables.originAccount = match.account_number;
                    }
                    if (tx.destination_account) {
                        const match = await findAccountByPartialNumber(tenantDB, tx.destination_account);
                        if (match) tx.destination_account = match.account_number;
                    }
                    if (tx.transactionVariables?.destinationAccount) {
                        const match = await findAccountByPartialNumber(tenantDB, tx.transactionVariables.destinationAccount);
                        if (match) tx.transactionVariables.destinationAccount = match.account_number;
                    }
                }

                const result = await recoService.ingest(tenantId, entityId, 'IMAP', imapTransactions);
                if (result.processedIds?.length > 0) {
                    await TransactionRawIMAPModel.updateMany(
                        { _id: { $in: result.processedIds } },
                        { $set: { processed: true, processedAt: new Date() } }
                    );
                }
                console.log(`✅ [IMAP] ${imapTransactions.length} items procesados.`);
            }
        } catch (e: any) {
            if (e.code !== 26 && e.name !== 'MissingSchemaError') {
                console.error(`❌ [IMAP] Error: ${e.message}`);
            }
        }
    }
}

export const syncService = new SyncService();

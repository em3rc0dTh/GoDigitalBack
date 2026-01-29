
import { Request, Response } from 'express';
import mongoose from 'mongoose';
import getTenantDetailModel from '../models/system/TenantDetail';
import { getSystemEmailRawModel } from '../models/system/SystemEmailRaw';
import { getTenantDB } from '../config/tenantDb';
import { getAccountModel } from '../models/tenant/Account';
import { getTransactionModel } from '../models/tenant/Transaction';
import { getTransactionRawPDFModel } from '../models/tenant/TransactionRawPDF';
import { TransactionRawIMAPSchema } from '../models/tenant/TransactionRawIMAP';
import { recoService } from '../services/reco';

export const reconcileAll = async (req: Request, res: Response) => {
    try {
        const { tenantDetailId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(tenantDetailId)) {
            return res.status(400).json({ error: 'Invalid tenantDetailId' });
        }

        const TenantDetail = await getTenantDetailModel();
        const detail = await TenantDetail.findById(tenantDetailId);

        if (!detail) {
            return res.status(404).json({ error: 'TenantDetail not found' });
        }

        const tenantId = detail.tenantId.toString();
        const entityId = detail._id.toString();

        const results = {
            gmail: 0,
            web: 0,
            statements: 0,
            imap: 0,
            errors: [] as string[]
        };

        // 1. GMAIL API (SystemEmailRaw)
        try {
            console.log(`🔄 Syncing Gmail API for ${entityId}...`);
            const SystemEmailRaw = await getSystemEmailRawModel();

            // "read all gmail api transactions only with the tenantDetailId"
            const gmailTransactions = await SystemEmailRaw.find({
                'routing.entityId': new mongoose.Types.ObjectId(entityId),
                processed: false
            }).lean();

            if (gmailTransactions.length > 0) {
                const result = await recoService.ingest(
                    tenantId,
                    entityId,
                    'GMAIL',
                    gmailTransactions
                );

                if (result.processedIds && result.processedIds.length > 0) {
                    await SystemEmailRaw.updateMany(
                        { _id: { $in: result.processedIds } },
                        { $set: { processed: true, processedAt: new Date() } }
                    );
                    console.log(`✅ Marked ${result.processedIds.length} Gmail items as processed.`);
                }
                results.gmail = gmailTransactions.length;
            }
        } catch (error: any) {
            console.error("Error syncing Gmail:", error);
            results.errors.push(`Gmail: ${error.message}`);
        }

        const tenantDB = await getTenantDB(tenantId, entityId);

        // 2. WEB TRANSACTIONS
        try {
            console.log(`🔄 Syncing Web Transactions for ${entityId}...`);
            const Account = getAccountModel(tenantDB);
            // Find accounts linked to this entity (if applicable) or all accounts in this tenantDB context?
            // TenantDetail usually implies one entity. 
            // In Account schema: entity_id: { type: mongoose.Schema.Types.ObjectId, default: null }
            const accounts = await Account.find({ entity_id: new mongoose.Types.ObjectId(entityId) });

            let totalWeb = 0;
            for (const account of accounts) {
                const Transaction = getTransactionModel(tenantDB, account.account_number);

                const transactions = await Transaction.find({
                    accountId: account._id,
                    processed: false
                }).lean();

                if (transactions.length > 0) {
                    const transactionsWithAccount = transactions.map((t: any) => ({
                        ...t,
                        source_account: account.account_number
                    }));

                    const result = await recoService.ingest(
                        tenantId,
                        entityId,
                        'WEB',
                        transactionsWithAccount
                    );

                    if (result.processedIds && result.processedIds.length > 0) {
                        await Transaction.updateMany(
                            { _id: { $in: result.processedIds } },
                            { $set: { processed: true, processedAt: new Date() } }
                        );
                    }
                    totalWeb += transactions.length;
                }
            }
            results.web = totalWeb;

        } catch (error: any) {
            console.error("Error syncing Web:", error);
            results.errors.push(`Web: ${error.message}`);
        }

        // 3. STATEMENTS (PDF)
        try {
            console.log(`🔄 Syncing Statements for ${entityId}...`);
            const TransactionRawPDF = await getTransactionRawPDFModel(tenantId, entityId);
            const statements = await TransactionRawPDF.find({
                "routing.entityId": new mongoose.Types.ObjectId(entityId),
                processed: false
            }).lean();

            if (statements.length > 0) {
                const result = await recoService.ingest(
                    tenantId,
                    entityId,
                    'Statement',
                    statements
                );

                if (result.processedIds && result.processedIds.length > 0) {
                    await TransactionRawPDF.updateMany(
                        { _id: { $in: result.processedIds } },
                        { $set: { processed: true, processedAt: new Date() } }
                    );
                }
                results.statements = statements.length;
            }
        } catch (error: any) {
            console.error("Error syncing Statements:", error);
            results.errors.push(`Statements: ${error.message}`);
        }

        // 4. IMAP
        try {
            console.log(`🔄 Syncing IMAP for ${entityId}...`);
            // Check if collection exists or model
            const TransactionRawIMAP = tenantDB.models.Transaction_Raw_IMAP || tenantDB.model("Transaction_Raw_IMAP", TransactionRawIMAPSchema);

            // IMAP items in the TenantDB are generally scoped to the tenant.
            // Since we lack specific routing info in the raw IMAP collection, we Fetch ALL items in this tenant context
            // and rely on RecoService to ingest them into the entity-specific master collection.

            const imapTransactions = await TransactionRawIMAP.find({ processed: false }).lean();

            if (imapTransactions.length > 0) {
                const result = await recoService.ingest(
                    tenantId,
                    entityId,
                    'IMAP',
                    imapTransactions
                );

                if (result.processedIds && result.processedIds.length > 0) {
                    await TransactionRawIMAP.updateMany(
                        { _id: { $in: result.processedIds } },
                        { $set: { processed: true, processedAt: new Date() } }
                    );
                }
                results.imap = imapTransactions.length;
            }

        } catch (error: any) {
            console.error("Error syncing IMAP:", error);
            // Don't fail if IMAP collection doesn't exist
            if (error.code !== 26 && error.name !== 'MissingSchemaError') {
                results.errors.push(`IMAP: ${error.message}`);
            }
        }

        res.status(200).json({
            message: 'Reconciliation started',
            details: results
        });

    } catch (error: any) {
        console.error("Reconciliation error:", error);
        res.status(500).json({ error: error.message });
    }
};

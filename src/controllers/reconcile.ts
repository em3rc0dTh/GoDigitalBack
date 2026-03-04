
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

            // Use tenantDetailId (entityId) to find the generic TenantDetail doc
            const systemDB = await getSystemDB();
            const IMAP_SERVICE_URL = process.env.IMAP_SERVICE_URL || "http://localhost:8000";
            if (!detail.dbName) {
                throw new Error("TenantDetail has no dbName");
            }

            console.log(`🔌 Fetching IMAP from external service for DB: ${detail.dbName}`);

            // Connect to DB just to update state later
            const targetTenantDB = systemDB.useDb(detail.dbName);
            const TransactionRawIMAPModel = targetTenantDB.models.Transaction_Raw_IMAP || targetTenantDB.model("Transaction_Raw_IMAP", TransactionRawIMAPSchema);

            // Fetch from the external backend endpoint
            const response = await axios.get(
                `${IMAP_SERVICE_URL}/emails/raw/by-tenant-detail/${entityId}`,
                {
                    headers: {
                        "x-database-name": detail.dbName
                    }
                }
            );

            // The external API likely returns the list of transactions in the response body
            // Let's assume response.data is the array of transactions or response.data.data
            const imapTransactions = Array.isArray(response.data) ? response.data : (response.data.data || []);

            console.log(`📥 Fetched ${imapTransactions.length} IMAP transactions from external service`);

            // Validate IMAP Accounts
            if (imapTransactions.length > 0) {

                // 🆕 Extraction Step for IMAP (REGEX Based - User Requested)
                for (const tx of imapTransactions) {

                    // If no structured vars, try extract from body
                    const hasVars = tx.transactionVariables && (tx.transactionVariables.amount || tx.transactionVariables.originAccount);

                    if (!hasVars) {
                        const content = tx.text_body || tx.html_body || "";
                        if (content.length > 10) {
                            // Extract Amount
                            const amount = extractAmount(content);

                            // Extract Accounts
                            const destinationAccount = extractAccount(content, 'destination');
                            const originAccount = extractAccount(content, 'origin');

                            if (amount !== null) {
                                console.log(`regex-extract: ${amount} | Or: ${originAccount} | De: ${destinationAccount}`);

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

                                await TransactionRawIMAPModel.updateOne(
                                    { _id: tx._id },
                                    {
                                        $set: {
                                            transactionVariables: newVars,
                                            transactionType: tx.transactionType
                                        }
                                    }
                                );
                            }
                        }
                    }

                    // ... (rest of account matching logic)

                    // Check 'source_account' if it exists in raw
                    if (tx.source_account) {
                        const match = await findAccountByPartialNumber(tenantDB, tx.source_account);
                        if (match) tx.source_account = match.account_number;
                    }
                    // Check nested transactionVariables if they exist
                    if (tx.transactionVariables?.originAccount) {
                        const match = await findAccountByPartialNumber(tenantDB, tx.transactionVariables.originAccount);
                        if (match) tx.transactionVariables.originAccount = match.account_number;
                    }

                    // Check 'destination_account'
                    if (tx.destination_account) {
                        const match = await findAccountByPartialNumber(tenantDB, tx.destination_account);
                        if (match) tx.destination_account = match.account_number;
                    }
                    if (tx.transactionVariables?.destinationAccount) {
                        const match = await findAccountByPartialNumber(tenantDB, tx.transactionVariables.destinationAccount);
                        if (match) tx.transactionVariables.destinationAccount = match.account_number;
                    }
                }

                const result = await recoService.ingest(
                    tenantId,
                    entityId,
                    'IMAP',
                    imapTransactions
                );

                if (result.processedIds && result.processedIds.length > 0) {
                    await TransactionRawIMAPModel.updateMany(
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

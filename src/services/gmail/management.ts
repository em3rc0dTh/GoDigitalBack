
import mongoose from 'mongoose';
import { google } from 'googleapis';
import getEmailForwardingConfigModel from '../../models/system/EmailForwardingConfig';
import getSystemEmailRawModel from '../../models/system/SystemEmailRaw';
import getGmailWatchModel from '../../models/system/GmailWatch';
import getTenantDetailModel from '../../models/system/TenantDetail';
import { getTenantDB } from '../../config/tenantDb';
import { getAccountModel } from '../../models/tenant/Account';
import { getTransactionRawModel } from '../../models/tenant/TransactionRaw';
import { TransactionRawIMAPSchema } from '../../models/tenant/TransactionRawIMAP';
import { getEmailMatcher } from './matcher';
import { getOAuth2Client } from './auth';
import { processMessage, processHistoryChanges } from './processor';

export class GmailManagementService {

    async createOrUpdateConfig(entityId: string, forwardingData: any[]) {
        const EmailForwardingConfig = await getEmailForwardingConfigModel();

        const config = await EmailForwardingConfig.findOneAndUpdate(
            { entityId: new mongoose.Types.ObjectId(entityId) },
            {
                forwardingData: forwardingData.map(rule => ({
                    email: rule.email.toLowerCase().trim(),
                    accounts: rule.accounts.map((id: string) => new mongoose.Types.ObjectId(id))
                })),
                active: true
            },
            { upsert: true, new: true, runValidators: true }
        );

        return config;
    }

    async getConfigByEntity(entityId: string) {
        const EmailForwardingConfig = await getEmailForwardingConfigModel();
        return await EmailForwardingConfig.findOne({
            entityId: new mongoose.Types.ObjectId(entityId)
        });
    }

    async listConfigs() {
        const EmailForwardingConfig = await getEmailForwardingConfigModel();
        return await EmailForwardingConfig.find()
            .populate('entityId', 'dbName taxId')
            .sort({ createdAt: -1 });
    }

    async toggleConfig(entityId: string) {
        const EmailForwardingConfig = await getEmailForwardingConfigModel();
        const config = await EmailForwardingConfig.findOne({
            entityId: new mongoose.Types.ObjectId(entityId)
        });

        if (!config) return null;

        config.active = !config.active;
        await config.save();
        return config;
    }

    async deleteConfig(entityId: string) {
        const EmailForwardingConfig = await getEmailForwardingConfigModel();
        return await EmailForwardingConfig.findOneAndDelete({
            entityId: new mongoose.Types.ObjectId(entityId)
        });
    }

    async testMatch(from: string, subject: string) {
        const matcher = getEmailMatcher();
        return await matcher.matchEmail(from, subject || "");
    }

    async getRawEmails(limit: number = 20, entityId?: string, matched?: string) {
        const SystemEmailRaw = await getSystemEmailRawModel();
        const filter: any = {};

        if (entityId) {
            filter['routing.entityId'] = new mongoose.Types.ObjectId(entityId);
        }

        if (matched === 'true') {
            filter['routing'] = { $ne: null };
        } else if (matched === 'false') {
            filter['routing'] = null;
        }

        const emails = await SystemEmailRaw.find(filter)
            .sort({ receivedAt: -1 })
            .limit(limit)
            .lean();

        return emails;
    }

    async getRawEmailById(gmailId: string) {
        const SystemEmailRaw = await getSystemEmailRawModel();
        const email = await SystemEmailRaw.findOne({ gmailId }).lean();

        if (!email) return null;

        return {
            ...email,
            textBodyPreview: email.textBody?.substring(0, 500),
            htmlPreview: email.html?.substring(0, 500)
        };
    }

    async getMatchingStats() {
        const SystemEmailRaw = await getSystemEmailRawModel();

        const total = await SystemEmailRaw.countDocuments();
        const matched = await SystemEmailRaw.countDocuments({
            routing: { $ne: null }
        });
        const unmatched = await SystemEmailRaw.countDocuments({
            routing: null
        });
        const processed = await SystemEmailRaw.countDocuments({
            processed: true
        });
        const withErrors = await SystemEmailRaw.countDocuments({
            error: { $ne: null }
        });

        // Por banco
        const byBank = await SystemEmailRaw.aggregate([
            { $match: { 'routing.bank': { $ne: null } } },
            {
                $group: {
                    _id: '$routing.bank',
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } }
        ]);

        // Por entidad
        const byEntity = await SystemEmailRaw.aggregate([
            { $match: { 'routing.entityId': { $ne: null } } },
            {
                $group: {
                    _id: '$routing.entityId',
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } }
        ]);

        return {
            total,
            matched,
            unmatched,
            processed,
            withErrors,
            matchRate: total > 0 ? ((matched / total) * 100).toFixed(2) + '%' : '0%',
            byBank,
            byEntity
        };
    }

    async fetchEmailsManual(idFetching: string, maxResults: number = 100000) {
        const EmailForwardingConfig = await getEmailForwardingConfigModel();
        const config = await EmailForwardingConfig.findById(idFetching);

        if (!config || !config.active || !config.forwardingData.length) {
            throw new Error("Forwarding config not found or inactive");
        }

        const senders = config.forwardingData.map((r: any) => r.email);
        const query = `from:(${senders.join(" OR ")})`;

        const GmailWatch = await getGmailWatchModel();
        const watch = await GmailWatch.findOne({ status: "active" });

        if (!watch) {
            throw new Error("No active Gmail integration found");
        }

        const oauth2Client = getOAuth2Client();
        oauth2Client.setCredentials({
            access_token: watch.accessToken,
            refresh_token: watch.refreshToken
        });

        const gmail = google.gmail({ version: "v1", auth: oauth2Client });

        const response = await gmail.users.messages.list({
            userId: "me",
            maxResults,
            q: query,
            labelIds: ["INBOX"]
        });

        const messages = response.data.messages || [];

        if (!messages.length) {
            return {
                success: true,
                message: `No emails found from ${senders.join(", ")}`,
                processed: 0,
                senders,
                total: 0,
                results: []
            };
        }

        const TenantDetail = await getTenantDetailModel();
        const tenantDetail = await TenantDetail.findById(config.entityId);

        if (!tenantDetail) {
            throw new Error("TenantDetail not found");
        }

        const tenantDB = await getTenantDB(
            tenantDetail.tenantId.toString(),
            tenantDetail._id.toString()
        );
        const Account = getAccountModel(tenantDB);

        const firstAccount = config.forwardingData[0]?.accounts[0];
        let bankName = null;

        if (firstAccount) {
            const account = await Account.findById(firstAccount).lean();
            bankName = account?.bank_name ?? null;
        }

        const forcedRouting = {
            entityId: config.entityId,
            account: firstAccount,
            bank: bankName
        };

        const results = [];

        for (const msg of messages) {
            await processMessage(
                gmail,
                msg.id!,
                msg.threadId || "",
                watch.historyId || "",
                forcedRouting,
                config.entityId
            );

            results.push({
                gmailId: msg.id,
                status: "stored"
            });
        }

        return {
            success: true,
            senders: senders,
            total: messages.length,
            results
        };
    }

    async processHistoryManual(tenantDetailId: string) {
        const GmailWatch = await getGmailWatchModel();
        const watch = await GmailWatch.findOne({ tenantDetailId });

        if (!watch) {
            throw new Error("No Gmail watch found for this tenant");
        }

        const oauth2Client = getOAuth2Client();

        oauth2Client.setCredentials({
            access_token: watch.accessToken,
            refresh_token: watch.refreshToken
        });

        const TenantDetail = await getTenantDetailModel();
        const detail = await TenantDetail.findById(tenantDetailId);

        if (!detail) {
            throw new Error("TenantDetail not found");
        }

        const newHistoryId = await processHistoryChanges(
            oauth2Client,
            watch.historyId,
            detail._id
        );

        return {
            oldHistoryId: watch.historyId,
            newHistoryId: newHistoryId
        };
    }

    async getEmailsList(entityId: string) {
        const SystemEmailRaw = await getSystemEmailRawModel();

        const query: any = {
            'routing.entityId': new mongoose.Types.ObjectId(entityId)
        };

        const emails = await SystemEmailRaw
            .find(query)
            .sort({ receivedAt: -1 })
            .lean();

        const total = await SystemEmailRaw.countDocuments(query);

        return {
            emails: emails.map(e => ({
                _id: e._id,
                uid: e.gmailId,
                message_id: e.messageId,
                from: e.from,
                subject: e.subject,
                date: e.receivedAt,
                html_body: e.html || "",
                text_body: e.textBody || "",
                body: e.textBody || e.html || "",
                gmailId: e.gmailId,
                threadId: e.threadId,
                labels: e.labels,
                routing: e.routing,
                transactionVariables: e.transactionVariables,
                transactionType: e.transactionType,
                processed: e.processed,
                processedAt: e.processedAt,
                error: e.error,
                createdAt: e.createdAt,
                updatedAt: e.updatedAt,
                source: "gmail"
            })),
            total
        };
    }

    async reconcileEmails(entityId: string) {
        const objectId = new mongoose.Types.ObjectId(entityId);
        const TenantDetail = await getTenantDetailModel();
        const tenant = await TenantDetail.findById(objectId).lean();

        if (!tenant) {
            throw new Error("Tenant no encontrado");
        }

        const SystemEmailRaw = await getSystemEmailRawModel();
        const TransactionRaw = await getTransactionRawModel(tenant.tenantId, tenant._id);
        const tenantDB = await getTenantDB(tenant.tenantId, tenant._id);
        const TransactionRawIMAP =
            tenantDB.models.Transaction_Raw_IMAP ??
            tenantDB.model(
                "Transaction_Raw_IMAP",
                TransactionRawIMAPSchema
            );

        const emails = await SystemEmailRaw.find({
            "routing.entityId": objectId,
            processed: { $ne: true },
        }).lean();

        let matched = 0;
        let notMatched = 0;

        for (const email of emails) {
            const imap = await TransactionRawIMAP
                .findOne({ message_id: email.messageId })
                .lean();

            const hasMatch = !!imap;

            await TransactionRaw.updateOne(
                { messageId: email.messageId },
                {
                    $set: {
                        gmailId: email.gmailId,
                        threadId: email.threadId,
                        historyId: email.historyId,
                        from: email.from,
                        subject: email.subject,
                        receivedAt: email.receivedAt,
                        html: email.html,
                        textBody: email.textBody,
                        labels: email.labels,
                        routing: email.routing,
                        transactionVariables: email.transactionVariables,
                        transactionType: email.transactionType,
                        systemRawId: email._id,
                        imapRawId: imap?._id ?? null,
                        matchStatus: hasMatch,
                        matchAt: hasMatch ? new Date() : null,
                        processed: true,
                        processedAt: new Date(),
                    },
                },
                { upsert: true }
            );

            await SystemEmailRaw.updateOne(
                { _id: email._id },
                { $set: { processed: true, processedAt: new Date() } }
            );

            hasMatch ? matched++ : notMatched++;
        }

        // 🆕 RECO v2 Integration: Ingest emails into unified Transaction_Raw collection
        try {
            const { recoService } = await import('../reco');

            // Map SystemEmailRaw documents to RECO format
            const emailsForReco = emails.map(email => ({
                // Gmail-specific fields
                gmailId: email.gmailId,
                messageId: email.messageId,
                threadId: email.threadId,
                historyId: email.historyId,
                from: email.from,
                subject: email.subject,
                receivedAt: email.receivedAt,

                // Routing
                routing: email.routing,

                // Transaction variables (already extracted by AI)
                transactionVariables: email.transactionVariables,
                transactionType: email.transactionType,

                // Reference to system raw
                systemRawId: email._id
            }));

            await recoService.ingest(
                tenant.tenantId,
                tenant._id.toString(),
                'GMAIL',
                emailsForReco
            );

            console.log(`✅ RECO v2: Ingested ${emailsForReco.length} Gmail transactions`);
        } catch (recoError) {
            console.error('⚠️ RECO v2 ingestion failed for Gmail transactions:', recoError);
            // Don't fail the entire reconciliation, just log the error
        }

        return {
            processed: emails.length,
            matched,
            notMatched,
        };
    }

    async getWatchStatus(tenantDetailId: string) {
        const GmailWatch = await getGmailWatchModel();
        const watch = await GmailWatch.findOne({ tenantDetailId });

        if (!watch) {
            return null;
        }

        const isExpired = new Date() > watch.expiration;
        return {
            tenantDetailId: watch.tenantDetailId,
            email: watch.email,
            historyId: watch.historyId,
            status: watch.status,
            expiration: watch.expiration,
            isExpired,
            daysUntilExpiration: isExpired ? 0 : Math.ceil((watch.expiration.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
            lastError: watch.lastError,
            createdAt: watch.createdAt,
            updatedAt: watch.updatedAt
        };
    }

    async listWatches() {
        const GmailWatch = await getGmailWatchModel();
        const watches = await GmailWatch.find().sort({ createdAt: -1 });

        return watches.map(w => ({
            tenantDetailId: w.tenantDetailId,
            email: w.email,
            status: w.status,
            expiration: w.expiration,
            isExpired: new Date() > w.expiration,
            historyId: w.historyId,
            createdAt: w.createdAt
        }));
    }
}

export const gmailManagementService = new GmailManagementService();

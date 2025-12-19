import { Router, Request, Response } from 'express';
import * as gmailController from '../controllers/gmail';

import {
    validatePubSubToken,
    validatePubSubJWT,
    rateLimitWebhook
} from '../middleware/gmailWebhook';
import getEmailForwardingConfigModel from '../models/system/EmailForwardingConfig';
import getSystemEmailRawModel from '../models/system/SystemEmailRaw';
import mongoose from 'mongoose';
import { getEmailMatcher } from '../services/gmail/matcher';
import getTenantDetailModel from '../models/system/TenantDetail';
import getGmailWatchModel from '../models/system/GmailWatch';
import { processHistoryChanges, processMessage } from '../services/gmail/processor';
import { getOAuth2Client } from '../services/gmail/auth';
import { google } from 'googleapis';
import { getSystemDB, getTenantDB } from '../config/tenantDb';
import { getAccountInformationById } from '../controllers/account';
import { getAccountModel } from '../models/tenant/Account';
import { getTransactionRawModel } from '../models/tenant/TransactionRaw';
import { TransactionRawIMAPSchema } from '../models/tenant/TransactionRawIMAP';

const router = Router();

/**
 * OAuth flow (PÚBLICO)
 * 🔓 SIN authenticateToken
 */
router.get('/auth', gmailController.initiateAuth);
router.get('/callback', gmailController.handleCallback);

/**
 * Webhook (ACTOR EXTERNO - Pub/Sub)
 * 🔓 SIN authenticateToken
 * ✅ Validación propia
 */
router.post(
    '/webhook',
    validatePubSubToken,   // o validatePubSubJWT
    rateLimitWebhook,
    gmailController.handleWebhook
);

/**
 * Management (TEMPORALMENTE PÚBLICO)
 * 🔓 SIN authenticateToken
 */
router.get(
    '/status/:tenantDetailId',
    gmailController.getStatus
);

router.delete(
    '/disconnect/:tenantDetailId',
    gmailController.disconnect
);

router.get(
    '/emails/:tenantDetailId',
    gmailController.getEmailsBySender
);

router.post(
    '/process-emails/:tenantDetailId',
    gmailController.processEmailsBySender
);

/* =========================================================
   1. CREAR/ACTUALIZAR CONFIGURACIÓN DE FORWARDING
========================================================= */

/**
 * POST /api/forwarding-config
 * Body: {
 *   entityId: "676...",
 *   forwardingData: [
 *     {
 *       email: "pepito@zapatero.com",
 *       accounts: ["675...", "675..."]
 *     }
 *   ]
 * }
 */
router.post("/", async (req, res) => {
    try {
        const { entityId, forwardingData } = req.body;

        // Validación básica
        if (!entityId) {
            return res.status(400).json({ error: "entityId is required" });
        }

        if (!forwardingData || !Array.isArray(forwardingData)) {
            return res.status(400).json({ error: "forwardingData must be an array" });
        }

        // Verificar que entityId existe
        const TenantDetail = await getTenantDetailModel();
        const detail = await TenantDetail.findById(entityId);

        if (!detail) {
            return res.status(404).json({ error: `TenantDetail ${entityId} not found` });
        }

        // Crear o actualizar config
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

        res.json({
            success: true,
            message: "Forwarding config created/updated",
            config: {
                id: config._id,
                entityId: config.entityId,
                forwardingData: config.forwardingData,
                active: config.active
            }
        });

    } catch (error: any) {
        console.error("Error creating forwarding config:", error);
        res.status(500).json({
            error: "Failed to create forwarding config",
            details: error.message
        });
    }
});

/* =========================================================
   2. OBTENER CONFIGURACIÓN POR ENTITY
========================================================= */

/**
 * GET /api/forwarding-config/:entityId
 */
router.get("/:entityId", async (req, res) => {
    try {
        const { entityId } = req.params;

        const EmailForwardingConfig = await getEmailForwardingConfigModel();
        const config = await EmailForwardingConfig.findOne({
            entityId: new mongoose.Types.ObjectId(entityId)
        });

        if (!config) {
            return res.status(404).json({
                error: "No forwarding config found for this entity"
            });
        }

        res.json({
            success: true,
            config: {
                id: config._id,
                entityId: config.entityId,
                forwardingData: config.forwardingData,
                active: config.active,
                createdAt: config.createdAt,
                updatedAt: config.updatedAt
            }
        });

    } catch (error: any) {
        console.error("Error fetching forwarding config:", error);
        res.status(500).json({
            error: "Failed to fetch forwarding config",
            details: error.message
        });
    }
});

/* =========================================================
   3. LISTAR TODAS LAS CONFIGURACIONES
========================================================= */

/**
 * GET /api/forwarding-config
 */
router.get("/", async (req, res) => {
    try {
        const EmailForwardingConfig = await getEmailForwardingConfigModel();
        const configs = await EmailForwardingConfig.find()
            .populate('entityId', 'dbName taxId')
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            count: configs.length,
            configs: configs.map(c => ({
                id: c._id,
                entityId: c.entityId,
                forwardingData: c.forwardingData,
                active: c.active,
                createdAt: c.createdAt
            }))
        });

    } catch (error: any) {
        console.error("Error listing forwarding configs:", error);
        res.status(500).json({
            error: "Failed to list forwarding configs",
            details: error.message
        });
    }
});

/* =========================================================
   4. ACTIVAR/DESACTIVAR CONFIGURACIÓN
========================================================= */

/**
 * PATCH /api/forwarding-config/:entityId/toggle
 */
router.patch("/:entityId/toggle", async (req, res) => {
    try {
        const { entityId } = req.params;

        const EmailForwardingConfig = await getEmailForwardingConfigModel();
        const config = await EmailForwardingConfig.findOne({
            entityId: new mongoose.Types.ObjectId(entityId)
        });

        if (!config) {
            return res.status(404).json({
                error: "No forwarding config found"
            });
        }

        config.active = !config.active;
        await config.save();

        res.json({
            success: true,
            message: `Config ${config.active ? 'activated' : 'deactivated'}`,
            active: config.active
        });

    } catch (error: any) {
        console.error("Error toggling forwarding config:", error);
        res.status(500).json({
            error: "Failed to toggle forwarding config",
            details: error.message
        });
    }
});

/* =========================================================
   5. ELIMINAR CONFIGURACIÓN
========================================================= */

/**
 * DELETE /api/forwarding-config/:entityId
 */
router.delete("/:entityId", async (req, res) => {
    try {
        const { entityId } = req.params;

        const EmailForwardingConfig = await getEmailForwardingConfigModel();
        const result = await EmailForwardingConfig.findOneAndDelete({
            entityId: new mongoose.Types.ObjectId(entityId)
        });

        if (!result) {
            return res.status(404).json({
                error: "No forwarding config found"
            });
        }

        res.json({
            success: true,
            message: "Forwarding config deleted"
        });

    } catch (error: any) {
        console.error("Error deleting forwarding config:", error);
        res.status(500).json({
            error: "Failed to delete forwarding config",
            details: error.message
        });
    }
});

/* =========================================================
   6. TEST MATCHING (SIN GUARDAR)
========================================================= */

/**
 * POST /api/forwarding-config/test-match
 * Body: {
 *   from: "Pepito Zapatero <pepito@zapatero.com>",
 *   subject: "Tu yapeo fue confirmado"
 * }
 */
router.post("/test-match", async (req, res) => {
    try {
        const { from, subject } = req.body;

        if (!from) {
            return res.status(400).json({ error: "from is required" });
        }

        const matcher = getEmailMatcher();
        const result = await matcher.matchEmail(from, subject || "");

        res.json({
            success: true,
            input: { from, subject },
            result: {
                matched: result.matched,
                entityId: result.entityId?.toString(),
                bank: result.bank,
                accountNumber: result.accountNumber
            }
        });

    } catch (error: any) {
        console.error("Error testing match:", error);
        res.status(500).json({
            error: "Failed to test match",
            details: error.message
        });
    }
});

/* =========================================================
   7. VER EMAILS EN SYSTEM.EMAIL.RAW
========================================================= */

/**
 * GET /api/forwarding-config/emails/raw
 * Query params:
 *   - limit: number (default 20)
 *   - entityId: string (optional filter)
 *   - matched: boolean (optional filter)
 */
router.get("/emails/raw", async (req, res) => {
    try {
        const limit = parseInt(req.query.limit as string) || 20;
        const entityId = req.query.entityId as string;
        const matched = req.query.matched as string;

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

        res.json({
            success: true,
            count: emails.length,
            emails: emails.map(e => ({
                id: e._id,
                gmailId: e.gmailId,
                from: e.from,
                subject: e.subject,
                receivedAt: e.receivedAt,
                routing: e.routing,
                processed: e.processed,
                error: e.error,
                createdAt: e.createdAt
            }))
        });

    } catch (error: any) {
        console.error("Error fetching raw emails:", error);
        res.status(500).json({
            error: "Failed to fetch raw emails",
            details: error.message
        });
    }
});

/* =========================================================
   8. VER DETALLE DE EMAIL RAW
========================================================= */

/**
 * GET /api/forwarding-config/emails/raw/:gmailId
 */
router.get("/emails/raw/:gmailId", async (req, res) => {
    try {
        const { gmailId } = req.params;

        const SystemEmailRaw = await getSystemEmailRawModel();
        const email = await SystemEmailRaw.findOne({ gmailId }).lean();

        if (!email) {
            return res.status(404).json({
                error: "Email not found in System.Email.Raw"
            });
        }

        res.json({
            success: true,
            email: {
                ...email,
                textBodyPreview: email.textBody?.substring(0, 500),
                htmlPreview: email.html?.substring(0, 500)
            }
        });

    } catch (error: any) {
        console.error("Error fetching email detail:", error);
        res.status(500).json({
            error: "Failed to fetch email detail",
            details: error.message
        });
    }
});

/* =========================================================
   9. ESTADÍSTICAS DE MATCHING
========================================================= */

/**
 * GET /api/forwarding-config/stats
 */
router.get("/stats/matching", async (req, res) => {
    try {
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

        res.json({
            success: true,
            stats: {
                total,
                matched,
                unmatched,
                processed,
                withErrors,
                matchRate: total > 0 ? ((matched / total) * 100).toFixed(2) + '%' : '0%',
                byBank,
                byEntity
            }
        });

    } catch (error: any) {
        console.error("Error fetching stats:", error);
        res.status(500).json({
            error: "Failed to fetch stats",
            details: error.message
        });
    }
});

/* =========================================================
   ENDPOINT PARA FETCH MANUAL DE EMAILS
========================================================= */

router.post("/fetch-emails", async (req, res) => {
    try {
        const { maxResults = 100000, idFetching } = req.body;

        if (!idFetching) {
            return res.status(400).json({ error: "idFetching is required" });
        }

        // 1. Obtener forwarding config
        const EmailForwardingConfig = await getEmailForwardingConfigModel();
        const config = await EmailForwardingConfig.findById(idFetching);

        if (!config || !config.active || !config.forwardingData.length) {
            return res.status(404).json({
                error: "Forwarding config not found or inactive"
            });
        }

        // 2. Extraer correo remitente
        const senderEmail = config.forwardingData[0].email;

        // 3. GmailWatch activo
        const GmailWatch = await getGmailWatchModel();
        const watch = await GmailWatch.findOne({ status: "active" });

        if (!watch) {
            return res.status(404).json({
                error: "No active Gmail integration found"
            });
        }

        // 4. OAuth
        const oauth2Client = getOAuth2Client();
        oauth2Client.setCredentials({
            access_token: watch.accessToken,
            refresh_token: watch.refreshToken
        });

        const gmail = google.gmail({ version: "v1", auth: oauth2Client });

        // 5. LISTAR SOLO CORREOS DE ESE REMITENTE
        const response = await gmail.users.messages.list({
            userId: "me",
            maxResults,
            q: `from:${senderEmail}`, // 🔥 CLAVE
            labelIds: ["INBOX"]
        });

        const messages = response.data.messages || [];

        if (!messages.length) {
            return res.json({
                success: true,
                message: `No emails found from ${senderEmail}`,
                processed: 0
            });
        }
        const TenantDetail = await getTenantDetailModel();
        const tenantDetail = await TenantDetail.findById(config.entityId);

        if (!tenantDetail) {
            return res.status(404).json({ error: "TenantDetail not found" });
        }
        const tenantDB = await getTenantDB(
            tenantDetail.tenantId.toString(),
            tenantDetail._id.toString()
        );
        const Account = getAccountModel(tenantDB);
        const account = await Account.findById(
            config.forwardingData[0].accounts[0]
        ).lean();

        const forcedRouting = {
            entityId: config.entityId,
            account: config.forwardingData[0].accounts[0],
            bank: account?.bank_name ?? null
        };

        const results = [];

        for (const msg of messages) {
            await processMessage(
                gmail,
                msg.id!,
                msg.threadId || "",
                watch.historyId || "",
                forcedRouting
            );

            results.push({
                gmailId: msg.id,
                from: senderEmail,
                status: "stored"
            });
        }

        res.json({
            success: true,
            sender: senderEmail,
            total: messages.length,
            results
        });

    } catch (error: any) {
        console.error("❌ fetch-emails error:", error);
        res.status(500).json({
            error: "Failed to fetch emails",
            details: error.message
        });
    }
});

/* =========================================================
   ENDPOINT PARA PROCESAR HISTORY CHANGES (PUSH NOTIFICATION)
========================================================= */

/**
 * POST /api/gmail/process-history/:tenantDetailId
 * 
 * Procesa cambios desde el último historyId conocido
 * Esto simula lo que hace el Push Notification automáticamente
 */
router.post("/process-history/:tenantDetailId", async (req: Request, res: Response) => {
    try {
        const { tenantDetailId } = req.params;

        console.log(`📧 Processing history for tenant: ${tenantDetailId}`);

        // 1. Obtener watch info
        const GmailWatch = await getGmailWatchModel();
        const watch = await GmailWatch.findOne({ tenantDetailId });

        if (!watch) {
            return res.status(404).json({
                error: "No Gmail watch found for this tenant"
            });
        }

        // 2. Crear OAuth2 client
        const oauth2Client = getOAuth2Client();

        oauth2Client.setCredentials({
            access_token: watch.accessToken,
            refresh_token: watch.refreshToken
        });

        // 3. Obtener tenant connection (aunque ya no se usa en processor nuevo)
        const getTenantDetailModel = (await import("../models/system/TenantDetail")).default;
        const TenantDetail = await getTenantDetailModel();
        const detail = await TenantDetail.findById(tenantDetailId);

        if (!detail) {
            return res.status(404).json({
                error: "TenantDetail not found"
            });
        }

        const tenantConnection = await getTenantDB(
            detail.tenantId.toString(),
            tenantDetailId
        );

        // 4. Procesar history changes
        console.log(`📜 Starting from historyId: ${watch.historyId}`);

        const newHistoryId = await processHistoryChanges(
            oauth2Client,
            watch.historyId,
        );

        res.json({
            success: true,
            message: "History processed successfully",
            oldHistoryId: watch.historyId,
            newHistoryId: newHistoryId
        });

    } catch (error: any) {
        console.error("❌ Error processing history:", error);
        res.status(500).json({
            error: "Failed to process history",
            details: error.message
        });
    }
});

/* =========================================================
   ENDPOINT PARA VER STATUS DE GMAIL WATCH
========================================================= */

/**
 * GET /api/gmail/watch-status/:tenantDetailId
 */
router.get("/watch-status/:tenantDetailId", async (req, res) => {
    try {
        const { tenantDetailId } = req.params;

        const GmailWatch = await getGmailWatchModel();
        const watch = await GmailWatch.findOne({ tenantDetailId });

        if (!watch) {
            return res.status(404).json({
                error: "No Gmail watch found for this tenant"
            });
        }

        const isExpired = new Date() > watch.expiration;

        res.json({
            success: true,
            watch: {
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
            }
        });

    } catch (error: any) {
        console.error("❌ Error fetching watch status:", error);
        res.status(500).json({
            error: "Failed to fetch watch status",
            details: error.message
        });
    }
});

/* =========================================================
   ENDPOINT PARA LISTAR TODOS LOS WATCHES
========================================================= */

/**
 * GET /api/gmail/watches
 */
router.get("/watches", async (req, res) => {
    try {
        const GmailWatch = await getGmailWatchModel();
        const watches = await GmailWatch.find().sort({ createdAt: -1 });

        res.json({
            success: true,
            count: watches.length,
            watches: watches.map(w => ({
                tenantDetailId: w.tenantDetailId,
                email: w.email,
                status: w.status,
                expiration: w.expiration,
                isExpired: new Date() > w.expiration,
                historyId: w.historyId,
                createdAt: w.createdAt
            }))
        });

    } catch (error: any) {
        console.error("❌ Error listing watches:", error);
        res.status(500).json({
            error: "Failed to list watches",
            details: error.message
        });
    }
});

router.get("/emails-list/:entityId", async (req, res) => {
    try {
        const { entityId } = req.params;

        const SystemEmailRaw = await getSystemEmailRawModel();

        // Construir query dinámico
        const query: any = {
            'routing.entityId': new mongoose.Types.ObjectId(entityId)
        };

        const emails = await SystemEmailRaw
            .find(query)
            .sort({ receivedAt: -1 })
            .lean();

        // Contar total (para paginación)
        const total = await SystemEmailRaw.countDocuments(query);

        res.json({
            success: true,
            count: emails.length,
            total,
            emails: emails.map(e => ({
                // IDs
                _id: e._id,
                uid: e.gmailId,
                message_id: e.messageId,

                // Metadatos
                from: e.from,
                subject: e.subject,
                date: e.receivedAt,

                // Contenido normalizado
                html_body: e.html || "",
                text_body: e.textBody || "",
                body: e.textBody || e.html || "",

                // Metadatos adicionales
                gmailId: e.gmailId,
                threadId: e.threadId,
                labels: e.labels,
                routing: e.routing,
                transactionVariables: e.transactionVariables,
                transactionType: e.transactionType,

                // Estado
                processed: e.processed,
                processedAt: e.processedAt,
                error: e.error,

                // Timestamps
                createdAt: e.createdAt,
                updatedAt: e.updatedAt,

                // Source
                source: "gmail"
            }))
        });
    } catch (error: any) {
        console.error("❌ Error listing emails:", error);
        res.status(500).json({
            error: "Failed to list emails",
            details: error.message
        });
    }
});

router.get("/reconcile/:entityId", async (req, res) => {
    try {
        const entityId = new mongoose.Types.ObjectId(req.params.entityId);

        const tenant = await (await getTenantDetailModel())
            .findById(entityId)
            .lean();

        if (!tenant) {
            return res.status(404).json({ message: "Tenant no encontrado" });
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
            "routing.entityId": entityId,
            processed: { $ne: true },
        }).lean();
        console.log(emails.length);
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
        const total = await SystemEmailRaw.countDocuments();
        const withRouting = await SystemEmailRaw.countDocuments({ routing: { $ne: null } });
        const withEntity = await SystemEmailRaw.countDocuments({ "routing.entityId": entityId });
        const notProcessed = await SystemEmailRaw.countDocuments({ processed: { $ne: true } });

        console.log({ total, withRouting, withEntity, notProcessed });

        res.json({
            processed: emails.length,
            matched,
            notMatched,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error en reconcile" });
    }
});

export default router;

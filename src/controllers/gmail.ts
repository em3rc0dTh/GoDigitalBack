// src/controllers/gmail.ts
import { Request, Response } from 'express';
import { google } from 'googleapis';
import getTenantDetailModel from '../models/system/TenantDetail';
import { getAuthUrl, getOAuth2Client, getTokensFromCode, setCredentials } from '../services/gmail/auth';
import { setupWatch, stopWatch } from '../services/gmail/watch';
import getGmailWatchModel from '../models/system/GmailWatch';
import { getTenantDB } from '../config/tenantDb';
import { processHistoryChanges, processMessage } from '../services/gmail/processor';
import { walkParts, parseHeaders, ParsedEmailContent } from '../services/gmail/parser';

/**
 * Iniciar OAuth flow para conectar Gmail
 * GET /api/gmail/auth?tenantDetailId=xxx
 * 🔓 Público (sin auth de la app)
 */
export async function initiateAuth(req: Request, res: Response) {
    try {
        const { tenantDetailId } = req.query;

        if (!tenantDetailId) {
            return res.status(400).json({ error: 'tenantDetailId required' });
        }

        // Validar tenantDetail
        const TenantDetail = await getTenantDetailModel();
        const detail = await TenantDetail.findById(tenantDetailId);
        if (!detail) {
            return res.status(404).json({ error: 'TenantDetail not found' });
        }

        // 🔑 State limpio (sin userId)
        const state = tenantDetailId.toString();
        const authUrl = getAuthUrl(state);

        res.json({ authUrl });
    } catch (error) {
        console.error('Error initiating Gmail auth:', error);
        res.status(500).json({ error: 'Failed to initiate auth' });
    }
}

/**
 * Callback de OAuth
 * GET /api/gmail/callback?code=xxx&state=tenantDetailId
 */
export async function handleCallback(req: Request, res: Response) {
    try {
        const { code, state } = req.query;

        if (!code || !state) {
            return res.status(400).json({ error: 'Missing code or state' });
        }

        const tenantDetailId = state as string;

        // Obtener tokens OAuth
        const tokens = await getTokensFromCode(code as string);
        const oauth2Client = getOAuth2Client();
        setCredentials(oauth2Client, tokens);

        // Obtener email del usuario Gmail
        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
        const profile = await gmail.users.getProfile({ userId: 'me' });
        const email = profile.data.emailAddress!;

        // Configurar watch
        await setupWatch(oauth2Client, email);

        // Redirigir al frontend
        res.redirect(
            `${process.env.FRONTEND_URL}?success=gmail`
        );
    } catch (error) {
        console.error('Error handling Gmail callback:', error);
        res.status(500).json({ error: 'Failed to complete authentication' });
    }
}

/**
 * Webhook para notificaciones Gmail (Google Pub/Sub)
 * POST /api/gmail/webhook
 */
export async function handleWebhook(req: Request, res: Response) {
    try {
        const message = req.body.message;
        if (!message || !message.data) {
            return res.status(400).send('Invalid message format');
        }

        // Decodificar mensaje Pub/Sub
        const data = JSON.parse(
            Buffer.from(message.data, 'base64').toString()
        );

        const { emailAddress, historyId } = data;

        console.log(
            `📧 Gmail notification for ${emailAddress}, historyId: ${historyId}`
        );

        const GmailWatch = await getGmailWatchModel();
        const watch = await GmailWatch.findOne({
            email: emailAddress,
            status: 'active'
        });

        if (!watch) {
            console.log(`No active watch found for ${emailAddress}`);
            return res.status(200).send('OK');
        }

        // Procesar en background
        processEmailInBackground(watch, historyId);

        // Responder rápido a Pub/Sub
        res.status(200).send('OK');
    } catch (error) {
        console.error('Error handling Gmail webhook:', error);
        res.status(500).send('Error');
    }
}

async function processEmailInBackground(
    watch: any,
    newHistoryId: string
) {
    try {
        const TenantDetail = await getTenantDetailModel();
        const detail = await TenantDetail.findById(watch.tenantDetailId);
        if (!detail) return;

        const tenantConnection = await getTenantDB(
            detail.tenantId.toString(),
            detail._id.toString()
        );

        const oauth2Client = getOAuth2Client();
        setCredentials(oauth2Client, {
            access_token: watch.accessToken,
            refresh_token: watch.refreshToken
        });

        await processHistoryChanges(
            oauth2Client,
            watch.historyId,
        );

        console.log(`✅ Processed emails for ${watch.email}`);
    } catch (error: any) {
        console.error('Error processing email in background:', error);

        const GmailWatch = await getGmailWatchModel();
        await GmailWatch.findByIdAndUpdate(watch._id, {
            lastError: error.message
        });
    }
}

/**
 * Obtener estado de integración Gmail
 * GET /api/gmail/status/:tenantDetailId
 */
export async function getStatus(req: Request, res: Response) {
    try {
        const { tenantDetailId } = req.params;

        const GmailWatch = await getGmailWatchModel();
        const watch = await GmailWatch.findOne({ tenantDetailId });

        if (!watch) {
            return res.json({
                connected: false,
                email: null,
                expiration: null,
                status: null
            });
        }

        res.json({
            connected: watch.status === 'active',
            email: watch.email,
            expiration: watch.expiration,
            status: watch.status,
            lastError: watch.lastError
        });
    } catch (error) {
        console.error('Error getting Gmail status:', error);
        res.status(500).json({ error: 'Failed to get status' });
    }
}

/**
 * Desconectar Gmail
 * DELETE /api/gmail/disconnect/:tenantDetailId
 */
export async function disconnect(req: Request, res: Response) {
    try {
        const { tenantDetailId } = req.params;

        const GmailWatch = await getGmailWatchModel();
        const watch = await GmailWatch.findOne({ tenantDetailId });

        if (!watch) {
            return res.status(404).json({ error: 'No connection found' });
        }

        const oauth2Client = getOAuth2Client();
        setCredentials(oauth2Client, {
            access_token: watch.accessToken,
            refresh_token: watch.refreshToken
        });

        await stopWatch(oauth2Client);

        res.json({ success: true });
    } catch (error) {
        console.error('Error disconnecting Gmail:', error);
        res.status(500).json({ error: 'Failed to disconnect' });
    }
}

/**
 * Traer correos por remitente
 * GET /api/gmail/emails/:tenantDetailId?from=correo@dominio.com
 */


export async function getEmailsBySender(req: Request, res: Response) {
    try {
        const { tenantDetailId } = req.params;
        const { from } = req.query;

        if (!from) {
            return res.status(400).json({ error: 'from query param required' });
        }

        const GmailWatch = await getGmailWatchModel();
        const watch = await GmailWatch.findOne({
            tenantDetailId,
            status: 'active'
        });

        if (!watch) {
            return res.status(404).json({ error: 'Gmail not connected' });
        }

        const oauth2Client = getOAuth2Client();
        setCredentials(oauth2Client, {
            access_token: watch.accessToken,
            refresh_token: watch.refreshToken
        });

        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

        // 1️⃣ Listar mensajes
        let pageToken: string | undefined;
        const messages: any[] = [];

        do {
            const resList = await gmail.users.messages.list({
                userId: 'me',
                q: `from:${from}`,
                maxResults: 50,
                pageToken
            });

            if (resList.data.messages) {
                messages.push(...resList.data.messages);
            }

            pageToken = resList.data.nextPageToken || undefined;
        } while (pageToken);

        // 2️⃣ Obtener contenido COMPLETO
        const emails = [];

        for (const msg of messages.slice(0, 20)) {
            const resMsg = await gmail.users.messages.get({
                userId: 'me',
                id: msg.id,
                format: 'full'
            });

            const payload = resMsg.data.payload!;
            const headers = parseHeaders(payload.headers);

            const parsed = {
                id: resMsg.data.id,
                threadId: resMsg.data.threadId,
                labelIds: resMsg.data.labelIds,
                internalDate: resMsg.data.internalDate,
                from: headers.from,
                to: headers.to,
                subject: headers.subject,
                date: headers.date,
                text: null as string | null,
                html: null as string | null,
                attachments: [] as any[]
            };

            walkParts(payload, parsed);

            emails.push(parsed);
        }

        res.json({
            count: messages.length,
            emails
        });

    } catch (error) {
        console.error('Error fetching emails by sender:', error);
        res.status(500).json({ error: 'Failed to fetch emails' });
    }
}

// src/controllers/gmail.ts

/**
 * Procesar emails históricos por remitente
 * POST /api/gmail/process-emails/:tenantDetailId
 */
export async function processEmailsBySender(req: Request, res: Response) {
    try {
        const { tenantDetailId } = req.params;
        const { from } = req.query; // O query

        if (!from) {
            return res.status(400).json({ error: 'from required' });
        }

        const GmailWatch = await getGmailWatchModel();
        const watch = await GmailWatch.findOne({
            tenantDetailId,
            status: 'active'
        });

        if (!watch) {
            return res.status(404).json({ error: 'Gmail not connected' });
        }

        // Obtener conexión tenant
        const TenantDetail = await getTenantDetailModel();
        const detail = await TenantDetail.findById(tenantDetailId);
        if (!detail) {
            return res.status(404).json({ error: 'TenantDetail not found' });
        }

        const tenantConnection = await getTenantDB(
            detail.tenantId.toString(),
            detail._id.toString()
        );

        // OAuth
        const oauth2Client = getOAuth2Client();
        setCredentials(oauth2Client, {
            access_token: watch.accessToken,
            refresh_token: watch.refreshToken
        });

        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

        // 1️⃣ Buscar emails del remitente
        const resList = await gmail.users.messages.list({
            userId: 'me',
            q: `from:${from}`,
            maxResults: 100 // Ajusta según necesites
        });

        const messages = resList.data.messages || [];
        let processed = 0;
        let skipped = 0;

        // 2️⃣ Procesar cada mensaje
        for (const msg of messages) {
            // Verificar si ya existe
            const exists = await tenantConnection
                .collection('Transaction_Raw_Gmail')
                .findOne({ gmailId: msg.id });

            if (exists) {
                skipped++;
                continue;
            }

            // 3️⃣ Procesar el mensaje (reutilizar tu función)
            await processMessage(gmail, msg.id!, msg.threadId || '', 'MANUAL_IMPORT');
            await new Promise(resolve => setTimeout(resolve, 100));
            processed++;
        }

        res.json({
            success: true,
            total: messages.length,
            processed,
            skipped,
            message: `Procesados ${processed} emails nuevos, ${skipped} ya existían`
        });

    } catch (error) {
        console.error('Error processing emails by sender:', error);
        res.status(500).json({ error: 'Failed to process emails' });
    }
}
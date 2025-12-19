// src/services/gmail/processor.ts
import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import mongoose from "mongoose";
import getSystemEmailRawModel from "../../models/system/SystemEmailRaw";
import getGmailWatchModel from "../../models/system/GmailWatch";
import {
    walkParts,
    ParsedEmailContent,
    parseHeaders
} from "./parser";
import { getEmailMatcher } from "./matcher";

/**
 * ============================
 * PROCESADOR GMAIL – FASE 1
 * ============================
 * Responsabilidades:
 * 1. Leer mensajes desde Gmail API
 * 2. Aplicar routing básico (matcher o forzado)
 * 3. Guardar en SystemEmailRaw
 * 4. STOP
 */

/**
 * Procesa cambios de historial Gmail
 */
export async function processHistoryChanges(
    oauth2Client: OAuth2Client,
    startHistoryId: string
): Promise<string> {
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    let pageToken: string | undefined;
    let latestHistoryId = startHistoryId;

    do {
        const response = await gmail.users.history.list({
            userId: "me",
            startHistoryId,
            historyTypes: ["messageAdded"],
            pageToken
        });

        const history = response.data.history || [];

        for (const record of history) {
            if (!record.messagesAdded) continue;

            for (const added of record.messagesAdded) {
                const msg = added.message;
                if (!msg?.id) continue;

                await processMessage(
                    gmail,
                    msg.id,
                    msg.threadId || "",
                    record.id || ""
                );
            }
        }

        pageToken = response.data.nextPageToken || undefined;
        latestHistoryId = response.data.historyId || latestHistoryId;

    } while (pageToken);

    // 🔁 Actualizar historyId global
    const GmailWatch = await getGmailWatchModel();
    await GmailWatch.updateMany(
        { status: "active" },
        { historyId: latestHistoryId }
    );

    return latestHistoryId;
}

/**
 * Procesa un mensaje individual
 */
export async function processMessage(
    gmail: any,
    gmailId: string,
    threadId: string,
    historyId: string,
    forcedRouting?: {
        entityId: mongoose.Types.ObjectId;
        account: mongoose.Types.ObjectId;
        bank?: string | null;
    } | null
) {
    const SystemEmailRaw = await getSystemEmailRawModel();

    // ⛔ Idempotencia por Gmail ID
    const exists = await SystemEmailRaw.findOne({ gmailId });
    if (exists) return;

    const message = await gmail.users.messages.get({
        userId: "me",
        id: gmailId,
        format: "full"
    });

    const headers = parseHeaders(message.data.payload?.headers || []);

    const from = headers["from"] || "";
    const subject = headers["subject"] || "";
    const messageIdHeader = headers["message-id"] || "";
    const receivedAt = new Date(headers["date"] || Date.now());

    const content: ParsedEmailContent = {
        text: null,
        html: null,
        attachments: []
    };

    walkParts(message.data.payload!, content);

    const labels = message.data.labelIds || [];

    let routing: any = null;
    let routingError: string | null = null;

    // 👉 PRIORIDAD 1: routing forzado
    if (forcedRouting) {
        routing = {
            entityId: forcedRouting.entityId,
            bank: forcedRouting.bank || null,
            accountNumber: forcedRouting.account.toString()
        };
    }
    // 👉 PRIORIDAD 2: matcher automático
    else {
        const matcher = getEmailMatcher();
        const matchResult = await matcher.matchEmail(from, subject);

        if (matchResult.matched) {
            routing = {
                entityId: matchResult.entityId,
                bank: matchResult.bank,
                accountNumber: matchResult.accountNumber
            };
        } else {
            routingError = "No matching forwarding config found";
        }
    }

    await SystemEmailRaw.create({
        gmailId,
        threadId,
        historyId,
        messageId: messageIdHeader,

        from,
        subject,
        receivedAt,

        html: content.html,
        textBody: content.text,
        labels,

        routing,

        transactionVariables: {
            originAccount: null,
            destinationAccount: null,
            amount: null,
            currency: null,
            operationDate: null,
            operationNumber: null
        },

        transactionType: null,
        processed: false,
        processedAt: null,
        error: routing ? null : routingError
    });
}



/**
 * FUNCIONES DEPRECADAS
 * Estas funciones ya NO se usan en fase 1
 * Se mantienen comentadas para referencia
 */

/*
// ❌ DEPRECADO: Ya no se identifica cuenta aquí
export async function identifyAccount(
    AccountModel: any,
    from: string,
    subject: string
): Promise<any> {
    // Esta lógica ahora está en matcher.ts
}

// ❌ DEPRECADO: Attachments se procesarán en fase 2
export async function processAttachment(
    gmail: any,
    messageId: string,
    attachmentId: string,
    mimeType: string,
    tenantConnection: mongoose.Connection
): Promise<any[]> {
    // TODO: Mover a classifier en fase 2
}
*/
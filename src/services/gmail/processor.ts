// src/services/gmail/processor.ts
import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import mongoose from "mongoose";
import getSystemEmailRawModel from "../../models/system/SystemEmailRaw";
import getGmailWatchModel from "../../models/system/GmailWatch";
import { getTenantDB } from "../../config/tenantDb";
import { getAccountModel } from "../../models/tenant/Account";
import { getTenantDetailModel } from "../../models/system/TenantDetail";
import { walkParts, ParsedEmailContent, parseHeaders } from "./parser";
import { getEmailMatcher } from "./matcher";
import axios from "axios";

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
  startHistoryId: string,
  entityId?: mongoose.Types.ObjectId // 🆕
): Promise<string> {
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  let pageToken: string | undefined;
  let latestHistoryId = startHistoryId;

  do {
    const response = await gmail.users.history.list({
      userId: "me",
      startHistoryId,
      historyTypes: ["messageAdded"],
      pageToken,
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
          record.id || "",
          null, // forcedRouting default
          entityId // 🆕 pass through
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
  } | null,
  restrictToEntityId?: mongoose.Types.ObjectId // 🆕
) {
  const SystemEmailRaw = await getSystemEmailRawModel();
  const API_URL = process.env.AGENT_URL || "http://localhost:8080/extract";
  // ⛔ Idempotencia por Gmail ID
  const exists = await SystemEmailRaw.findOne({ gmailId });
  if (exists) return;

  const message = await gmail.users.messages.get({
    userId: "me",
    id: gmailId,
    format: "full",
  });

  const headers = parseHeaders(message.data.payload?.headers || []);

  const from = headers["from"] || "";
  const subject = headers["subject"] || "";
  // ⛔ FILTRO POR SUBJECT
  if (!subjectMatches(subject)) {
    return; // no guardar, no llamar IA, no nada
  }
  const messageIdHeader = headers["message-id"] || "";
  const receivedAt = new Date(headers["date"] || Date.now());

  const content: ParsedEmailContent = {
    text: null,
    html: null,
    attachments: [],
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
      accountNumber: forcedRouting.account.toString(),
    };
  }
  // 👉 PRIORIDAD 2: matcher automático
  else {
    const matcher = getEmailMatcher();
    const matchResult = await matcher.matchEmail(from, subject, restrictToEntityId); // 🆕

    if (matchResult.matched) {
      routing = {
        entityId: matchResult.entityId,
        bank: matchResult.bank,
        accountNumber: matchResult.accountNumber,
      };
    } else {
      routingError = "No matching forwarding config found";
    }
  }

  const { data } = await axios.post(API_URL, {
    html: content.html,
  });

  const transactionVariablesIA = data.transactionVariables || null;
  const transactionTypeIA = data.transactionType || null;

  // 🔍 VALIDACIÓN DE CUENTAS (Layaway / Suffix Match)
  if (transactionVariablesIA && routing?.entityId) {
    try {
      const TenantDetail = await getTenantDetailModel();
      const detail = await TenantDetail.findById(routing.entityId);

      if (detail) {
        const tenantId = detail.tenantId.toString();
        const tenantDB = await getTenantDB(tenantId, routing.entityId.toString());
        const AccountModel = getAccountModel(tenantDB);

        // Helper para buscar cuenta por sufijo
        const findAccountBySuffix = async (suffix: string) => {
          const cleanSuffix = suffix.replace(/\D/g, "");
          if (cleanSuffix.length < 3) return null; // Evitar falsos positivos con muy pocos dígitos
          return await AccountModel.findOne({
            account_number: { $regex: cleanSuffix + "$", $options: "i" }
          });
        };

        // 1. Validar Origin Account
        if (transactionVariablesIA.originAccount) {
          const match = await findAccountBySuffix(transactionVariablesIA.originAccount);
          if (match) {
            console.log(`✅ Origin Account Match: ${transactionVariablesIA.originAccount} -> ${match.account_number}`);
            transactionVariablesIA.originAccount = match.account_number;
          }
        }

        // 2. Validar Destination Account
        if (transactionVariablesIA.destinationAccount) {
          const match = await findAccountBySuffix(transactionVariablesIA.destinationAccount);
          if (match) {
            console.log(`✅ Destination Account Match: ${transactionVariablesIA.destinationAccount} -> ${match.account_number}`);
            transactionVariablesIA.destinationAccount = match.account_number;
          }
        }
      }
    } catch (err) {
      console.error("❌ Error validating accounts in tenant DB:", err);
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

    transactionVariables: transactionVariablesIA
      ? transactionVariablesIA
      : {
        originAccount: null,
        destinationAccount: null,
        amount: null,
        currency: null,
        operationDate: null,
        operationNumber: null,
      },

    transactionType: transactionTypeIA ? transactionTypeIA : null,
    processed: false,
    processedAt: null,
    error: routing ? null : routingError,
  });
}

const subject_keywords = [
  "yape", "transferen", "consumo", "constancia", "terceros",
  "retiro", "devolucion", "cargo", "abono", "movimiento", "operacion"
];

function subjectMatches(subject: string): boolean {
  const s = subject.toLowerCase();
  return subject_keywords.some(k => s.includes(k));
}

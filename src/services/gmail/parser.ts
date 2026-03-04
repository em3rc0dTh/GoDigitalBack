// src/services/gmail/parser.ts
import { gmail_v1 } from 'googleapis';
import * as cheerio from 'cheerio';

/* =========================================================
   UTILIDADES BASE
========================================================= */

export function decodeBody(data?: string): string | null {
    if (!data) return null;
    return Buffer
        .from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
        .toString('utf-8');
}

export function parseHeaders(
    headers: gmail_v1.Schema$MessagePartHeader[] = []
): Record<string, string> {
    const map: Record<string, string> = {};
    headers.forEach(h => {
        if (h.name && h.value) {
            map[h.name.toLowerCase()] = h.value;
        }
    });
    return map;
}

/* =========================================================
   PARSEO MIME (BODY + ADJUNTOS)
========================================================= */

export interface ParsedEmailContent {
    text: string | null;
    html: string | null;
    attachments: {
        filename: string;
        mimeType?: string;
        attachmentId: string;
        size?: number;
    }[];
}

export function walkParts(
    part: gmail_v1.Schema$MessagePart,
    result: ParsedEmailContent
) {
    if (!part) return;

    const mime = part.mimeType;

    if (mime === 'text/plain') {
        result.text = decodeBody(part.body?.data || "");
    }

    if (mime === 'text/html') {
        result.html = decodeBody(part.body?.data || "");
    }

    if (part.filename && part.body?.attachmentId) {
        result.attachments.push({
            filename: part.filename,
            mimeType: part.mimeType || "",
            attachmentId: part.body.attachmentId,
            size: part.body.size || 0
        });
    }

    if (part.parts) {
        part.parts.forEach(p => walkParts(p, result));
    }
}

/* =========================================================
   EXTRACTOR GENÉRICO
========================================================= */

/**
 * Extrae un valor usando múltiples patrones regex (como en Python)
 */
function extract(body: string, patterns: RegExp[]): string {
    for (const pattern of patterns) {
        const match = body.match(pattern);
        if (match && match[1]) {
            return match[1].trim();
        }
    }
    return "-";
}

/**
 * Normaliza el texto del email
 */
function normalizeText(text: string): string {
    return text
        .replace(/\r/g, '')
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/* =========================================================
   INTERFACES DE TRANSACCIONES
========================================================= */

export interface ParsedTransaction {
    // Campos básicos
    monto?: string;
    currency?: string;
    fecha?: string;
    descripcion?: string;

    // Campos detallados (estilo Python)
    yapero?: string;
    origen?: string;
    nombreBenef?: string;
    cuentaBenef?: string;
    celularBenef?: string;
    nroOperacion?: string;
    tipoOperacion?: string;
    comision?: string;

    // Metadata
    rawText?: string;
    banco?: string;
    accountHint?: string;
}

/* =========================================================
   PARSERS ESPECÍFICOS POR BANCO
========================================================= */

/**
 * Parser genérico para YaPe (BCP)
 */
function parseYape(body: string, subject: string): ParsedTransaction | null {
    if (!body) return null;

    const normalized = normalizeText(body);

    try {
        const monto = extract(normalized, [
            /Monto(?:\s+Total)?:?\s*S\/\s*([\d,.]+)/i,
            /Total del consumo:?\s*S\/\s*([\d,.]+)/i,
            /S\/\s*([\d,.]+)\s*(?:PEN)?/i,
        ]);

        const nroOperacion = extract(normalized, [
            /N(?:ú|u)mero de operación:?\s*(\d+)/i,
            /N° de operación:?\s*(\d+)/i,
            /Nº de operación:?\s*(\d+)/i,
            /Código de operación:?\s*(\d+)/i,
            /\bOperación[:\s]+(\d{5,})/i,
        ]);

        const fecha = extract(normalized, [
            /(\d{1,2}\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+\d{4}\s*-\s*\d{1,2}:\d{2}\s*(?:a\.?m\.?|p\.?m\.?))/i,
            /\bFecha(?:\s+y\s+hora)?:?\s*(.+)/i,
            /(\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}\s*(?:AM|PM))/i,
            /(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/i,
        ]);

        const yapero = extract(normalized, [
            /Hola[,\s]+([A-Za-zÁÉÍÓÚÑáéíóúñ ]+)/i,
            /De:\s*([A-Za-zÁÉÍÓÚÑáéíóúñ ]+)/i,
            /Titular:?\s*([A-Za-zÁÉÍÓÚÑáéíóúñ ]+)/i,
        ]);

        const origen = extract(normalized, [
            /Cuenta cargo:?\s*([\d\s]+)/i,
            /Desde el número:?\s*(\d{6,})/i,
            /Tu número de celular:?\s*(\d{6,})/i,
            /Cuenta origen:?\s*([\d\s]{6,})/i,
        ]).replace(/\s/g, '');

        const nombreBenef = extract(normalized, [
            /Nombre del Beneficiario:?\s*(.+)/i,
            /Enviado a:?\s*(.+)/i,
            /Beneficiario:?\s*(.+)/i,
            /Para:?\s*([A-Za-zÁÉÍÓÚÑáéíóúñ ]+)/i,
        ]);

        const cuentaBenef = extract(normalized, [
            /Cuenta destino:?\s*([\d\s]+)/i,
            /Celular del Beneficiario:?\s*(\d{6,})/i,
            /Nro destino:?\s*(\d{6,})/i,
        ]).replace(/\s/g, '');

        const celularBenef = extract(normalized, [
            /celular del beneficiario[:\s]*([x\d]{6,})/i,
            /celular[:\s]*([x\d]{6,})/i,
            /destinatario[:\s]*([x\d]{6,})/i,
            /cuenta destino[:\s]*([x\d]{6,})/i,
        ]);

        // Si no encontramos al menos monto, no es válido
        if (monto === "-") return null;

        return {
            monto,
            currency: 'PEN',
            fecha,
            yapero,
            origen,
            nombreBenef,
            cuentaBenef,
            celularBenef,
            nroOperacion,
            descripcion: subject,
            banco: 'BCP/YaPe',
            rawText: normalized
        };
    } catch (error) {
        console.error('Error parsing YaPe email:', error);
        return null;
    }
}

/**
 * Parser para Interbank
 */
function parseInterbank(body: string, subject: string): ParsedTransaction | null {
    if (!body) return null;

    const normalized = normalizeText(body);

    try {
        const monto = extract(normalized, [
            /Monto Total:\s*S\/\s*([\d,.]+)/i,
            /Monto:?\s*S\/\s*([\d,.]+)/i,
        ]);

        const yapero = extract(normalized, [
            /Hola\s+([^\n,]+)/i,
        ]);

        const origen = extract(normalized, [
            /Cuenta cargo:\s*Cuenta Simple Soles\s*([\d\s]+)/i,
            /Cuenta cargo:\s*([\d\s]+)/i,
        ]).replace(/\s/g, '');

        const fecha = extract(normalized, [
            /(\d{2}\s\w{3}\s\d{4}\s\d{2}:\d{2}\s[AP]M)/i,
            /Fecha:?\s*(.+)/i,
        ]);

        const nombreBenef = extract(normalized, [
            /Cuenta destino:\s*([^\n\d]+)/i,
            /Beneficiario:\s*([^\n]+)/i,
        ]);

        const cuentaBenef = extract(normalized, [
            /Cuenta destino:[^\n]+\n([\d\s]+)/i,
            /Cuenta destino:\s*([\d\s]+)/i,
        ]).replace(/\s/g, '');

        const nroOperacion = extract(normalized, [
            /Código de operación:\s*(\d+)/i,
            /Nro de operación:\s*(\d+)/i,
        ]);

        const tipoOperacion = extract(normalized, [
            /Tipo de operación:\s*([^\n]+)/i,
        ]);

        const comision = extract(normalized, [
            /Comisión:\s*S\/\s*([\d,.]+)/i,
        ]);

        if (monto === "-") return null;

        return {
            monto,
            currency: 'PEN',
            fecha,
            yapero,
            origen,
            nombreBenef,
            cuentaBenef,
            nroOperacion,
            tipoOperacion,
            comision,
            descripcion: subject,
            banco: 'Interbank',
            rawText: normalized
        };
    } catch (error) {
        console.error('Error parsing Interbank email:', error);
        return null;
    }
}

/**
 * Parser básico para BCP (no YaPe)
 */
function parseBCP(body: string, subject: string): ParsedTransaction | null {
    const normalized = normalizeText(body);

    const regex = /monto:\s*s\/\s*([\d,]+\.\d{2}).*?fecha:\s*(\d{2}\/\d{2}\/\d{4}).*?cuenta.*?(\d{4})/gis;
    const match = regex.exec(normalized);

    if (match) {
        return {
            monto: match[1].replace(',', ''),
            currency: 'PEN',
            fecha: match[2],
            accountHint: match[3],
            descripcion: subject,
            banco: 'BCP',
            rawText: match[0]
        };
    }

    // Fallback
    const simpleRegex = /monto:\s*s\/\s*([\d,]+\.\d{2}).*?fecha:\s*(\d{2}\/\d{2}\/\d{4})/gis;
    const simpleMatch = simpleRegex.exec(normalized);

    if (simpleMatch) {
        return {
            monto: simpleMatch[1].replace(',', ''),
            currency: 'PEN',
            fecha: simpleMatch[2],
            descripcion: subject,
            banco: 'BCP',
            rawText: simpleMatch[0]
        };
    }

    return null;
}

/**
 * Parser para BBVA
 */
function parseBBVA(body: string, subject: string): ParsedTransaction | null {
    const normalized = normalizeText(body);

    const regex = /importe.*?s\/\s*([\d,]+\.\d{2}).*?(\d{2}\/\d{2}\/\d{4})/gis;
    const match = regex.exec(normalized);

    if (match) {
        return {
            monto: match[1].replace(',', ''),
            currency: 'PEN',
            fecha: match[2],
            descripcion: subject,
            banco: 'BBVA',
            rawText: match[0]
        };
    }

    return null;
}

/**
 * Parser para Scotiabank
 */
function parseScotiabank(body: string, subject: string): ParsedTransaction | null {
    const normalized = normalizeText(body);

    const regex = /s\/\s*([\d,]+\.\d{2})/gi;
    const match = regex.exec(normalized);

    if (match) {
        return {
            monto: match[1].replace(',', ''),
            currency: 'PEN',
            descripcion: subject,
            banco: 'Scotiabank',
            rawText: match[0]
        };
    }

    return null;
}

/* =========================================================
   PARSEO HTML
========================================================= */

/**
 * Extrae texto plano de HTML usando cheerio
 */
function htmlToText(html: string): string {
    const $ = cheerio.load(html);

    // Remover scripts y styles
    $('script, style').remove();

    // Obtener texto
    return $('body').text() || $.root().text();
}

/**
 * Parser para HTML (usa cheerio para extraer texto)
 */
function parseEmailHTML(html: string, subject: string, from: string): ParsedTransaction | null {
    if (!html) return null;

    try {
        const text = htmlToText(html);
        return parseEmailText(text, subject, from);
    } catch (error) {
        console.error('Error parsing HTML email:', error);
        return null;
    }
}

/* =========================================================
   PARSER PRINCIPAL
========================================================= */

/**
 * Parser principal para texto plano
 */
function parseEmailText(body: string, subject: string, from: string): ParsedTransaction | null {
    if (!body) return null;

    const fromLower = from.toLowerCase();
    const subjectLower = subject.toLowerCase();

    // Detectar YaPe por subject o contenido
    if (subjectLower.includes('yape') || body.toLowerCase().includes('yape')) {
        return parseYape(body, subject);
    }

    // Detectar por remitente
    if (fromLower.includes('interbank')) {
        return parseInterbank(body, subject);
    }

    if (fromLower.includes('bcp')) {
        return parseBCP(body, subject);
    }

    if (fromLower.includes('bbva')) {
        return parseBBVA(body, subject);
    }

    if (fromLower.includes('scotiabank')) {
        return parseScotiabank(body, subject);
    }

    // Intentar parser genérico como último recurso
    return parseYape(body, subject);
}

/**
 * Función principal para parsear transacciones de email
 * Compatible con ambos formatos (texto y HTML)
 */
export function parseTransactionsFromEmail(
    textBody: string | null,
    htmlBody: string | null,
    subject: string,
    from: string
): ParsedTransaction[] {
    const transactions: ParsedTransaction[] = [];

    // Priorizar texto plano
    if (textBody) {
        const tx = parseEmailText(textBody, subject, from);
        if (tx) {
            transactions.push(tx);
            return transactions; // Retornar inmediatamente si encontramos algo
        }
    }

    // Fallback a HTML
    if (htmlBody) {
        const tx = parseEmailHTML(htmlBody, subject, from);
        if (tx) {
            transactions.push(tx);
        }
    }

    return transactions;
}

/* =========================================================
   HELPERS PARA CONVERSIÓN A SCHEMA DB
========================================================= */

/**
 * Convierte ParsedTransaction a formato de tu modelo Transaction
 */
export function transactionToDBFormat(tx: ParsedTransaction, accountId: string) {
    // Parsear fecha al formato Date
    let fecha_hora: Date | undefined;
    if (tx.fecha && tx.fecha !== "-") {
        // Intentar parsear diferentes formatos
        // Formato: "15 diciembre 2024 - 10:30 a.m."
        // Formato: "15/12/2024 10:30 AM"
        // Formato: "2024-12-15 10:30"
        fecha_hora = parseDateString(tx.fecha);
    }

    // Parsear monto
    const monto = tx.monto && tx.monto !== "-"
        ? parseFloat(tx.monto.replace(',', ''))
        : undefined;

    return {
        accountId,
        uuid: tx.nroOperacion !== "-" ? tx.nroOperacion : undefined,
        descripcion: buildDescription(tx),
        fecha_hora,
        fecha_hora_raw: tx.fecha !== "-" ? tx.fecha : undefined,
        monto,
        currency: tx.currency || 'PEN',
        operation_number: tx.nroOperacion !== "-" ? tx.nroOperacion : undefined,
        movement: tx.tipoOperacion !== "-" ? tx.tipoOperacion : undefined,

        // Metadata adicional (puedes guardar en un campo JSON)
        metadata: {
            yapero: tx.yapero,
            origen: tx.origen,
            nombreBenef: tx.nombreBenef,
            cuentaBenef: tx.cuentaBenef,
            celularBenef: tx.celularBenef,
            comision: tx.comision,
            banco: tx.banco
        }
    };
}

function buildDescription(tx: ParsedTransaction): string {
    const parts: string[] = [];

    if (tx.descripcion) parts.push(tx.descripcion);
    if (tx.yapero && tx.yapero !== "-") parts.push(`De: ${tx.yapero}`);
    if (tx.nombreBenef && tx.nombreBenef !== "-") parts.push(`Para: ${tx.nombreBenef}`);
    if (tx.tipoOperacion && tx.tipoOperacion !== "-") parts.push(tx.tipoOperacion);

    return parts.join(' | ') || 'Transacción';
}

function parseDateString(dateStr: string): Date | undefined {
    if (!dateStr || dateStr === "-") return undefined;

    // Intentar Date nativo primero
    const native = new Date(dateStr);
    if (!isNaN(native.getTime())) return native;

    // Manejar formato español: "15 diciembre 2024 - 10:30 a.m."
    const meses: Record<string, number> = {
        enero: 0, febrero: 1, marzo: 2, abril: 3,
        mayo: 4, junio: 5, julio: 6, agosto: 7,
        septiembre: 8, setiembre: 8, octubre: 9,
        noviembre: 10, diciembre: 11
    };

    const match = dateStr.match(/(\d{1,2})\s+(\w+)\s+(\d{4})\s*-?\s*(\d{1,2}):(\d{2})\s*(a\.?m\.?|p\.?m\.?)?/i);
    if (match) {
        const day = parseInt(match[1]);
        const month = meses[match[2].toLowerCase()];
        const year = parseInt(match[3]);
        let hour = parseInt(match[4]);
        const minute = parseInt(match[5]);
        const ampm = match[6]?.toLowerCase();

        if (ampm && ampm.includes('p') && hour < 12) hour += 12;
        if (ampm && ampm.includes('a') && hour === 12) hour = 0;

        return new Date(year, month, day, hour, minute);
    }

    // Formato: "15/12/2024 10:30 AM"
    const match2 = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (match2) {
        const day = parseInt(match2[1]);
        const month = parseInt(match2[2]) - 1;
        const year = parseInt(match2[3]);
        let hour = parseInt(match2[4]);
        const minute = parseInt(match2[5]);
        const ampm = match2[6];

        if (ampm && ampm.toUpperCase() === 'PM' && hour < 12) hour += 12;
        if (ampm && ampm.toUpperCase() === 'AM' && hour === 12) hour = 0;

        return new Date(year, month, day, hour, minute);
    }

    return undefined;
}
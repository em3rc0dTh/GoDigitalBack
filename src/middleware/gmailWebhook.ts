// src/middleware/gmailWebhook.ts
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

/**
 * Validar que el webhook viene de Google Cloud Pub/Sub
 * 
 * Opciones de validación:
 * 1. Verificar token en query params (si configuraste en Pub/Sub)
 * 2. Verificar JWT en Authorization header
 * 3. Validar IP de origen
 */

export function validatePubSubToken(req: Request, res: Response, next: NextFunction) {
    const token = req.query.token as string;
    const expectedToken = process.env.PUBSUB_VERIFICATION_TOKEN;

    if (!expectedToken) {
        // Si no hay token configurado, skip validación (dev only)
        console.warn('⚠️ PUBSUB_VERIFICATION_TOKEN not set');
        return next();
    }

    if (token !== expectedToken) {
        console.error('❌ Invalid Pub/Sub token');
        return res.status(401).json({ error: 'Unauthorized' });
    }

    next();
}

/**
 * Validar JWT de Google Cloud Pub/Sub
 * Más seguro que token simple
 */
export async function validatePubSubJWT(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing authorization header' });
    }

    const token = authHeader.substring(7);

    try {
        // Verificar JWT usando Google Auth Library
        const { OAuth2Client } = require('google-auth-library');
        const client = new OAuth2Client();

        const expectedAudience = process.env.API_URL + '/api/gmail/webhook';

        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: expectedAudience
        });

        const payload = ticket.getPayload();

        // Verificar que el email sea de Google Pub/Sub
        if (!payload || !payload.email?.endsWith('@pubsub.gserviceaccount.com')) {
            throw new Error('Invalid service account');
        }

        next();
    } catch (error) {
        console.error('❌ JWT validation failed:', error);
        res.status(401).json({ error: 'Invalid token' });
    }
}

/**
 * Rate limiting específico para webhook
 */
const webhookRequestCounts = new Map<string, number[]>();
const WEBHOOK_RATE_LIMIT = 100; // requests por minuto por email
const WINDOW_MS = 60000; // 1 minuto

export function rateLimitWebhook(req: Request, res: Response, next: NextFunction) {
    try {
        const message = req.body.message;
        if (!message || !message.data) {
            return next();
        }

        const data = JSON.parse(Buffer.from(message.data, 'base64').toString());
        const emailAddress = data.emailAddress;

        if (!emailAddress) {
            return next();
        }

        const now = Date.now();
        const requests = webhookRequestCounts.get(emailAddress) || [];

        // Limpiar requests antiguos
        const recentRequests = requests.filter(time => now - time < WINDOW_MS);

        if (recentRequests.length >= WEBHOOK_RATE_LIMIT) {
            console.warn(`⚠️ Rate limit exceeded for ${emailAddress}`);
            return res.status(429).json({ error: 'Too many requests' });
        }

        recentRequests.push(now);
        webhookRequestCounts.set(emailAddress, recentRequests);

        // Limpiar mapa periódicamente
        if (webhookRequestCounts.size > 1000) {
            webhookRequestCounts.clear();
        }

        next();
    } catch (error) {
        console.error('Error in rate limit middleware:', error);
        next();
    }
}

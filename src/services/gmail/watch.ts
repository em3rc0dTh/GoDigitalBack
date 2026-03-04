// src/services/gmail/watch.ts
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import getGmailWatchModel from '../../models/system/GmailWatch';
import { getOAuth2Client } from './auth';

const TOPIC_NAME = process.env.GMAIL_PUBSUB_TOPIC!;

/**
 * Configura o renueva el único watch de Gmail del sistema
 */
export async function setupWatch(
    oauth2Client: OAuth2Client,
    email: string,
    tenantDetailId: string
) {
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const watchResponse = await gmail.users.watch({
        userId: 'me',
        requestBody: {
            topicName: TOPIC_NAME,
            labelIds: ['INBOX']
        }
    });

    const { historyId, expiration } = watchResponse.data;

    if (!historyId || !expiration) {
        throw new Error('Invalid watch response from Gmail');
    }

    const GmailWatch = await getGmailWatchModel();
    const tokens = oauth2Client.credentials;

    // 🔒 Garantiza un watch por tenant
    await GmailWatch.findOneAndUpdate(
        { tenantDetailId },
        {
            tenantDetailId,
            email,
            historyId,
            expiration: new Date(Number(expiration)),
            topicName: TOPIC_NAME,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            status: 'active',
            lastError: null
        },
        {
            upsert: true,
            new: true
        }
    );

    return { historyId, expiration };
}

/**
 * Detiene el watch activo (single Gmail)
 */
export async function stopWatch(oauth2Client: OAuth2Client) {
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    await gmail.users.stop({
        userId: 'me'
    });

    const GmailWatch = await getGmailWatchModel();

    await GmailWatch.updateMany(
        { status: 'active' },
        { status: 'expired' }
    );
}

/**
 * Renueva automáticamente el watch antes de expirar
 */
export async function renewExpiredWatches() {
    const GmailWatch = await getGmailWatchModel();

    const toRenew = await GmailWatch.find({
        status: 'active',
        expiration: {
            $lt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        }
    });

    for (const watch of toRenew) {
        try {
            const oauth2Client = getOAuth2Client();
            oauth2Client.setCredentials({
                access_token: watch.accessToken,
                refresh_token: watch.refreshToken
            });

            await setupWatch(oauth2Client, watch.email, watch.tenantDetailId.toString());
            console.log(`✅ Renewed Gmail watch for ${watch.email}`);
        } catch (error: any) {
            console.error(`❌ Failed to renew watch for ${watch.email}`, error);

            await GmailWatch.findByIdAndUpdate(watch._id, {
                status: 'error',
                lastError: error.message
            });
        }
    }
}

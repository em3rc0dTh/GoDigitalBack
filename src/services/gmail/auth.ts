// src/services/gmail/auth.ts
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

const SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.modify'
];

export function getOAuth2Client(): OAuth2Client {
    return new google.auth.OAuth2(
        process.env.GMAIL_CLIENT_ID,
        process.env.GMAIL_CLIENT_SECRET,
        process.env.GMAIL_REDIRECT_URI
    );
}

export function getAuthUrl(state: string): string {
    const oauth2Client = getOAuth2Client();
    return oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        state, // tenantDetailId:userId para callback
        prompt: 'consent' // Forzar refresh token
    });
}

export async function getTokensFromCode(code: string) {
    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    return tokens;
}

export function setCredentials(oauth2Client: OAuth2Client, tokens: any) {
    oauth2Client.setCredentials(tokens);
    return oauth2Client;
}
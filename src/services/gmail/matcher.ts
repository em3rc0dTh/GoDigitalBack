// src/services/gmail/matcher.ts
import mongoose from "mongoose";
import getEmailForwardingConfigModel from "../../models/system/EmailForwardingConfig";
import { getTenantDB } from "../../config/tenantDb";

/**
 * Resultado del matching
 */
export interface MatchResult {
    entityId: mongoose.Types.ObjectId | null;
    bank: string | null;
    accountNumber: string | null;
    matched: boolean;
}

/**
 * Servicio de enriquecimiento mínimo
 * 
 * Responsabilidades:
 * 1. Buscar en EmailForwardingConfig por email origen
 * 2. Derivar banco y cuenta de la config
 * 3. NO parsea montos
 * 4. NO infiere tipo de transacción
 * 5. NO valida nada
 * 
 * Es SOLO un preprocesado declarativo
 */
export class EmailMatcher {
    /**
     * Enriquece un email usando las reglas de forwarding
     */
    async matchEmail(from: string, subject: string): Promise<MatchResult> {
        const emptyResult: MatchResult = {
            entityId: null,
            bank: null,
            accountNumber: null,
            matched: false
        };

        try {
            // Normalizar email (extraer solo el email, sin nombre)
            const emailAddress = this.extractEmail(from);
            if (!emailAddress) {
                console.log(`⚠️  Could not extract email from: ${from}`);
                return emptyResult;
            }

            console.log(`🔍 Matching email: ${emailAddress}`);

            // Buscar en configuración de forwarding
            const EmailForwardingConfig = await getEmailForwardingConfigModel();

            const config = await EmailForwardingConfig.findOne({
                'forwardingData.email': emailAddress.toLowerCase(),
                active: true
            });

            if (!config) {
                console.log(`⚠️  No forwarding config found for: ${emailAddress}`);
                return emptyResult;
            }

            // Encontrar la regla específica
            const rule = config.forwardingData.find(
                (r: any) => r.email.toLowerCase() === emailAddress.toLowerCase()
            );

            if (!rule || rule.accounts.length === 0) {
                console.log(`⚠️  No accounts in rule for: ${emailAddress}`);
                return emptyResult;
            }

            console.log(`✅ Found forwarding rule for ${emailAddress} with ${rule.accounts.length} accounts`);

            // Obtener info de la primera cuenta (puedes refinar esto después)
            const accountId = rule.accounts[0];
            const accountInfo = await this.getAccountInfo(config.entityId, accountId);

            if (!accountInfo) {
                console.log(`⚠️  Could not get account info for: ${accountId}`);
                return emptyResult;
            }

            console.log(`🏦 Matched: ${accountInfo.bank} - ${accountInfo.accountNumber}`);

            return {
                entityId: config.entityId,
                bank: accountInfo.bank,
                accountNumber: accountInfo.accountNumber,
                matched: true
            };

        } catch (error) {
            console.error('❌ Error in matchEmail:', error);
            return emptyResult;
        }
    }

    /**
     * Extrae el email de un string como "Pepito Zapatero <pepito@zapatero.com>"
     */
    private extractEmail(from: string): string | null {
        // Buscar email entre < >
        const match = from.match(/<(.+?)>/);
        if (match && match[1]) {
            return match[1].trim();
        }

        // Si no tiene < >, asumir que todo es el email
        if (from.includes('@')) {
            return from.trim();
        }

        return null;
    }

    /**
     * Obtiene info de cuenta desde tenant DB
     */
    private async getAccountInfo(
        entityId: mongoose.Types.ObjectId,
        accountId: mongoose.Types.ObjectId
    ): Promise<{ bank: string; accountNumber: string } | null> {
        try {
            // Obtener TenantDetail para saber qué DB usar
            const getTenantDetailModel = (await import("../../models/system/TenantDetail")).default;
            const TenantDetail = await getTenantDetailModel();

            const detail = await TenantDetail.findById(entityId);
            if (!detail || !detail.dbName) {
                console.error(`❌ TenantDetail ${entityId} not found or has no dbName`);
                return null;
            }

            // Conectar a tenant DB
            const tenantConnection = await getTenantDB(
                detail.tenantId.toString(),
                entityId.toString()
            );

            // Buscar cuenta
            const Account = tenantConnection.model('Account');
            const account = await Account.findById(accountId);

            if (!account) {
                console.error(`❌ Account ${accountId} not found in ${detail.dbName}`);
                return null;
            }

            return {
                bank: account.bank_name || 'UNKNOWN',
                accountNumber: account.account_number || ''
            };

        } catch (error) {
            console.error('❌ Error getting account info:', error);
            return null;
        }
    }

    /**
     * Match múltiples emails en batch
     * Útil para reprocesamiento histórico
     */
    async matchBatch(emails: Array<{ from: string; subject: string }>): Promise<MatchResult[]> {
        const results: MatchResult[] = [];

        for (const email of emails) {
            const result = await this.matchEmail(email.from, email.subject);
            results.push(result);
        }

        return results;
    }
}

// Singleton para reutilizar
let matcherInstance: EmailMatcher | null = null;

export function getEmailMatcher(): EmailMatcher {
    if (!matcherInstance) {
        matcherInstance = new EmailMatcher();
    }
    return matcherInstance;
}
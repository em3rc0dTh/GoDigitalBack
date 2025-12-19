// src/models/system/EmailForwardingConfig.ts
import mongoose from "mongoose";
import { getSystemDB, getOrCreateModel } from "../../config/tenantDb";

/**
 * Configuración de forwarding por entidad/tenant
 * 
 * Los usuarios configuran aquí:
 * - Desde qué emails forwardean
 * - A qué cuentas bancarias corresponden
 * 
 * Esta info se usa para enriquecer los emails en System.Email.Raw
 * NO es una conexión OAuth, es solo metadata declarativa
 */

export interface ForwardingRule {
    email: string;              // Email desde el que se forwardea (ej: "pepito@zapatero.com")
    accounts: mongoose.Types.ObjectId[];  // IDs de Account en tenant DB
}

export interface EmailForwardingConfigDocument extends mongoose.Document {
    entityId: mongoose.Types.ObjectId;  // TenantDetail._id (o puedes usar dbName)
    forwardingData: ForwardingRule[];

    // Control
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const EmailForwardingConfigSchema = new mongoose.Schema<EmailForwardingConfigDocument>({
    entityId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "TenantDetail",
        required: true,
        unique: true,
        index: true
    },
    forwardingData: {
        type: [{
            email: {
                type: String,
                required: true,
                lowercase: true,
                trim: true
            },
            accounts: {
                type: [mongoose.Schema.Types.ObjectId],
                required: true,
                validate: {
                    validator: function (v: any[]) {
                        return v && v.length > 0;
                    },
                    message: 'Each forwarding rule must have at least one account'
                }
            }
        }],
        required: true,
        validate: {
            validator: function (v: any[]) {
                return v && v.length > 0;
            },
            message: 'Config must have at least one forwarding rule'
        }
    },
    active: {
        type: Boolean,
        default: true,
        index: true
    }
}, {
    timestamps: true,
    strict: true,
    collection: 'email_forwarding_config'
});

// Índice para búsquedas rápidas por email
EmailForwardingConfigSchema.index({ 'forwardingData.email': 1 });
EmailForwardingConfigSchema.index({ active: 1, entityId: 1 });

// Validación adicional: emails únicos dentro de la misma entidad
EmailForwardingConfigSchema.pre('save', function () {
    const doc = this as EmailForwardingConfigDocument;

    const emails = doc.forwardingData.map(r => r.email);
    if (emails.length !== new Set(emails).size) {
        throw new Error('Duplicate email addresses in forwarding rules');
    }
});

export async function getEmailForwardingConfigModel() {
    const systemDB = await getSystemDB();
    return getOrCreateModel(systemDB, "EmailForwardingConfig", EmailForwardingConfigSchema);
}

export default getEmailForwardingConfigModel;
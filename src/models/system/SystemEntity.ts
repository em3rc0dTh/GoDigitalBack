// src/models/system/SystemEntity.ts
import mongoose from "mongoose";
import { getSystemDB, getOrCreateModel } from "../../config/tenantDb";

const SystemEntitySchema = new mongoose.Schema({
    // Equivalent to 'id' in schema, Mongo provides _id.
    _id: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        index: true
    },
    name: {
        type: String,
        required: true,
        index: true
    },
    entityClass: {
        type: String,
        enum: ["vendor", "customer", "investor"],
        default: null
    },
    legalClass: {
        type: String,
        enum: ["natural-entity", "legal-entity"],
        default: null
    },
    businessType: {
        type: String,
        default: null
    },
    vendorType: {
        type: String,
        default: null
    },
    identifiers: {
        type: Object, // json[]
        default: {
            taxId: null,
            taxIdType: null,

            taxIdCountry: null
        }
    },
    contact: {
        type: Object,
        default: {
            email: null,
            phone: null,
            address: null
        }
    },
    ownerAssociates: [
        {
            type: Object,
            default: {
                entityId: String,
                entityName: String
            }
        }
    ],
    isOwnerAssociate: {
        type: Boolean,
        default: false
    },
    represents: {
        type: Object,
        default: {
            entityId: String,
            entityName: String
        }
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true,
    strict: true,
    collection: 'system_entity'
});

export async function getSystemEntityModel() {
    const systemDB = await getSystemDB();
    return getOrCreateModel(systemDB, "SystemEntity", SystemEntitySchema);
}

export default getSystemEntityModel;

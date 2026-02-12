
import mongoose, { Document, Model } from "mongoose";

export interface EntityIdentifiers {
    tax_id?: string;
    national_id?: string;
    registration_number?: string;
}

export interface EntityContact {
    email?: string;
    phone?: string;
    address?: string;
}

export interface EntityDocument extends Document {
    company_id: string; // owning company
    name: string;       // key, unique within company
    entity_classes: string[];          // e.g. ["vendor", "investor", "colaborator"]
    legal_class: 'legal-entity' | 'natural-entity';
    business_type?: string;        // e.g. "bank" or "internet service provider" or "health care"
    vendor_type?: string;          // e.g. one of two: "provider" or "supplier"
    identifiers: EntityIdentifiers;
    contact: EntityContact;
    has_owner_associate?: boolean;
    owner_associates?: {
        entity_id: string;
        entity_name: string;
    }[];
    is_owner_associate?: boolean;
    represents?: {
        entity_id: string;
        entity_name: string;
    }[];
    is_active: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const EntitySchema = new mongoose.Schema({
    company_id: { type: String, required: true },
    name: { type: String, required: true },
    entity_classes: { type: [String], default: [] },
    legal_class: {
        type: String,
        enum: ['legal-entity', 'natural-entity'],
        required: true
    },
    business_type: { type: String },
    vendor_type: { type: String },
    identifiers: {
        tax_id: { type: String },
        national_id: { type: String },
        registration_number: { type: String }
    },
    contact: {
        email: { type: String },
        phone: { type: String },
        address: { type: String }
    },
    has_owner_associate: { type: Boolean, default: false },
    owner_associates: [{
        entity_id: { type: String },
        entity_name: { type: String }
    }],
    is_owner_associate: { type: Boolean, default: false },
    represents: [{
        entity_id: { type: String },
        entity_name: { type: String }
    }],
    is_active: { type: Boolean, default: true }
}, {
    timestamps: true,
    collection: 'entities'
});

// Ensure name is unique within a company
EntitySchema.index({ company_id: 1, name: 1 }, { unique: true });

export function getEntityModel(connection: mongoose.Connection): Model<EntityDocument> {
    return connection.model<EntityDocument>("Entity", EntitySchema);
}

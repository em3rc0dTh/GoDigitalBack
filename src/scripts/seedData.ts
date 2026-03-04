
import mongoose from 'mongoose';
import { getTenantDB } from '../config/tenantDb';
import { getProjectModel } from '../models/tenant/Project';
import { getEntityModel, EntityDocument } from '../models/tenant/Entity';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const providers = [
    {
        "company_id": "TELXIUS-PE",
        "name": "Delta Electronics (Perú) INC. S.R.L.",
        "entity_classes": ["legal-entity"],
        "legal_class": "legal-entity",
        "business_type": "provider",
        "vendor_type": "provider",
        "identifiers": {
            "tax_id": "20509675491",
            "national_id": "",
            "registration_number": ""
        },
        "contact": {
            "email": "farid.merino1673@gmail.com",
            "phone": "967265206",
            "address": "Av. Pardo y Aliaga 699 Of. 601, San Isidro, Lima, Peru"
        },
        "has_owner_associate": false,
        "owner_associates": [],
        "is_owner_associate": false,
        "represents": [],
        "is_active": true
    },
    {
        "company_id": "TELXIUS-PE",
        "name": "ANIXTER PERU SAC",
        "entity_classes": ["legal-entity"],
        "legal_class": "legal-entity",
        "business_type": "provider",
        "vendor_type": "provider",
        "identifiers": {
            "tax_id": "20418354781",
            "national_id": "",
            "registration_number": ""
        },
        "contact": {
            "email": "farid.merino1673@gmail.com",
            "phone": "989581820",
            "address": "Calle Ontario 157"
        },
        "has_owner_associate": false,
        "owner_associates": [],
        "is_owner_associate": false,
        "represents": [],
        "is_active": true
    },
    {
        "company_id": "TELXIUS-PE",
        "name": "FIBERMAX SAC",
        "entity_classes": ["legal-entity"],
        "legal_class": "legal-entity",
        "business_type": "provider",
        "vendor_type": "provider",
        "identifiers": {
            "tax_id": "20602028306",
            "national_id": "",
            "registration_number": ""
        },
        "contact": {
            "email": "farid.merino1673@gmail.com",
            "phone": "958155646",
            "address": "Calle Marco Nicolini 215 - Urb. Santa Catalina La Victoria - Lima, Perú"
        },
        "has_owner_associate": false,
        "owner_associates": [],
        "is_owner_associate": false,
        "represents": [],
        "is_active": true
    },
    {
        "company_id": "TELXIUS-PE",
        "name": "DASMITEC PERÚ SA",
        "entity_classes": ["legal-entity"],
        "legal_class": "legal-entity",
        "business_type": "provider",
        "vendor_type": "provider",
        "identifiers": {
            "tax_id": "20602142249",
            "national_id": "",
            "registration_number": ""
        },
        "contact": {
            "email": "farid.merino1673@gmail.com",
            "phone": "935329993",
            "address": "AV. INCA GARCILASO DE LA VEGA 1358 INT. 344 , LIMA"
        },
        "has_owner_associate": false,
        "owner_associates": [],
        "is_owner_associate": false,
        "represents": [],
        "is_active": true
    },
    {
        "company_id": "TELXIUS-PE",
        "name": "COMERCIAL DE PRODUCTOS INTEGRAL YAJOMAR SAC",
        "entity_classes": ["legal-entity"],
        "legal_class": "legal-entity",
        "business_type": "provider",
        "vendor_type": "provider",
        "identifiers": {
            "tax_id": "20609434393",
            "national_id": "",
            "registration_number": ""
        },
        "contact": {
            "email": "farid.merino1673@gmail.com",
            "phone": "998369901",
            "address": "JR. AZANGARO NRO. 970 INT. 150 CERCADO DE LIMA - LIMA"
        },
        "has_owner_associate": false,
        "owner_associates": [],
        "is_owner_associate": false,
        "represents": [],
        "is_active": true
    }
];

const projects = [
    {
        "id": "PRJ-0001",
        "name": "Reflejos FO Transmisión EFI Lima Norte",
        "status": "planned",
        "start_date": "2025-11-21",
        "end_date": "2025-12-12",
        "budgets": []
    },
    {
        "id": "PRJ-0002",
        "name": "Instalación FO Backbone Sur EFI",
        "status": "active",
        "start_date": "2025-11-24",
        "end_date": "2025-12-18"
    },
    {
        "id": "PRJ-0003",
        "name": "Ampliación FO Tramo Arequipa EFI",
        "status": "planned",
        "start_date": "2025-12-01",
        "end_date": "2025-12-20"
    },
    {
        "id": "PRJ-0004",
        "name": "Mantenimiento FO Red Metropolitana Lima",
        "status": "active",
        "start_date": "2025-11-18",
        "end_date": "2025-12-05"
    },
    {
        "id": "PRJ-0005",
        "name": "Implementación FO Nodo Trujillo EFI",
        "status": "planned",
        "start_date": "2025-12-03",
        "end_date": "2025-12-22"
    },
    {
        "id": "PRJ-0006",
        "name": "Refuerzo FO Tramo Costero Norte",
        "status": "on_hold",
        "start_date": "2025-11-26",
        "end_date": "2025-12-15"
    },
    {
        "id": "PRJ-0007",
        "name": "Instalación FO Enlace Empresarial Cusco",
        "status": "planned",
        "start_date": "2025-12-05",
        "end_date": "2025-12-19"
    },
    {
        "id": "PRJ-0008",
        "name": "Optimización FO Red Corporativa EFI",
        "status": "completed", // "closed" mapped to "completed" in code since schema doesn't have "closed"
        "start_date": "2025-11-22",
        "end_date": "2025-12-10"
    },
    {
        "id": "PRJ-0009",
        "name": "Despliegue FO Nodo Piura EFI",
        "status": "planned",
        "start_date": "2025-12-08",
        "end_date": "2025-12-27"
    },
    {
        "id": "PRJ-0010",
        "name": "Instalación FO Enlace Internacional EFI",
        "status": "active",
        "start_date": "2025-11-29",
        "end_date": "2025-12-21"
    }
];

// Mappings for status
function mapStatus(status: string): string {
    if (status === 'closed') return 'completed';
    return status;
}

const tenantId = "695eca7350c2088b5d4808d6";
const detailId = "69610fde041e3a3a203500b9";
const userOwnerId = "695eca7350c2088b5d4808d8";

async function seed() {
    try {
        console.log("Connecting to tenant DB...");
        const db = await getTenantDB(tenantId, detailId);

        const Project = getProjectModel(db);
        const Entity = getEntityModel(db);

        console.log("Seeding entities...");
        for (const data of providers) {
            // Upsert by tax_id
            await Entity.findOneAndUpdate(
                { "identifiers.tax_id": data.identifiers.tax_id },
                {
                    ...data,
                    company_id: "TELXIUS-PE", // Override just in case
                    identifiers: data.identifiers,
                    contact: { ...data.contact, email: "farid.merino1673@gmail.com" }
                },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );
        }
        console.log("Entities seeded.");

        console.log("Seeding projects...");
        for (const p of projects) {
            // Upsert by code (p.id)
            await Project.findOneAndUpdate(
                { code: p.id },
                {
                    name: p.name,
                    code: p.id,
                    projectOwner: userOwnerId,
                    status: mapStatus(p.status),
                    startDate: new Date(p.start_date),
                    endDate: new Date(p.end_date)
                },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );
        }
        console.log("Projects seeded.");

        process.exit(0);
    } catch (error) {
        console.error("Error seeding:", error);
        process.exit(1);
    }
}

seed();

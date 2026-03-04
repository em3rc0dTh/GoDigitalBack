import { getSystemDB } from "../config/tenantDb";
import getFormSchemaModel from "../models/system/FormSchema";

async function seedExamples() {
    console.log("🌱 Seeding Form Schema Examples...");

    try {
        await getSystemDB();
        const FormSchema = await getFormSchemaModel();

        // 1. ENTITY SCHEMA (Replaces Provider)
        const entitySchema = {
            name: "entity_form",
            description: "Form to register a new Entity (Provider, Supplier, Vendor, etc.)",
            schema: {
                type: "object",
                title: "Register New Entity",
                required: ["name", "legal_class", "contact"],
                properties: {
                    name: { type: "string", title: "Entity Name" },
                    legal_class: {
                        type: "string",
                        title: "Legal Class",
                        enum: ["legal-entity", "natural-entity"],
                        default: "legal-entity"
                    },
                    entity_classes: {
                        type: "array",
                        title: "Entity Classes",
                        items: {
                            type: "string",
                            enum: ["vendor", "investor", "colaborator", "provider", "supplier"]
                        },
                        uniqueItems: true
                    },
                    business_type: { type: "string", title: "Business Type" },
                    vendor_type: {
                        type: "string",
                        title: "Vendor Type",
                        enum: ["provider", "supplier"]
                    },
                    identifiers: {
                        type: "object",
                        title: "Identifiers",
                        properties: {
                            tax_id: { type: "string", title: "Tax ID" },
                            national_id: { type: "string", title: "National ID" },
                            registration_number: { type: "string", title: "Registration Number" }
                        }
                    },
                    contact: {
                        type: "object",
                        title: "Contact Information",
                        properties: {
                            email: { type: "string", title: "Email", format: "email" },
                            phone: { type: "string", title: "Phone" },
                            address: { type: "string", title: "Address" }
                        }
                    }
                }
            },
            uiSchema: {
                legal_class: { "ui:widget": "radio" },
                entity_classes: { "ui:widget": "checkboxes" },
                vendor_type: { "ui:widget": "radio" },
                contact: {
                    address: { "ui:widget": "textarea" }
                }
            }
        };

        // 2. PURCHASE ORDER SCHEMA
        const poSchema = {
            name: "purchase_order_form",
            description: "Form to create a new Purchase Order",
            schema: {
                type: "object",
                title: "New Purchase Order",
                required: ["provider_id", "items", "totalAmount"],
                properties: {
                    provider_id: {
                        type: "string",
                        title: "Select Entity (Provider)"
                    },
                    project_id: {
                        type: "string",
                        title: "Project"
                    },
                    poNumber: { type: "string", title: "PO Number" },
                    issueDate: { type: "string", title: "Issue Date", format: "date" },
                    expectedDeliveryDate: { type: "string", title: "Expected Delivery", format: "date" },
                    currency: {
                        type: "string",
                        title: "Currency",
                        enum: ["USD", "EUR", "COP", "MXN"],
                        default: "USD"
                    },
                    items: {
                        type: "array",
                        title: "Items",
                        minItems: 1,
                        items: {
                            type: "object",
                            required: ["description", "quantity", "unitPrice", "total"],
                            properties: {
                                description: { type: "string", title: "Description" },
                                quantity: { type: "number", title: "Quantity", minimum: 1 },
                                unitPrice: { type: "number", title: "Unit Price", minimum: 0 },
                                total: { type: "number", title: "Total", readOnly: true }
                            }
                        }
                    },
                    totalAmount: { type: "number", title: "Total Amount", readOnly: true }
                }
            },
            uiSchema: {
                provider_id: {
                    "ui:widget": "select",
                    "ui:placeholder": "Search provider...",
                    "ui:options": {
                        "apiSource": "/api/entities?vendor_type=provider", // Filter by vendor_type
                        "labelField": "name",
                        "valueField": "_id"
                    }
                },
                project_id: {
                    "ui:widget": "select",
                    "ui:placeholder": "Select project...",
                    "ui:options": {
                        "apiSource": "/api/projects",
                        "labelField": "name",
                        "valueField": "_id"
                    }
                },
                items: {
                    items: {
                        quantity: { "ui:widget": "updown" }
                    }
                }
            }
        };

        // 3. PAYMENT REQUEST SCHEMA
        const paymentRequestSchema = {
            name: "payment_request",
            description: "Form to create a new Payment Request",
            schema: {
                type: "object",
                title: "New Payment Request",
                required: [
                    "userIdCreator",
                    "beneficiary",
                    "project",
                    "date",
                    "deadlineGet",
                    "amount",
                    "tax",
                    "total_amount",
                    "currency",
                    "items"
                ],
                properties: {
                    userIdCreator: { type: "string", title: "Created by" },
                    beneficiary: { type: "string", title: "Beneficiary" },
                    project: { type: "string", title: "Select your project" },
                    date: { type: "string", title: "Issue Date", format: "date" },
                    deadlineGet: { type: "string", title: "Deadline", format: "date" },
                    amount: { type: "number", title: "Amount", minimum: 0 },
                    tax: { type: "number", title: "Tax", minimum: 0 },
                    total_amount: { type: "number", title: "Total Amount", minimum: 0 },
                    currency: {
                        type: "string",
                        title: "Currency",
                        enum: ["USD", "EUR", "COP", "MXN"],
                        default: "USD"
                    },
                    notes: { type: "string", title: "Notes" },
                    items: {
                        type: "array",
                        title: "Order Items",
                        minItems: 1,
                        items: {
                            type: "object",
                            required: ["description", "quantity", "unitPrice"],
                            properties: {
                                description: { type: "string", title: "Description" },
                                quantity: { type: "number", title: "Quantity", minimum: 1 },
                                unitPrice: { type: "number", title: "Unit Price", minimum: 0 }
                            }
                        }
                    },
                    quotationFile: { type: ["string", "null"], title: "Quotation" },
                    purchaseOrderFile: { type: ["string", "null"], title: "Purchase Order" }
                }
            },
            uiSchema: {
                beneficiary: {
                    "ui:widget": "select",
                    "ui:placeholder": "Search beneficiary...",
                    "ui:options": {
                        "apiSource": "/api/entities", // Changed to generic entities
                        "labelField": "name",
                        "valueField": "_id"
                    }
                },
                project: {
                    "ui:widget": "select",
                    "ui:placeholder": "Search project...",
                    "ui:options": {
                        "apiSource": "/api/projects",
                        "labelField": "name",
                        "valueField": "_id"
                    }
                },
                date: { "ui:widget": "date" },
                deadlineGet: { "ui:widget": "date" },
                currency: { "ui:widget": "select" },
                notes: { "ui:widget": "textarea" },
                items: {
                    "ui:options": { "orderable": true, "addable": true, "removable": true },
                    items: {
                        description: { "ui:widget": "text", "ui:placeholder": "Item name or service" },
                        quantity: { "ui:widget": "updown" },
                        unitPrice: {
                            "ui:widget": "text",
                            "ui:options": { "inputType": "number", "endAdornment": "{{currency}}" }
                        }
                    }
                }
            }
        };

        const schemas = [entitySchema, poSchema, paymentRequestSchema];

        for (const schema of schemas) {
            await FormSchema.findOneAndUpdate(
                { name: schema.name },
                schema,
                { upsert: true, new: true }
            );
            console.log(`✅ ${schema.name} Schema saved.`);
        }

    } catch (err) {
        console.error("❌ Seeding failed:", err);
        process.exit(1);
    }

    console.log("✨ Seeding Finished.");
    process.exit(0);
}

seedExamples();

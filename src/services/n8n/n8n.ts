import getTenantDetailModel from "../../models/system/TenantDetail";
import { getSystemDB, getTenantDB } from "../../config/tenantDb";
import mongoose from "mongoose";
import axios from "axios";
import FormData from "form-data";

export class N8NService {

    async readPaymentRequest(file: Express.Multer.File) {
        const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL || "https://thradextest.app.n8n.cloud/webhook-test/62e3c927-9c79-4a30-85be-e30e00759d99"; // Default or Env
        //https://em3rc0dth.app.n8n.cloud/webhook-test/812868fd-9812-4948-82b9-8013a59412d9

        try {
            const formData = new FormData();
            formData.append("file", file.buffer, {
                filename: file.originalname,
                contentType: file.mimetype,
            });

            console.log(`Sending file ${file.originalname} to N8N: ${n8nWebhookUrl}`);

            const response = await axios.post(n8nWebhookUrl, formData, {
                headers: {
                    ...formData.getHeaders(),
                },
            });

            console.log("N8N Response:", response.data);
            return response.data;
        } catch (error: any) {
            if (error.response) {
                console.error("N8N Error Status:", error.response.status);
                console.error("N8N Error Data:", error.response.data);
            }
            console.error("Error sending file to N8N:", error.message);
            throw new Error(`Failed to process payment request: ${error.message}`);
        }
    }

    async readCashRequestInvoice(file: Express.Multer.File) {
        const n8nWebhookUrl = process.env.N8N_WEBHOOK_READ_INVOICE;

        if (!n8nWebhookUrl) {
            throw new Error("N8N_WEBHOOK_READ_INVOICE environment variable is not defined");
        }

        try {
            const formData = new FormData();
            formData.append("file", file.buffer, {
                filename: file.originalname,
                contentType: file.mimetype,
            });

            console.log(`Sending Cash Request Invoice ${file.originalname} to N8N: ${n8nWebhookUrl}`);

            const response = await axios.post(n8nWebhookUrl, formData, {
                headers: {
                    ...formData.getHeaders(),
                },
            });

            console.log("N8N Cash Request Response:", response.data);
            return response.data;
        } catch (error: any) {
            if (error.response) {
                console.error("N8N Error Status:", error.response.status);
                console.error("N8N Error Data:", error.response.data);
            }
            console.error("Error sending file to N8N:", error.message);
            throw new Error(`Failed to process cash request invoice: ${error.message}`);
        }
    }

    async savePendantTicket(tenantDetailId: string, ticketId: string) {
        const TenantDetail = await getTenantDetailModel();

        // Try to find by _id if it's a valid ObjectId, otherwise try taxId
        let tenantDetail;
        if (mongoose.Types.ObjectId.isValid(tenantDetailId)) {
            tenantDetail = await TenantDetail.findOne({ _id: tenantDetailId });
        }

        if (!tenantDetail) {
            tenantDetail = await TenantDetail.findOne({ taxId: tenantDetailId });
        }

        console.log("Found tenantDetail:", tenantDetail ? tenantDetail._id : "null");

        if (!tenantDetail) {
            throw new Error(`TenantDetail not found for identifier: ${tenantDetailId}`);
        }

        const systemDB = await getSystemDB();
        console.log("Ticket id:", ticketId);
        const pendantTicket = await systemDB.collection("pending_tickets").findOne({
            _id: new mongoose.Types.ObjectId(ticketId)
        });

        if (!pendantTicket) {
            console.log(`Ticket ${ticketId} not found in pending_tickets`);
            return;
        }

        const tenantDB = await getTenantDB(tenantDetail.tenantId.toString(), tenantDetail._id.toString());

        // Remove _id to avoid collision or let mongo generate a new one for the tenant DB
        const { _id, ...ticketData } = pendantTicket;

        const result = await tenantDB.collection("pending_tickets").insertOne(ticketData);

        const projects = await tenantDB.collection("Projects").find({}).toArray();
        console.log("Projects:", projects);

        await systemDB.collection("pending_tickets").deleteOne({ _id: pendantTicket._id });

        return {
            _id: result.insertedId,
            projects: projects.map((project: any) => {
                return {
                    _id: project._id,
                    name: project.name,
                }
            })
        };
    }

    async processPendingProject(user: string, projectResult: string) {
        const systemDB = await getSystemDB();

        // Find the pending projects document for the user
        // Assuming we want the latest one or there's only one pending? 
        // For now, let's sort by createdAt desc to get the latest
        const pendingProjectsDoc = await systemDB.collection("pending_projects").findOne(
            { user: user, status: "pending" },
            { sort: { createdAt: -1 } }
        );

        if (!pendingProjectsDoc) {
            throw new Error(`No pending projects found for user: ${user}`);
        }

        const projectIndex = parseInt(projectResult) - 1;
        const projects = pendingProjectsDoc.projects;

        if (!projects || !projects[projectIndex]) {
            throw new Error(`Project number ${projectResult} not found in pending list`);
        }

        const projectToProcess = projects[projectIndex];
        const tenantDetailId = pendingProjectsDoc.tenantDetailId;

        // Connect to TenantDB
        const TenantDetail = await getTenantDetailModel();
        const tenantDetail = await TenantDetail.findOne({ _id: tenantDetailId });

        if (!tenantDetail) {
            throw new Error(`TenantDetail ${tenantDetailId} not found`);
        }

        const tenantDB = await getTenantDB(tenantDetail.tenantId.toString(), tenantDetail._id.toString());

        // Save to pending_tickets in TenantDB
        // We might want to transform the structure or save as is. 
        // Based on "ticket", maybe it needs a 'ticketId' or similar, but for now passing the project data.
        const ticketData = {
            ...projectToProcess,
            originalPendingProjectId: pendingProjectsDoc._id,
            processedAt: new Date()
        };

        const result = await tenantDB.collection("pending_tickets").insertOne(ticketData);

        // Remove the processed project from the pendingProjectsDoc
        const updatedProjects = projects.filter((_: any, index: number) => index !== projectIndex);

        if (updatedProjects.length === 0) {
            // If no more projects, delete the whole document
            await systemDB.collection("pending_projects").deleteOne({ _id: pendingProjectsDoc._id });
        } else {
            // Otherwise update with the remaining projects
            await systemDB.collection("pending_projects").updateOne(
                { _id: pendingProjectsDoc._id },
                { $set: { projects: updatedProjects } }
            );
        }

        return {
            success: true,
            message: `Project '${projectToProcess.name}' moved to pending_tickets`,
            ticketId: result.insertedId,
            remainingProjects: updatedProjects.length
        };
    }

    async saveProjects(tenantDetailId: string, projects: any[], user: string) {
        // Validate tenant exists (optional but good practice)
        const TenantDetail = await getTenantDetailModel();
        let tenantDetail;
        if (mongoose.Types.ObjectId.isValid(tenantDetailId)) {
            tenantDetail = await TenantDetail.findOne({ _id: tenantDetailId });
        } else {
            tenantDetail = await TenantDetail.findOne({ taxId: tenantDetailId });
        }

        if (!tenantDetail) {
            throw new Error(`TenantDetail not found for identifier: ${tenantDetailId}`);
        }

        const systemDB = await getSystemDB();

        const pendingProjectsDoc = {
            tenantDetailId: tenantDetail._id, // Use the resolved _id
            user: user,
            projects: projects,
            status: "pending",
            createdAt: new Date(),
            updatedAt: new Date()
        };

        const result = await systemDB.collection("pending_projects").insertOne(pendingProjectsDoc);

        return {
            _id: result.insertedId,
            message: "Projects saved to pending_projects in SystemDB"
        };
    }

}

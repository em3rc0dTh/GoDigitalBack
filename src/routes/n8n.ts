import { Router } from "express";
import { N8NService } from "../services/n8n/n8n";
import console from "console";
import multer from "multer";

const router = Router();
const n8nService = new N8NService();

// Configure multer for memory storage
const upload = multer({ storage: multer.memoryStorage() });

router.get("/", (req, res) => {
    res.send("N8N");
});

router.post("/read_payment_request", upload.array("files"), async (req, res) => {
    try {
        const files = req.files as Express.Multer.File[];
        const file = files && files.length > 0 ? files[0] : null;

        console.log("Processing payment request file:", file ? file.originalname : "No file");

        if (!file) {
            res.status(400).send("No file uploaded");
            return;
        }

        const result = await n8nService.readPaymentRequest(file);
        res.status(200).json(result);
    } catch (error: any) {
        console.error("Error in /read_payment_request:", error);
        res.status(500).send(error.message || "Internal Server Error");
    }
});

router.post("/pendant_ticket", async (req, res) => {
    try {
        const { tenantDetailId, ticketId } = req.body;
        console.log("Processing ticket:", { tenantDetailId, ticketId });

        if (!tenantDetailId || !ticketId) {
            res.status(400).send("Missing parameters");
            return;
        }

        const result = await n8nService.savePendantTicket(tenantDetailId, ticketId);
        res.status(200).json({ success: true, id: result });
    } catch (error: any) {
        console.error("Error in /pendant_ticket:", error);
        res.status(500).send(error.message || "Internal Server Error");
    }
});

router.post("/save_projects", async (req, res) => {
    try {
        const { tenantDetailId, projectNumbers, user } = req.body;
        console.log("Processing projects:", { tenantDetailId, projectNumbers, user });

        if (!tenantDetailId || !projectNumbers) {
            res.status(400).send("Missing parameters");
            return;
        }

        const projectLines = projectNumbers.split('\n');
        const projectsToSave = [];

        for (const line of projectLines) {
            const match = line.match(/^\d+\.\s+(.+)$/);
            if (match) {
                projectsToSave.push({
                    name: match[1].trim(),
                    user: user || null,
                    createdAt: new Date(),
                    updatedAt: new Date()
                });
            }
        }

        if (projectsToSave.length === 0) {
            res.status(400).send("No valid projects found in the list");
            return;
        }

        const result = await n8nService.saveProjects(tenantDetailId, projectsToSave, user);
        res.status(200).json({ success: true, ...result });

    } catch (error: any) {
        console.error("Error in /save_projects:", error);
        res.status(500).send(error.message || "Internal Server Error");
    }
});

router.post("/pendant_projects", async (req, res) => {
    try {
        const { user, project } = req.body;
        console.log("Processing project selection:", { user, project });

        if (!user || !project) {
            res.status(400).send("Missing parameters: user and project are required");
            return;
        }

        const result = await n8nService.processPendingProject(user, project);
        res.status(200).json(result);
    } catch (error: any) {
        console.error("Error in /pendant_projects:", error);
        res.status(500).send(error.message || "Internal Server Error");
    }
});

export default router;

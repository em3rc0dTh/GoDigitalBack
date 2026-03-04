
import { Request, Response } from "express";
import { statementService } from "../services/statement";
import multer from "multer";

// Configure Multer (Memory Storage)
const storage = multer.memoryStorage();
export const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

export const uploadStatement = async (req: Request, res: Response) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        const { entityId } = req.body;
        if (!entityId) {
            return res.status(400).json({ error: "entityId is required" });
        }

        // Validate PDF type
        if (req.file.mimetype !== 'application/pdf') {
            return res.status(400).json({ error: "Only PDF files are allowed" });
        }

        if (!req.tenantId) {
            return res.status(401).json({ error: "Tenant context required" });
        }

        const { transactions, isDuplicate } = await statementService.processPdfStatement(
            req.file.buffer,
            req.file.originalname,
            entityId,
            req.tenantId
        );

        return res.json({
            success: true,
            message: isDuplicate
                ? "This file was processed before. Returning existing transactions."
                : "Statement processed successfully",
            count: transactions.length,
            fileId: transactions.length > 0 ? transactions[0].fileId : null,
            transactions: transactions
        });

    } catch (err: any) {
        console.error("Statement upload error:", err);
        return res.status(500).json({
            error: "Failed to process statement",
            details: err.message
        });
    }
};

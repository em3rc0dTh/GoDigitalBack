
import { Request, Response } from "express";
import { statementService } from "../services/statement";
import { getTransactionRawPDFModel } from "../models/tenant/TransactionRawPDF";
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

/**
 * List all processed statements (merged by fileId)
 * GET /api/statements
 */
export const getStatements = async (req: Request, res: Response) => {
    try {
        const { tenantId, tenantDetailId } = req;
        if (!tenantId || !tenantDetailId) {
            return res.status(401).json({ error: "Tenant context required" });
        }

        const TransactionRawPDF = await getTransactionRawPDFModel(tenantId, tenantDetailId);

        // Aggregate by fileId to get unique statements
        // TransactionRawPDF uses 'Transaction_Raw_C_PDF' collection which is tenant detail specific
        const statements = await TransactionRawPDF.aggregate([
            {
                $group: {
                    _id: "$fileId",
                    fileName: { $first: "$fileName" },
                    createdAt: { $first: "$createdAt" },
                    transactionCount: { $sum: 1 },
                    bank: { $first: "$routing.bank" },
                    accountNumber: { $first: "$routing.accountNumber" }
                }
            },
            { $sort: { createdAt: -1 } }
        ]);

        return res.json({ success: true, count: statements.length, statements });
    } catch (err: any) {
        console.error("Get statements error:", err);
        return res.status(500).json({ error: "Failed to fetch statements", details: err.message });
    }
};

/**
 * Get all transactions for a specific statement (fileId)
 * GET /api/statements/:fileId
 */
export const getStatementTransactions = async (req: Request, res: Response) => {
    try {
        const { tenantId, tenantDetailId } = req;
        const { fileId } = req.params;

        if (!tenantId || !tenantDetailId) {
            return res.status(401).json({ error: "Tenant context required" });
        }

        const TransactionRawPDF = await getTransactionRawPDFModel(tenantId, tenantDetailId);
        const transactions = await TransactionRawPDF.find({ fileId }).sort({ operation_date: 1 });

        return res.json({ 
            success: true, 
            count: transactions.length,
            transactions 
        });
    } catch (err: any) {
        console.error("Get statement transactions error:", err);
        return res.status(500).json({ error: "Failed to fetch transactions", details: err.message });
    }
};

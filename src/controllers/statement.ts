
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

import { getStatementUploadTaskModel } from "../models/tenant/StatementUploadTask";

export const uploadStatement = async (req: Request, res: Response) => {
    try {
        const files = req.files as Express.Multer.File[];
        if (!files || files.length === 0) {
            return res.status(400).json({ error: "No files uploaded" });
        }

        const { entityId } = req.body;
        if (!entityId) {
            return res.status(400).json({ error: "entityId is required" });
        }

        if (!req.tenantId) {
            return res.status(401).json({ error: "Tenant context required" });
        }

        const tenantId = req.tenantId;

        // Obtain the queue model
        const StatementUploadTask = await getStatementUploadTaskModel(tenantId, entityId);

        // Prepare the queue items
        const taskDocs = files.filter(f => f.mimetype === 'application/pdf').map(file => ({
            tenantId,
            entityId,
            fileName: file.originalname,
            fileBuffer: file.buffer,
            status: 'pending' as const
        }));

        if (taskDocs.length === 0) {
            return res.status(400).json({ error: "No valid PDF files found in upload" });
        }

        // Insert into database queue
        await StatementUploadTask.insertMany(taskDocs);

        return res.json({
            success: true,
            message: "Statements successfully uploaded and queued for background processing."
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
                    _id: { fileId: "$fileId", accountNumber: "$routing.accountNumber" },
                    fileId: { $first: "$fileId" },
                    fileName: { $first: "$fileName" },
                    createdAt: { $first: "$createdAt" },
                    transactionCount: { $sum: 1 },
                    bank: { $first: "$routing.bank" },
                    accountNumber: { $first: "$routing.accountNumber" }
                }
            },
            {
                $project: {
                    _id: "$fileId", // Keep _id as fileId for backward compatibility in the frontend
                    fileId: 1,
                    fileName: 1,
                    createdAt: 1,
                    transactionCount: 1,
                    bank: 1,
                    accountNumber: 1
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
        const { accountNumber } = req.query;

        if (!tenantId || !tenantDetailId) {
            return res.status(401).json({ error: "Tenant context required" });
        }

        const TransactionRawPDF = await getTransactionRawPDFModel(tenantId, tenantDetailId);
        
        const filter: any = { fileId };
        if (accountNumber) {
            filter['routing.accountNumber'] = accountNumber;
        }

        const transactions = await TransactionRawPDF.find(filter).sort({ operation_date: 1 });

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

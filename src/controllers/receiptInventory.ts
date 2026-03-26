import { Request, Response } from "express";
import mongoose from "mongoose";
import { getReceiptInventoryModel } from "../models/tenant/ReceiptInventory";
import { receiptStorage } from "../services/storage/receiptStorage";
import { N8NService } from "../services/n8n/n8n";
import getUserModel from "../models/system/User";

const n8nService = new N8NService();

export const uploadReceipt = async (req: Request, res: Response) => {
    try {
        const { source, type, source_id } = req.body;
        const file = req.file;

        if (!req.tenantDB) return res.status(500).json({ error: "Tenant connection not available" });
        if (!file) return res.status(400).json({ error: "No file provided" });
        if (!source || !type) return res.status(400).json({ error: "Source and type are required" });

        // 1. Get Employee Info
        const User = await getUserModel();
        const currentUser = await User.findById(req.userId);
        if (!currentUser) return res.status(404).json({ error: "User not found" });

        const employeeName = currentUser.name || "unknown_employee";

        // 2. Save File in Hierarchy
        const storageResult = await receiptStorage.saveFile(
            file.buffer,
            file.originalname,
            employeeName,
            source,
            type
        );

        // 3. Analyze with N8N
        let aiResult: any = null;
        try {
            aiResult = await n8nService.analyzeDocument(file, source, type);
        } catch (aiErr) {
            console.warn("⚠️ AI Analysis failed, but file was saved:", aiErr);
        }

        // 4. Save to ReceiptInventory Collection
        const ReceiptInventory = getReceiptInventoryModel(req.tenantDB);
        
        // Maintain Base64 compatibility as requested
        const base64Url = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;

        const inventoryDoc = await new ReceiptInventory({
            user_id: currentUser._id,
            user_name: employeeName,
            source,
            source_id: source_id ? new mongoose.Types.ObjectId(source_id) : undefined,
            type,
            period: storageResult.period,
            fileName: storageResult.fileName,
            filePath: storageResult.relativePath,
            mimeType: file.mimetype,
            size: file.size,
            base64Url,
            extracted_data: aiResult,
            ai_raw_data: aiResult,
            status: aiResult ? 'processed' : 'failed'
        }).save();

        return res.status(201).json({
            message: "Receipt inventoried successfully",
            inventoryId: inventoryDoc._id,
            filePath: storageResult.relativePath,
            analysis: aiResult
        });

    } catch (err: any) {
        console.error("Error in uploadReceipt:", err);
        return res.status(500).json({ error: err.message || "Internal error in receipt inventory" });
    }
};

/**
 * List inventoried receipts
 */
export const getReceipts = async (req: Request, res: Response) => {
    try {
        if (!req.tenantDB) return res.status(500).json({ error: "Tenant connection not available" });
        const ReceiptInventory = getReceiptInventoryModel(req.tenantDB);

        const filter: any = {};
        if (req.query.source) filter.source = req.query.source;
        if (req.query.type) filter.type = req.query.type;
        if (req.query.user_id) filter.user_id = req.query.user_id;

        const docs = await ReceiptInventory.find(filter).sort({ createdAt: -1 });
        return res.json(docs);
    } catch (err: any) {
        return res.status(500).json({ error: "Error listing receipts" });
    }
};

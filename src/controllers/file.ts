import { Request, Response } from "express";
import { getTenantFileModel } from "../models/tenant/TenantFile";
import mongoose from "mongoose";

export const uploadFile = async (req: Request, res: Response) => {
    try {
        if (!req.tenantDB) return res.status(500).json({ error: "Tenant DB not available" });
        const FileModel = getTenantFileModel(req.tenantDB);

        const { fileName, mimeType, size, base64Url } = req.body;
        if (!fileName || !mimeType || !base64Url) {
            return res.status(400).json({ error: "Missing file information" });
        }

        const doc = await new FileModel({
            fileName,
            mimeType,
            size,
            base64Url
        }).save();

        return res.status(201).json({
            id: doc._id.toString(),
            url: `/api/files/${doc._id}`
        });
    } catch (err: any) {
        console.error("POST /files error:", err);
        return res.status(500).json({ error: "Error uploading file" });
    }
};

export const downloadFile = async (req: Request, res: Response) => {
    try {
        if (!req.tenantDB) return res.status(500).json({ error: "Tenant DB not available" });
        const FileModel = getTenantFileModel(req.tenantDB);

        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid ID" });

        const doc = await FileModel.findById(id);
        
        let targetDoc = doc;
        if (!targetDoc) {
            // Check ReceiptInventory if not found in Files
            const { getReceiptInventoryModel } = await import("../models/tenant/ReceiptInventory");
            const ReceiptModel = getReceiptInventoryModel(req.tenantDB);
            targetDoc = await ReceiptModel.findById(id) as any;
        }

        if (!targetDoc) return res.status(404).json({ error: "File not found" });

        // the base64Url looks like data:image/png;base64,iVBOR...
        const matches = targetDoc.base64Url?.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        
        if (matches && matches.length === 3) {
            const buffer = Buffer.from(matches[2], 'base64');
            res.setHeader('Content-Type', matches[1]);
            res.setHeader('Content-Disposition', `inline; filename="${targetDoc.fileName}"`);
            return res.send(buffer);
        }

        // fallback if it's just a raw url
        if (targetDoc && targetDoc.base64Url) {
            return res.redirect(targetDoc.base64Url);
        }
        
        return res.status(404).json({ error: "File source not found" });
    } catch (err: any) {
        console.error("GET /files/:id error:", err);
        return res.status(500).json({ error: "Error downloading file" });
    }
};

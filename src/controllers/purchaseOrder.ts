import { Request, Response } from "express";
import mongoose from "mongoose";
import { getPurchaseOrderModel } from "../models/tenant/PurchaseOrder";
import { getProjectModel } from "../models/tenant/Project";
import { getEntityModel } from "../models/tenant/Entity";
import getUserModel from "../models/system/User";
import { sendEmail } from "../services/email";

export const getPurchaseOrders = async (req: Request, res: Response) => {
    try {
        if (!req.tenantDB) {
            return res.status(500).json({ error: "Tenant connection not available" });
        }

        const PurchaseOrder = getPurchaseOrderModel(req.tenantDB);

        const filter: any = {};
        if (req.query.status) {
            filter.status = req.query.status;
        }
        if (req.query.provider_id) {
            filter.provider_id = req.query.provider_id;
        }

        const docs = await PurchaseOrder.find(filter)
            .populate('provider_id', 'name')
            .populate('project_id', 'name')
            .sort({ createdAt: -1 })
            .lean();

        const normalized = docs.map((d: any) => ({
            ...d,
            _id: d._id.toString()
        }));

        return res.json(normalized);
    } catch (err) {
        console.error("GET /purchase-orders error:", err);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};

export const createPurchaseOrder = async (req: Request, res: Response) => {
    try {
        if (!req.tenantDB) {
            return res.status(500).json({ error: "Tenant connection not available" });
        }

        const PurchaseOrder = getPurchaseOrderModel(req.tenantDB);
        const data = req.body;

        // Assign created_by if authenticated
        if (req.userId) {
            data.created_by = req.userId;
        }

        if (data.provider_id && !mongoose.Types.ObjectId.isValid(data.provider_id)) {
            const Entity = getEntityModel(req.tenantDB);
            const provider = await Entity.findOne({ name: new RegExp('^' + data.provider_id + '$', 'i') });
            if (provider) {
                data.provider_id = provider._id;
            } else {
                return res.status(404).json({ error: "Provider not found with that name" });
            }
        }

        const newPO = new PurchaseOrder(data);
        const doc = await newPO.save();

        // Send notifications
        try {
            // Only send if there is a project_id or created_by
            if (doc.project_id || doc.created_by) {
                const Project = getProjectModel(req.tenantDB);
                const User = await getUserModel();

                // Fetch Project
                const project = doc.project_id ? await Project.findById(doc.project_id) : null;

                const recipients = new Set<string>();
                const emailsToSend: { email: string, name: string }[] = [];

                // 1. Creator
                if (doc.created_by) {
                    const creator = await User.findById(doc.created_by);
                    if (creator && creator.email) {
                        if (!recipients.has(creator.email)) {
                            recipients.add(creator.email);
                            emailsToSend.push({ email: creator.email, name: creator.name });
                        }
                    }
                }

                // 2. Project Owner
                if (project && project.projectOwner) {
                    const owner = await User.findById(project.projectOwner);
                    if (owner && owner.email) {
                        if (!recipients.has(owner.email)) {
                            recipients.add(owner.email);
                            emailsToSend.push({ email: owner.email, name: owner.name });
                        }
                    }
                }

                // Send emails
                for (const recipient of emailsToSend) {
                    await sendEmail(
                        recipient.email,
                        `Purchase Order Created - ${project?.name || 'GoDigital'}`,
                        `
                        <div style="font-family: Arial, sans-serif; padding: 20px;">
                            <h2>New Purchase Order Created</h2>
                            <p>Hello ${recipient.name},</p>
                            <p>A new purchase order has been created.</p>
                            
                            <table style="border-collapse: collapse; width: 100%; max-width: 600px;">
                                <tr style="border-bottom: 1px solid #eee;">
                                    <td style="padding: 10px; font-weight: bold;">PO Number:</td>
                                    <td style="padding: 10px;">${doc.poNumber || 'N/A'}</td>
                                </tr>
                                <tr style="border-bottom: 1px solid #eee;">
                                    <td style="padding: 10px; font-weight: bold;">Project:</td>
                                    <td style="padding: 10px;">${project?.name || 'N/A'}</td>
                                </tr>
                                <tr style="border-bottom: 1px solid #eee;">
                                    <td style="padding: 10px; font-weight: bold;">Total Amount:</td>
                                    <td style="padding: 10px;">${doc.totalAmount.toLocaleString()} ${doc.currency}</td>
                                </tr>
                                <tr style="border-bottom: 1px solid #eee;">
                                    <td style="padding: 10px; font-weight: bold;">Status:</td>
                                    <td style="padding: 10px;">${doc.status}</td>
                                </tr>
                            </table>

                            <p style="margin-top: 20px;">
                                <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/purchase-order?id=${doc._id}" 
                                   style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
                                    View Purchase Order
                                </a>
                            </p>
                        </div>
                        `
                    );
                    console.log(`✅ PO Notification sent to ${recipient.email}`);
                }
            }

        } catch (notifyErr) {
            console.error("⚠️ Error sending purchase order notifications:", notifyErr);
            // Don't fail the request
        }

        return res.status(201).json(doc);
    } catch (err) {
        console.error("POST /purchase-orders error:", err);
        return res.status(500).json({ error: "Error saving purchase order" });
    }
};

export const getPurchaseOrderById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: "Invalid purchase order ID" });
        }

        if (!req.tenantDB) {
            return res.status(500).json({ error: "Tenant connection not available" });
        }

        const PurchaseOrder = getPurchaseOrderModel(req.tenantDB);
        const doc = await PurchaseOrder.findById(id)
            .populate('provider_id', 'name')
            .populate('project_id', 'name')
            .lean();

        if (!doc) {
            return res.status(404).json({ error: "Purchase order not found" });
        }

        return res.json({
            ...doc,
            _id: doc._id.toString()
        });
    } catch (err) {
        console.error("GET /purchase-orders/:id error:", err);
        return res.status(500).json({ error: "Error getting purchase order" });
    }
};

export const updatePurchaseOrder = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: "Invalid purchase order ID" });
        }

        if (!req.tenantDB) {
            return res.status(500).json({ error: "Tenant connection not available" });
        }

        const PurchaseOrder = getPurchaseOrderModel(req.tenantDB);
        const data = req.body;

        if (data.provider_id && !mongoose.Types.ObjectId.isValid(data.provider_id)) {
            const Entity = getEntityModel(req.tenantDB);
            const provider = await Entity.findOne({ name: new RegExp('^' + data.provider_id + '$', 'i') });
            if (provider) {
                data.provider_id = provider._id;
            } else {
                return res.status(404).json({ error: "Provider not found with that name" });
            }
        }

        const updated = await PurchaseOrder.findByIdAndUpdate(
            id,
            { $set: data },
            { new: true, runValidators: true }
        );

        if (!updated) {
            return res.status(404).json({ error: "Purchase order not found" });
        }

        return res.json(updated);
    } catch (err) {
        console.error("PUT /purchase-orders/:id error:", err);
        return res.status(500).json({ error: "Error updating purchase order" });
    }
};

export const deletePurchaseOrder = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: "Invalid purchase order ID" });
        }

        if (!req.tenantDB) {
            return res.status(500).json({ error: "Tenant connection not available" });
        }

        const PurchaseOrder = getPurchaseOrderModel(req.tenantDB);

        const deleted = await PurchaseOrder.findByIdAndDelete(id);
        if (!deleted) {
            return res.status(404).json({ error: "Purchase order not found" });
        }

        return res.json({ ok: true, message: "Purchase order deleted successfully" });
    } catch (err) {
        console.error("DELETE /purchase-orders/:id error:", err);
        return res.status(500).json({ error: "Error deleting purchase order" });
    }
};

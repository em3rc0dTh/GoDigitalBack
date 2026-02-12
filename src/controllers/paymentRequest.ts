import { Request, Response } from "express";
import mongoose from "mongoose";
import { getPaymentRequestModel } from "../models/tenant/PaymentRequest";
import { getProjectModel } from "../models/tenant/Project";
import { getEntityModel } from "../models/tenant/Entity";
import getUserModel from "../models/system/User";
import { sendEmail } from "../services/email";

export const getPaymentRequests = async (req: Request, res: Response) => {
    try {
        if (!req.tenantDB) {
            return res.status(500).json({ error: "Tenant connection not available" });
        }

        // Initialize models to ensure they are registered for populate
        getEntityModel(req.tenantDB);

        const PaymentRequest = getPaymentRequestModel(req.tenantDB);

        const filter: any = {};
        if (req.query.status) {
            filter.status = req.query.status;
        }

        const docs = await PaymentRequest.find(filter)
            .populate('purchase_order_id')
            .populate('provider_id', 'name')
            .sort({ createdAt: -1 })
            .lean();

        const normalized = docs.map((d: any) => ({
            ...d,
            _id: d._id.toString()
        }));

        return res.json(normalized);
    } catch (err) {
        console.error("GET /payment-requests error:", err);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};

export const createPaymentRequest = async (req: Request, res: Response) => {
    try {
        if (!req.tenantDB) {
            return res.status(500).json({ error: "Tenant connection not available" });
        }

        const PaymentRequest = getPaymentRequestModel(req.tenantDB);
        const data = req.body;

        // Assign created_by if authenticated
        if (req.userId) {
            data.created_by = req.userId;
        }

        const newPR = new PaymentRequest(data);
        const doc = await newPR.save();

        // Send notifications
        try {
            const Project = getProjectModel(req.tenantDB);
            const User = await getUserModel();

            // Fetch Project & Provider
            const project = await Project.findById(doc.project_id);

            const Entity = getEntityModel(req.tenantDB);
            const provider = await Entity.findById(doc.provider_id);

            // 1. Send to Creator (Confirmation)
            if (doc.created_by) {
                const creator = await User.findById(doc.created_by);
                if (creator && creator.email) {
                    await sendEmail(
                        creator.email,
                        `Payment Request Submitted - ${project?.name || 'GoDigital'}`,
                        `
                        <div style="font-family: Arial, sans-serif; padding: 20px;">
                            <h2>New Payment Request Submitted</h2>
                            <p>Hello ${creator.name},</p>
                            <p>You have successfully submitted a new payment request.</p>
                            ${generateEmailTable(doc, project, provider)}
                            ${generateEmailButton(doc, '')}
                        </div>
                        `
                    );
                    console.log(`✅ Notification sent to Creator: ${creator.email}`);
                }
            }

            // 2. Send to Project Owner (Action Required)
            if (project && project.projectOwner) {
                // Avoid sending duplicate if owner is creator
                if (!doc.created_by || project.projectOwner.toString() !== doc.created_by.toString()) {
                    const owner = await User.findById(project.projectOwner);
                    if (owner && owner.email) {
                        await sendEmail(
                            owner.email,
                            `Action Required: Authorize Payment Request - ${project?.name || 'GoDigital'}`,
                            `
                            <div style="font-family: Arial, sans-serif; padding: 20px;">
                                <h2>New Payment Request to Authorize</h2>
                                <p>Hello ${owner.name},</p>
                                <p>You have a new payment request pending your authorization.</p>
                                ${generateEmailTable(doc, project, provider)}
                                ${generateEmailButton(doc, '/review')}
                            </div>
                            `
                        );
                        console.log(`✅ Notification sent to Project Owner: ${owner.email}`);
                    }
                }
            }

        } catch (notifyErr) {
            console.error("⚠️ Error sending payment request notifications:", notifyErr);
        }

        return res.status(201).json(doc);
    } catch (err) {
        console.error("POST /payment-requests error:", err);
        return res.status(500).json({ error: "Error saving payment request" });
    }
};

// Helper functions for email templates
function generateEmailTable(doc: any, project: any, provider: any) {
    return `
    <table style="border-collapse: collapse; width: 100%; max-width: 600px;">
        <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 10px; font-weight: bold;">Project:</td>
            <td style="padding: 10px;">${project?.name || 'N/A'}</td>
        </tr>
        <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 10px; font-weight: bold;">Provider:</td>
            <td style="padding: 10px;">${provider?.name || 'N/A'}</td>
        </tr>
        <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 10px; font-weight: bold;">Amount:</td>
            <td style="padding: 10px;">${doc.total.toLocaleString()} ${doc.currency}</td>
        </tr>
        <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 10px; font-weight: bold;">Status:</td>
            <td style="padding: 10px;">${doc.status}</td>
        </tr>
            <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 10px; font-weight: bold;">Description:</td>
            <td style="padding: 10px;">${doc.notes || 'No description'}</td>
        </tr>
    </table>
    `;
}

function generateEmailButton(doc: any, urlSuffix: string = '') {
    const actionText = urlSuffix === '/review' ? 'Review Payment Request' : 'View Payment Request';
    const backgroundColor = urlSuffix === '/review' ? '#28a745' : '#007bff'; // Green for review, Blue for view

    return `
    <p style="margin-top: 20px;">
        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-request/${doc._id}${urlSuffix}" 
            style="background-color: ${backgroundColor}; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
            ${actionText}
        </a>
    </p>
    `;
}

export const getPaymentRequestById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: "Invalid payment request ID" });
        }

        if (!req.tenantDB) {
            return res.status(500).json({ error: "Tenant connection not available" });
        }

        // Initialize models to ensure they are registered for populate
        getEntityModel(req.tenantDB);

        const PaymentRequest = getPaymentRequestModel(req.tenantDB);
        const doc = await PaymentRequest.findById(id)
            .populate('purchase_order_id')
            .populate('provider_id', 'name')
            .lean();

        if (!doc) {
            return res.status(404).json({ error: "Payment request not found" });
        }

        return res.json({
            ...doc,
            _id: doc._id.toString()
        });
    } catch (err) {
        console.error("GET /payment-requests/:id error:", err);
        return res.status(500).json({ error: "Error getting payment request" });
    }
};

export const updatePaymentRequest = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: "Invalid payment request ID" });
        }

        if (!req.tenantDB) {
            return res.status(500).json({ error: "Tenant connection not available" });
        }

        const PaymentRequest = getPaymentRequestModel(req.tenantDB);

        const updated = await PaymentRequest.findByIdAndUpdate(
            id,
            { $set: req.body },
            { new: true, runValidators: true }
        );

        if (!updated) {
            return res.status(404).json({ error: "Payment request not found" });
        }

        return res.json(updated);
    } catch (err) {
        console.error("PUT /payment-requests/:id error:", err);
        return res.status(500).json({ error: "Error updating payment request" });
    }
};

export const deletePaymentRequest = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: "Invalid payment request ID" });
        }

        if (!req.tenantDB) {
            return res.status(500).json({ error: "Tenant connection not available" });
        }

        const PaymentRequest = getPaymentRequestModel(req.tenantDB);

        const deleted = await PaymentRequest.findByIdAndDelete(id);
        if (!deleted) {
            return res.status(404).json({ error: "Payment request not found" });
        }

        return res.json({ ok: true, message: "Payment request deleted successfully" });
    } catch (err) {
        console.error("DELETE /payment-requests/:id error:", err);
        return res.status(500).json({ error: "Error deleting payment request" });
    }
};

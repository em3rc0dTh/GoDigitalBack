import { Request, Response } from "express";
import mongoose from "mongoose";
import { getPaymentRequestModel } from "../models/tenant/PaymentRequest";
import { getProjectModel } from "../models/tenant/Project";
import { getEntityModel } from "../models/tenant/Entity";
import { getBusinessUnitModel } from "../models/tenant/BusinessUnit";
import { getAccountModel } from "../models/tenant/Account";
import getUserModel from "../models/system/User";
import { sendEmail } from "../services/email";

export const getPaymentRequests = async (req: Request, res: Response) => {
    try {
        if (!req.tenantDB) {
            return res.status(500).json({ error: "Tenant connection not available" });
        }

        // Initialize models to ensure they are registered for populate
        getEntityModel(req.tenantDB);
        getAccountModel(req.tenantDB); // Register Bank_Account model
        getProjectModel(req.tenantDB);

        const PaymentRequest = getPaymentRequestModel(req.tenantDB);

        const filter: any = {};
        if (req.query.status) {
            filter.status = req.query.status;
        }
        if (req.query.mine === 'true' && req.userId) {
            filter.created_by = new mongoose.Types.ObjectId(req.userId);
        }

        const docs = await PaymentRequest.find(filter)
            .populate('purchase_order_id')
            .populate('provider_id', 'name')
            .populate('project_id', 'name') // Populate project name
            .populate('debited_bank_account', 'bank_name account_number currency')
            .sort({ createdAt: -1 })
            .lean();

        const normalized = docs.map((d: any) => ({
            ...d,
            _id: d._id.toString(),
            project: d.project_id?.name || 'N/A', // Map project name safely
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

            // 1. Send to Creator (Confirmation) OR Project Owner (Action Required)
            // If creator is also project owner, they should get the Action Required email instead of just confirmation.

            const isCreatorProjectOwner = doc.created_by && project?.projectOwner && doc.created_by.toString() === project.projectOwner.toString();

            if (doc.created_by && !isCreatorProjectOwner) {
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
                const owner = await User.findById(project.projectOwner);
                if (owner && owner.email) {
                    await sendEmail(
                        owner.email,
                        `Action Required: Approve Payment Request - ${project?.name || 'GoDigital'}`,
                        `
                        <div style="font-family: Arial, sans-serif; padding: 20px;">
                            <h2>New Payment Request to Approve</h2>
                            <p>Hello ${owner.name},</p>
                            ${isCreatorProjectOwner ? '<p>You created this request, but it still requires your formal approval.</p>' : '<p>You have a new payment request pending your approval.</p>'}
                            ${generateEmailTable(doc, project, provider)}
                            ${generateEmailButton(doc, '/review')}
                        </div>
                        `
                    );
                    console.log(`✅ Notification sent to Project Owner: ${owner.email}`);
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
        ${doc.status === 'rejected' && doc.rejection_reason ? `
        <tr style="border-bottom: 1px solid #eee; background-color: #fee;">
            <td style="padding: 10px; font-weight: bold; color: #dc3545;">Rejection Reason:</td>
            <td style="padding: 10px; color: #dc3545;">${doc.rejection_reason}</td>
        </tr>` : ''}
        ${doc.approval_notes ? `
        <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 10px; font-weight: bold;">Approval Notes:</td>
            <td style="padding: 10px;">${doc.approval_notes}</td>
        </tr>` : ''}
        ${doc.authorization_notes ? `
        <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 10px; font-weight: bold;">Authorization Notes:</td>
            <td style="padding: 10px;">${doc.authorization_notes}</td>
        </tr>` : ''}
        ${doc.payment_notes ? `
        <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 10px; font-weight: bold;">Payment Notes:</td>
            <td style="padding: 10px;">${doc.payment_notes}</td>
        </tr>` : ''}
        ${doc.payment_date ? `
        <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 10px; font-weight: bold;">Payment Date:</td>
            <td style="padding: 10px;">${new Date(doc.payment_date).toLocaleDateString()}</td>
        </tr>` : ''}
        ${doc.debited_bank_account && doc.debited_bank_account.bank_name ? `
        <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 10px; font-weight: bold;">Debited Account:</td>
            <td style="padding: 10px;">${doc.debited_bank_account.bank_name} - ${doc.debited_bank_account.account_number} (${doc.debited_bank_account.currency})</td>
        </tr>` : ''}
        <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 10px; font-weight: bold;">Description:</td>
            <td style="padding: 10px;">${doc.notes || 'No description'}</td>
        </tr>
    </table>
    `;
}

function generateEmailButton(doc: any, urlSuffix: string = '') {
    let actionText = 'View Payment Request';
    let backgroundColor = '#007bff'; // Default Blue

    if (urlSuffix === '/review') {
        actionText = 'Approve Payment Request';
        backgroundColor = '#28a745'; // Green
    } else if (urlSuffix === '/authorize') {
        actionText = 'Authorize Payment Request';
        backgroundColor = '#17a2b8'; // Teal
    } else if (urlSuffix === '/pay') {
        actionText = 'Attend Payment Request';
        backgroundColor = '#6f42c1'; // Purple
    }

    // Ensure frontend URL is properly formatted
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

    return `
    <p style="margin-top: 20px; text-align: center;">
        <a href="${cleanBaseUrl}/payment-request/${doc._id}${urlSuffix}" 
            style="display: inline-block; background-color: ${backgroundColor}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; font-family: Arial, sans-serif;">
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
        getAccountModel(req.tenantDB); // Register Bank_Account model
        const Project = getProjectModel(req.tenantDB);
        const User = await getUserModel();

        const PaymentRequest = getPaymentRequestModel(req.tenantDB);
        const doc = await PaymentRequest.findById(id)
            .populate('purchase_order_id')
            .populate('provider_id', 'name')
            .populate('debited_bank_account', 'bank_name account_number currency')
            .lean();

        if (!doc) {
            return res.status(404).json({ error: "Payment request not found" });
        }

        const project = await Project.findById(doc.project_id).lean();
        const created_by = doc.created_by ? await User.findById(doc.created_by).select('name email role').lean() : null;

        return res.json({
            ...doc,
            _id: doc._id.toString(),
            project: project,
            created_by: created_by
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

export const approvePaymentRequest = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.userId;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: "Invalid payment request ID" });
        }
        if (!req.tenantDB) {
            return res.status(500).json({ error: "Tenant connection not available" });
        }

        const PaymentRequest = getPaymentRequestModel(req.tenantDB);
        const Project = getProjectModel(req.tenantDB);
        const Entity = getEntityModel(req.tenantDB);
        const BusinessUnit = getBusinessUnitModel(req.tenantDB);
        const User = await getUserModel();

        const pr = await PaymentRequest.findById(id);
        if (!pr) return res.status(404).json({ error: "Payment request not found" });

        // Status Check
        if (pr.status !== 'pending') {
            return res.status(400).json({ error: "Payment request must be pending approval. Current status: " + pr.status });
        }

        const project = await Project.findById(pr.project_id);
        if (!project) return res.status(404).json({ error: "Project not found" });

        // Authorization Check: Must be Project Owner or Superadmin
        console.log(`[ApprovePR] User: ${userId}, ProjectOwner: ${project.projectOwner}`);

        // Skip check if user has 'superadmin' role (need to fetch user role from DB or token if available in req)
        const currentUser = await User.findById(userId);
        console.log(`[ApprovePR] CurrentUser Role: ${currentUser?.role}`);
        const isSuperAdmin = currentUser?.role === 'superadmin';

        if (!isSuperAdmin && (!project.projectOwner || project.projectOwner.toString() !== userId)) {
            return res.status(403).json({
                error: "Only the Project Owner can approve this request",
                debug: { userId, projectOwner: project.projectOwner }
            });
        }

        // Update Status
        pr.status = 'approved';
        pr.approved_by = new mongoose.Types.ObjectId(userId);
        if (req.body.notes) pr.approval_notes = req.body.notes;
        await pr.save();

        // Notifications
        try {
            const provider = await Entity.findById(pr.provider_id);
            const creator = pr.created_by ? await User.findById(pr.created_by) : null;
            const approver = await User.findById(userId);

            // Notify Creator
            if (creator && creator.email) {
                await sendEmail(
                    creator.email,
                    `Payment Request Approved - ${project.name}`,
                    `
                    <div style="font-family: Arial, sans-serif; padding: 20px;">
                        <h2>Payment Request Approved</h2>
                        <p>Hello ${creator.name},</p>
                        <p>Your payment request has been approved by the Project Owner (${approver?.name}). It is now pending authorization.</p>
                        ${generateEmailTable(pr, project, provider)}
                        ${generateEmailButton(pr, '')}
                    </div>
                    `
                );
            }

            // Notify Approver (Self)
            if (approver && approver.email) {
                await sendEmail(
                    approver.email,
                    `Payment Request Approved (Confirmation) - ${project.name}`,
                    `
                    <div style="font-family: Arial, sans-serif; padding: 20px;">
                        <h2>You Approved a Payment Request</h2>
                        <p>Hello ${approver.name},</p>
                        <p>You have approved the payment request. It is now awaiting authorization.</p>
                        ${generateEmailTable(pr, project, provider)}
                        ${generateEmailButton(pr, '')}
                    </div>
                    `
                );
            }

            // Notify Project Owner (Next Step: Authorize)
            if (project && project.projectOwner) {
                const owner = await User.findById(project.projectOwner);
                if (owner && owner.email) {
                    await sendEmail(
                        owner.email,
                        `Action Required: Authorize Payment Request - ${project.name}`,
                        `
                        <div style="font-family: Arial, sans-serif; padding: 20px;">
                            <h2>Payment Request Authorization Needed</h2>
                            <p>Hello ${owner.name},</p>
                            <p>You have approved a payment request. The next step is to <strong>Authorize</strong> it.</p>
                            ${generateEmailTable(pr, project, provider)}
                            ${generateEmailButton(pr, '/authorize')}
                        </div>
                        `
                    );
                }
            }
        } catch (notifyErr) {
            console.error("Notification error:", notifyErr);
        }

        return res.json(pr);
    } catch (err) {
        console.error("Error approving PR:", err);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};

export const authorizePaymentRequest = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.userId;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: "Invalid payment request ID" });
        }
        if (!req.tenantDB) {
            return res.status(500).json({ error: "Tenant connection not available" });
        }

        const PaymentRequest = getPaymentRequestModel(req.tenantDB);
        const Project = getProjectModel(req.tenantDB);
        const Entity = getEntityModel(req.tenantDB);
        getAccountModel(req.tenantDB);
        const BusinessUnit = getBusinessUnitModel(req.tenantDB);
        const User = await getUserModel();

        const pr = await PaymentRequest.findById(id);
        if (!pr) return res.status(404).json({ error: "Payment request not found" });

        if (pr.status !== 'approved') {
            return res.status(400).json({ error: "Payment request must be approved first. Current status: " + pr.status });
        }

        const project = await Project.findById(pr.project_id);
        if (!project) return res.status(404).json({ error: "Project not found" });

        // const bu = project.business_unit_id ? await BusinessUnit.findById(project.business_unit_id) : null;
        // if (!bu) return res.status(404).json({ error: "Business Unit not found" });

        // Authorization Check: Must be Project Owner or Superadmin (Simplified Flow)
        const currentUser = await User.findById(userId);
        console.log(`[AuthorizePR] CurrentUser Role: ${currentUser?.role}`);
        const isSuperAdmin = currentUser?.role === 'superadmin';

        if (!isSuperAdmin && (!project.projectOwner || project.projectOwner.toString() !== userId)) {
            return res.status(403).json({ error: "Only the Project Owner can authorize this request" });
        }

        // Update Status
        pr.status = 'authorized';
        pr.authorized_by = new mongoose.Types.ObjectId(userId);
        if (req.body.notes) pr.authorization_notes = req.body.notes;

        // Capture Payment Date and Bank Account during Authorization
        const { payment_date, debited_bank_account } = req.body;
        if (payment_date) pr.payment_date = new Date(payment_date);
        if (debited_bank_account && mongoose.Types.ObjectId.isValid(debited_bank_account)) {
            pr.debited_bank_account = new mongoose.Types.ObjectId(debited_bank_account);
        }

        await pr.save();
        await pr.populate('debited_bank_account');

        // Notifications
        try {
            const provider = await Entity.findById(pr.provider_id);
            const creator = pr.created_by ? await User.findById(pr.created_by) : null;
            const authorizingAdmin = await User.findById(userId);

            // Notify Creator
            if (creator && creator.email) {
                await sendEmail(
                    creator.email,
                    `Payment Request Authorized - ${project.name}`,
                    `
                    <div style="font-family: Arial, sans-serif; padding: 20px;">
                        <h2>Payment Request Authorized</h2>
                        <p>Hello ${creator.name},</p>
                        <p>Your payment request has been authorized by the Business Unit Admin (${authorizingAdmin?.name}). It is now pending payment.</p>
                        ${generateEmailTable(pr, project, provider)}
                        ${generateEmailButton(pr, '')}
                    </div>
                    `
                );
            }

            // Notify Authorizer (Self - Project Owner)
            if (authorizingAdmin && authorizingAdmin.email) {
                await sendEmail(
                    authorizingAdmin.email,
                    `Action Required: Attend Payment Request - ${project.name}`,
                    `
                    <div style="font-family: Arial, sans-serif; padding: 20px;">
                        <h2>Payment Request Authorized</h2>
                        <p>Hello ${authorizingAdmin.name},</p>
                        <p>You have authorized the payment request. The final step is to <strong>Attend/Pay</strong> it.</p>
                        ${generateEmailTable(pr, project, provider)}
                        ${generateEmailButton(pr, '/pay')}
                    </div>
                    `
                );
            }

        } catch (notifyErr) {
            console.error("Notification error:", notifyErr);
        }

        return res.json(pr);
    } catch (err) {
        console.error("Error authorizing PR:", err);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};

export const payPaymentRequest = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { payment_proof, notes } = req.body; // Expecting payment_proof URL/path
        const userId = req.userId;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: "Invalid payment request ID" });
        }
        if (!req.tenantDB) {
            return res.status(500).json({ error: "Tenant connection not available" });
        }

        const PaymentRequest = getPaymentRequestModel(req.tenantDB);
        const Project = getProjectModel(req.tenantDB);
        const Entity = getEntityModel(req.tenantDB);
        getAccountModel(req.tenantDB);
        const BusinessUnit = getBusinessUnitModel(req.tenantDB);
        const User = await getUserModel();

        const pr = await PaymentRequest.findById(id);
        if (!pr) return res.status(404).json({ error: "Payment request not found" });

        if (pr.status !== 'authorized') {
            return res.status(400).json({ error: "Payment request must be authorized first. Current status: " + pr.status });
        }

        const project = await Project.findById(pr.project_id);
        if (!project) return res.status(404).json({ error: "Project not found" });

        // const bu = project.business_unit_id ? await BusinessUnit.findById(project.business_unit_id) : null;
        // if (!bu) return res.status(404).json({ error: "Business Unit not found" });

        // Authorization Check: Must be Project Owner or Superadmin (Simplified Flow)
        const currentUser = await User.findById(userId);
        console.log(`[PayPR] CurrentUser Role: ${currentUser?.role}`);
        const isSuperAdmin = currentUser?.role === 'superadmin';

        if (!isSuperAdmin && (!project.projectOwner || project.projectOwner.toString() !== userId)) {
            return res.status(403).json({ error: "Only the Project Owner can process this payment" });
        }

        if (!payment_proof) {
            return res.status(400).json({ error: "Payment proof (voucher) is required to complete payment." });
        }

        // Update Status
        pr.status = 'paid';
        pr.paid_by = new mongoose.Types.ObjectId(userId);
        pr.payment_proof = payment_proof;
        if (notes) pr.payment_notes = notes;
        await pr.save();
        await pr.populate('debited_bank_account');

        // Notifications
        try {
            const provider = await Entity.findById(pr.provider_id);
            const creator = pr.created_by ? await User.findById(pr.created_by) : null;
            const payer = await User.findById(userId);

            // Notify Creator
            if (creator && creator.email) {
                await sendEmail(
                    creator.email,
                    `Payment Completed - ${project.name}`,
                    `
                    <div style="font-family: Arial, sans-serif; padding: 20px;">
                        <h2>Payment Request Paid</h2>
                        <p>Hello ${creator.name},</p>
                        <p>Your payment request has been processed/attended by (${payer?.name}).</p>
                        <p>Payment Proof: <a href="${payment_proof}">View Voucher</a></p>
                        ${generateEmailTable(pr, project, provider)}
                        ${generateEmailButton(pr, '')}
                    </div>
                    `
                );
            }

            // Notify Treasurer (Self)
            if (payer && payer.email) {
                await sendEmail(
                    payer.email,
                    `Payment Processed (Confirmation) - ${project.name}`,
                    `
                    <div style="font-family: Arial, sans-serif; padding: 20px;">
                        <h2>You Processed a Payment</h2>
                        <p>Hello ${payer.name},</p>
                        <p>You have successfully marked the payment request as paid.</p>
                        ${generateEmailTable(pr, project, provider)}
                        ${generateEmailButton(pr, '')}
                    </div>
                    `
                );
            }

        } catch (notifyErr) {
            console.error("Notification error:", notifyErr);
        }

        return res.json(pr);
    } catch (err) {
        console.error("Error paying PR:", err);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};

export const rejectPaymentRequest = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.userId;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: "Invalid payment request ID" });
        }
        if (!req.tenantDB) {
            return res.status(500).json({ error: "Tenant connection not available" });
        }

        const PaymentRequest = getPaymentRequestModel(req.tenantDB);
        const Project = getProjectModel(req.tenantDB);
        const Entity = getEntityModel(req.tenantDB);
        const User = await getUserModel();

        const pr = await PaymentRequest.findById(id);
        if (!pr) return res.status(404).json({ error: "Payment request not found" });

        // Update Status
        const { reason } = req.body;
        if (!reason) {
            return res.status(400).json({ error: "Rejection reason is required" });
        }
        pr.status = 'rejected';
        pr.rejected_by = new mongoose.Types.ObjectId(userId);
        pr.rejection_reason = reason;
        await pr.save();

        // Notifications
        try {
            const project = await Project.findById(pr.project_id);
            const provider = await Entity.findById(pr.provider_id);
            const creator = pr.created_by ? await User.findById(pr.created_by) : null;
            const rejector = await User.findById(userId);

            // Notify Creator
            if (creator && creator.email) {
                await sendEmail(
                    creator.email,
                    `Payment Request Rejected - ${project?.name || 'GoDigital'}`,
                    `
                    <div style="font-family: Arial, sans-serif; padding: 20px;">
                        <h2>Payment Request Rejected</h2>
                        <p>Hello ${creator.name},</p>
                        <p>Your payment request has been rejected by ${rejector?.name}.</p>
                        ${generateEmailTable(pr, project, provider)}
                        ${generateEmailButton(pr, '')}
                    </div>
                    `
                );
            }
        } catch (notifyErr) {
            console.error("Notification error:", notifyErr);
        }

        return res.json(pr);
    } catch (err) {
        console.error("Error rejecting PR:", err);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};

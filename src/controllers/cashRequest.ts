import { Request, Response } from "express";
import mongoose from "mongoose";
import { getCashRequestModel } from "../models/tenant/CashRequest";
import { getProjectModel } from "../models/tenant/Project";
import getUserModel from "../models/system/User";
import { sendEmail } from "../services/email";
import * as temporalCR from "../services/cashRequestTemporal";
import { isTemporalEnabled } from "../services/temporal";
import { geminiInvoiceService } from "../services/ai/geminiInvoiceService";
import { receiptStorage } from "../services/storage/receiptStorage";
import { getReceiptInventoryModel } from "../models/tenant/ReceiptInventory";
import { N8NService } from "../services/n8n/n8n";

const n8nService = new N8NService();

// --- HELPERS ---

const generateEmailTable = (doc: any, project: any, employee: any) => {
    return `
    <table style="border-collapse: collapse; width: 100%; max-width: 600px;">
        <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 10px; font-weight: bold;">Proyecto:</td>
            <td style="padding: 10px;">${project?.name || 'N/A'}</td>
        </tr>
        <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 10px; font-weight: bold;">Solicitante:</td>
            <td style="padding: 10px;">${employee?.name || doc.employee_name || 'N/A'}</td>
        </tr>
        <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 10px; font-weight: bold;">Monto Solicitado:</td>
            <td style="padding: 10px;">${doc.requested_amount.toLocaleString()} ${doc.currency}</td>
        </tr>
        <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 10px; font-weight: bold;">Propósito:</td>
            <td style="padding: 10px;">${doc.purpose}</td>
        </tr>
        <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 10px; font-weight: bold;">Estado:</td>
            <td style="padding: 10px;">${doc.status}</td>
        </tr>
    </table>
    `;
};

const generateEmailButton = (doc: any, suffix: string = '') => {
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const url = `${baseUrl}/cash-request/${doc._id}${suffix}`;
    return `
    <div style="margin-top: 20px;">
        <a href="${url}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
            Ver Solicitud de Caja
        </a>
    </div>
    `;
};

// --- CONTROLLERS ---

export const getCashRequests = async (req: Request, res: Response) => {
    try {
        if (!req.tenantDB) return res.status(500).json({ error: "Tenant connection not available" });
        const CashRequest = getCashRequestModel(req.tenantDB);
        getProjectModel(req.tenantDB); // Ensure Project model is registered

        const filter: any = {};
        if (req.query.status) filter.status = req.query.status;
        
        // RBAC: Standard users only see their own requests or where they are beneficiaries
        if (req.role === 'standard' && req.userId) {
            filter.$or = [
                { created_by: new mongoose.Types.ObjectId(req.userId) },
                { beneficiary_id: new mongoose.Types.ObjectId(req.userId) }
            ];
        }

        const docs = await CashRequest.find(filter)
            .populate('project_id')
            .sort({ createdAt: -1 })
            .lean();

        // Manual Populate for User fields (Cross-connection)
        const User = await getUserModel();
        const userIds = new Set<string>();
        docs.forEach((d: any) => {
            if (d.created_by) userIds.add(d.created_by.toString());
            if (d.beneficiary_id) userIds.add(d.beneficiary_id.toString());
        });

        const users = await User.find({ _id: { $in: Array.from(userIds) } }).select('name email').lean();
        const userMap = new Map(users.map((u: any) => [u._id.toString(), u]));

        const normalized = docs.map((d: any) => ({
            ...d,
            created_by: d.created_by ? userMap.get(d.created_by.toString()) || { _id: d.created_by } : null,
            beneficiary_id: d.beneficiary_id ? userMap.get(d.beneficiary_id.toString()) || { _id: d.beneficiary_id } : null
        }));

        return res.json(normalized);
    } catch (err) {
        console.error("GET /cash-requests error:", err);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};

export const createCashRequest = async (req: Request, res: Response) => {
    try {
        if (!req.tenantDB) return res.status(500).json({ error: "Tenant connection not available" });
        const CashRequest = getCashRequestModel(req.tenantDB);
        const Project = getProjectModel(req.tenantDB);
        const User = await getUserModel();

        const data = req.body;
        if (req.userId) data.created_by = req.userId;
        if (!data.beneficiary_id && req.userId) data.beneficiary_id = req.userId;

        const doc = await new CashRequest(data).save();

        // Notifications & Temporal
        try {
            const project = await Project.findById(doc.project_id);
            const employee = await User.findById(doc.created_by);
            const supervisor = project?.projectOwner ? await User.findById(project.projectOwner) : null;
            const superAdmin = await User.findOne({ role: 'superadmin' });

            if (isTemporalEnabled()) {
                const input = temporalCR.buildCRInput(
                    doc, project, employee, supervisor, superAdmin, 
                    req.tenantDetailId || req.tenantId || 'unknown'
                );
                await temporalCR.startCRWorkflow(input);
            } else {
                // Manual Emails if Temporal is off
                if (supervisor && supervisor.email) {
                    await sendEmail(
                        supervisor.email,
                        `Nueva Solicitud de Caja de Chica - ${project?.name}`,
                        `<h2>Nueva Solicitud de Caja</h2><p>Hola ${supervisor.name}, ${employee?.name} ha solicitado una caja chica.</p>${generateEmailTable(doc, project, employee)}${generateEmailButton(doc, '/approve')}`
                    );
                }
            }
        } catch (notifyErr) {
            console.error("Notify error in createCashRequest:", notifyErr);
        }

        return res.status(201).json(doc);
    } catch (err) {
        console.error("POST /cash-requests error:", err);
        return res.status(500).json({ error: "Error saving cash request" });
    }
};

export const getCashRequestById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid ID" });
        if (!req.tenantDB) return res.status(500).json({ error: "Tenant connection not available" });

        const CashRequest = getCashRequestModel(req.tenantDB);
        getProjectModel(req.tenantDB);
        
        const doc: any = await CashRequest.findById(id)
            .populate('project_id')
            .lean();

        if (!doc) return res.status(404).json({ error: "Not found" });

        // Manual Populate for User fields (Cross-connection)
        const User = await getUserModel();
        const userIds = new Set<string>();
        if (doc.created_by) userIds.add(doc.created_by.toString());
        if (doc.beneficiary_id) userIds.add(doc.beneficiary_id.toString());
        if (doc.approved_by) userIds.add(doc.approved_by.toString());
        if (doc.authorized_by) userIds.add(doc.authorized_by.toString());
        if (doc.paid_by) userIds.add(doc.paid_by.toString());
        if (doc.reviewed_by) userIds.add(doc.reviewed_by.toString());
        if (doc.closed_by) userIds.add(doc.closed_by.toString());
        if (doc.rejected_by) userIds.add(doc.rejected_by.toString());

        const users = await User.find({ _id: { $in: Array.from(userIds) } }).select('name email role').lean();
        const userMap = new Map(users.map((u: any) => [u._id.toString(), u]));

        const normalized = {
            ...doc,
            created_by: doc.created_by ? userMap.get(doc.created_by.toString()) : null,
            beneficiary_id: doc.beneficiary_id ? userMap.get(doc.beneficiary_id.toString()) : null,
            approved_by: doc.approved_by ? userMap.get(doc.approved_by.toString()) : null,
            authorized_by: doc.authorized_by ? userMap.get(doc.authorized_by.toString()) : null,
            paid_by: doc.paid_by ? userMap.get(doc.paid_by.toString()) : null,
            reviewed_by: doc.reviewed_by ? userMap.get(doc.reviewed_by.toString()) : null,
            closed_by: doc.closed_by ? userMap.get(doc.closed_by.toString()) : null,
            rejected_by: doc.rejected_by ? userMap.get(doc.rejected_by.toString()) : null
        };

        return res.json(normalized);
    } catch (err) {
        return res.status(500).json({ error: "Error getting cash request" });
    }
};

export const updateCashRequest = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!req.tenantDB) return res.status(500).json({ error: "Tenant connection not available" });
        const CashRequest = getCashRequestModel(req.tenantDB);

        const updated = await CashRequest.findByIdAndUpdate(id, { $set: req.body }, { new: true });
        if (!updated) return res.status(404).json({ error: "Not found" });
        return res.json(updated);
    } catch (err) {
        return res.status(500).json({ error: "Error updating cash request" });
    }
};

export const deleteCashRequest = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!req.tenantDB) return res.status(500).json({ error: "Tenant connection not available" });
        const CashRequest = getCashRequestModel(req.tenantDB);

        const deleted = await CashRequest.findByIdAndDelete(id);
        if (!deleted) return res.status(404).json({ error: "Not found" });
        return res.json({ ok: true });
    } catch (err) {
        return res.status(500).json({ error: "Error deleting cash request" });
    }
};

export const approveCashRequest = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { notes } = req.body;
        if (!req.tenantDB) return res.status(500).json({ error: "Tenant connection not available" });

        const CashRequest = getCashRequestModel(req.tenantDB);
        const User = await getUserModel();
        const currentUser = await User.findById(req.userId);

        const cr = await CashRequest.findById(id);
        if (!cr) return res.status(404).json({ error: "Not found" });

        cr.status = 'approved';
        cr.approved_by = new mongoose.Types.ObjectId(req.userId!);
        cr.approval_notes = notes;
        await cr.save();

        if (isTemporalEnabled()) {
            await temporalCR.signalApprove(id, req.userId!, currentUser?.name || 'User', notes);
        }

        return res.json(cr);
    } catch (err) {
        return res.status(500).json({ error: "Error approving" });
    }
};

export const authorizeCashRequest = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { authorized_amount, expense_period_days, notes } = req.body;
        if (!req.tenantDB) return res.status(500).json({ error: "Tenant connection not available" });

        const CashRequest = getCashRequestModel(req.tenantDB);
        const User = await getUserModel();
        const currentUser = await User.findById(req.userId);

        const cr = await CashRequest.findById(id);
        if (!cr) return res.status(404).json({ error: "Not found" });

        cr.status = 'authorized';
        cr.authorized_by = new mongoose.Types.ObjectId(req.userId!);
        cr.authorized_amount = authorized_amount || cr.requested_amount;
        cr.expense_period_days = expense_period_days || 7;
        cr.authorization_notes = notes;
        await cr.save();

        if (isTemporalEnabled()) {
            await temporalCR.signalAuthorize(id, req.userId!, currentUser?.name || 'User', cr.authorized_amount || 0, cr.expense_period_days || 0, notes);
        }

        return res.json(cr);
    } catch (err) {
        return res.status(500).json({ error: "Error authorizing" });
    }
};

export const payCashRequest = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { payment_proof, notes } = req.body;
        if (!req.tenantDB) return res.status(500).json({ error: "Tenant connection not available" });

        const CashRequest = getCashRequestModel(req.tenantDB);
        const User = await getUserModel();
        const currentUser = await User.findById(req.userId);

        const cr = await CashRequest.findById(id);
        if (!cr) return res.status(404).json({ error: "Not found" });

        cr.status = 'paid';
        cr.paid_by = new mongoose.Types.ObjectId(req.userId!);
        cr.payment_proof = payment_proof;
        cr.payment_notes = notes;
        cr.expense_period_started_at = new Date();
        await cr.save();

        if (isTemporalEnabled()) {
            await temporalCR.signalPay(id, req.userId!, currentUser?.name || 'User', payment_proof, notes);
        }

        return res.json(cr);
    } catch (err) {
        return res.status(500).json({ error: "Error paying" });
    }
};

export const submitExpense = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { notes } = req.body;
        if (!req.tenantDB) return res.status(500).json({ error: "Tenant connection not available" });

        const CashRequest = getCashRequestModel(req.tenantDB);
        const User = await getUserModel();
        const currentUser = await User.findById(req.userId);

        const cr = await CashRequest.findById(id);
        if (!cr) return res.status(404).json({ error: "Not found" });

        const totalSpent = (cr.expense_items || []).reduce((acc, item) => acc + item.amount, 0);
        
        cr.status = 'submitted';
        cr.total_spent = totalSpent;
        cr.submitted_at = new Date();
        if (notes) cr.notes = (cr.notes ? cr.notes + "\n" : "") + "Expense Submission: " + notes;
        await cr.save();

        if (isTemporalEnabled()) {
            await temporalCR.signalSubmitExpense(id, req.userId!, currentUser?.name || 'User', totalSpent, cr.expense_files || [], notes);
        }

        return res.json(cr);
    } catch (err) {
        return res.status(500).json({ error: "Error submitting expense" });
    }
};

export const addExpenseItemAI = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { method = 'gemini' } = req.body; // Default gemini
        const file = req.file;

        if (!file) return res.status(400).json({ error: "No file uploaded" });
        if (!req.tenantDB) return res.status(500).json({ error: "Tenant connection not available" });

        const CashRequest = getCashRequestModel(req.tenantDB);
        const ReceiptInventory = getReceiptInventoryModel(req.tenantDB);
        const User = await getUserModel();
        const currentUser = await User.findById(req.userId);
        if (!currentUser) return res.status(404).json({ error: "User not found" });

        const cr = await CashRequest.findById(id);
        if (!cr) return res.status(404).json({ error: "Cash Request not found" });

        // 1. Analyze (Follow the requested method)
        let aiResult: any = null;
        if (method === 'n8n') {
            aiResult = await n8nService.analyzeDocument(file, 'cash_request', 'expense');
        } else {
            aiResult = await geminiInvoiceService.analyzeInvoice(file.buffer, file.mimetype);
        }

        if (!aiResult) {
            return res.status(500).json({ error: "Analysis failed (could be rate-limit, check logs)" });
        }

        // Standardize normalization (n8n might have different structure than gemini)
        // Ensure aiResult has: total, date, currency, items, issuer{name, taxId}
        const normalizedDate = aiResult.date ? new Date(aiResult.date) : new Date();
        const normalizedTotal = aiResult.total || 0;

        // 2. DUPLICATE DETECTION
        const possibleDuplicate = (cr.expense_items || []).find(item => 
            item.amount === normalizedTotal && 
            item.issuer_name === (aiResult.issuer?.name || "Unknown") &&
            item.date?.toISOString().split('T')[0] === normalizedDate.toISOString().split('T')[0]
        );

        if (possibleDuplicate) {
            return res.status(409).json({ 
                error: "Detección de duplicado: Ya existe un gasto con este monto y emisor para esta solicitud.",
                duplicate: possibleDuplicate
            });
        }

        // 3. Save file to storage
        const storageResult = await receiptStorage.saveFile(
            file.buffer, 
            file.originalname, 
            currentUser.name || 'user', 
            'cash_request', 
            'expense'
        );

        // 4. Create Receipt Inventory Entry
        const base64Url = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
        const inventoryDoc = await new ReceiptInventory({
            user_id: currentUser._id,
            user_name: currentUser.name,
            source: 'cash_request',
            source_id: cr._id,
            type: 'expense',
            period: storageResult.period,
            fileName: storageResult.fileName,
            filePath: storageResult.relativePath,
            mimeType: file.mimetype,
            size: file.size,
            base64Url,
            extracted_data: aiResult,
            ai_raw_data: aiResult,
            status: 'processed'
        }).save();

        // 5. Add item to CashRequest
        const newItem = {
            file_id: inventoryDoc._id.toString(),
            date: normalizedDate,
            amount: normalizedTotal,
            currency: aiResult.currency || cr.currency || 'PEN',
            issuer_name: aiResult.issuer?.name || "Unknown",
            tax_id: aiResult.issuer?.taxId,
            description: `Gasto detectado por ${method.toUpperCase()}: ${aiResult.issuer?.name || ''}`,
            items: aiResult.items || [],
            ai_raw_data: aiResult
        };

        if (!cr.expense_items) cr.expense_items = [];
        cr.expense_items.push(newItem as any);
        if (!cr.expense_files) cr.expense_files = [];
        cr.expense_files.push(inventoryDoc._id.toString());
        
        // Update status to expense_draft if it was paid
        if (cr.status === 'paid') cr.status = 'expense_draft';
        
        // 6. Recalculate total_spent
        const totalSpent = (cr.expense_items || []).reduce((acc, item) => acc + item.amount, 0);
        cr.total_spent = totalSpent;
        
        await cr.save();

        return res.json(cr);

    } catch (err: any) {
        console.error("addExpenseItemAI error:", err);
        return res.status(500).json({ error: err.message || "Error processing AI expense" });
    }
};

export const reviewCashRequest = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { notes, status: nextStatus } = req.body;
        if (!req.tenantDB) return res.status(500).json({ error: "Tenant connection not available" });

        const CashRequest = getCashRequestModel(req.tenantDB);
        const User = await getUserModel();
        const currentUser = await User.findById(req.userId);

        const cr = await CashRequest.findById(id);
        if (!cr) return res.status(404).json({ error: "Not found" });

        const totalSpent = (cr.expense_items || []).reduce((acc, item) => acc + item.amount, 0);
        const authorizedAmount = cr.authorized_amount || 0;
        const balance = authorizedAmount - totalSpent;

        cr.status = nextStatus || (balance > 0 ? 'refund' : (balance < 0 ? 'reimbursement' : 'under_review'));
        cr.reviewed_by = new mongoose.Types.ObjectId(req.userId!);
        cr.balance = -balance; // positive means we owe the user, negative means they owe us
        cr.review_notes = notes;
        await cr.save();

        if (isTemporalEnabled()) {
            await temporalCR.signalReview(id, req.userId!, currentUser?.name || 'User', totalSpent, authorizedAmount, cr.balance || 0, notes);
        }

        return res.json(cr);
    } catch (err) {
        return res.status(500).json({ error: "Error reviewing" });
    }
};

export const closeCashRequest = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { closure_proof, notes } = req.body;
        if (!req.tenantDB) return res.status(500).json({ error: "Tenant connection not available" });

        const CashRequest = getCashRequestModel(req.tenantDB);
        const User = await getUserModel();
        const currentUser = await User.findById(req.userId);

        const cr = await CashRequest.findById(id);
        if (!cr) return res.status(404).json({ error: "Not found" });

        cr.status = 'closed';
        cr.closed_by = new mongoose.Types.ObjectId(req.userId!);
        cr.closure_proof = closure_proof;
        cr.closure_notes = notes;
        cr.closed_at = new Date();
        await cr.save();

        if (isTemporalEnabled()) {
            await temporalCR.signalClose(id, req.userId!, currentUser?.name || 'User', closure_proof, notes);
        }

        return res.json(cr);
    } catch (err) {
        return res.status(500).json({ error: "Error closing" });
    }
};

export const rejectCashRequest = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        if (!req.tenantDB) return res.status(500).json({ error: "Tenant connection not available" });

        const CashRequest = getCashRequestModel(req.tenantDB);
        const User = await getUserModel();
        const currentUser = await User.findById(req.userId);

        const cr = await CashRequest.findById(id);
        if (!cr) return res.status(404).json({ error: "Not found" });

        cr.status = 'rejected';
        cr.rejected_by = new mongoose.Types.ObjectId(req.userId!);
        cr.rejection_reason = reason;
        await cr.save();

        if (isTemporalEnabled()) {
            await temporalCR.signalReject(id, req.userId!, currentUser?.name || 'User', reason);
        }

        return res.json(cr);
    } catch (err) {
        return res.status(500).json({ error: "Error rejecting" });
    }
};

export const internalStatusUpdate = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        if (!req.tenantDB) return res.status(500).json({ error: "Tenant connection not available" });

        const CashRequest = getCashRequestModel(req.tenantDB);
        const updated = await CashRequest.findByIdAndUpdate(id, { $set: { status } }, { new: true });
        
        return res.json(updated);
    } catch (err) {
        return res.status(500).json({ error: "Error updating internal status" });
    }
};

export const getCashRequestWorkflowStatus = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const status = await temporalCR.getCRWorkflowStatus(id);
        return res.json(status);
    } catch (err) {
        return res.status(500).json({ error: "Error getting workflow status" });
    }
};

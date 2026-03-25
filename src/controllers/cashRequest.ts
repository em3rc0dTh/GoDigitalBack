// src/controllers/cashRequest.ts
// Controlador completo del módulo Cash Request.
// Sigue EXACTAMENTE el mismo patrón que paymentRequest.ts:
//   - Tenant DB siempre requerido
//   - Temporal signals en cada acción
//   - Emails fallback cuando Temporal está desactivado

import { Request, Response } from "express";
import mongoose from "mongoose";
import { getCashRequestModel } from "../models/tenant/CashRequest";
import { getProjectModel } from "../models/tenant/Project";
import { getTenantFileModel } from "../models/tenant/TenantFile";
import getUserModel, { UserSchema } from "../models/system/User";
import { isTemporalEnabled } from "../services/temporal";
import * as temporalCR from "../services/cashRequestTemporal";

// ─── List ─────────────────────────────────────────────────────────────────────
export const getCashRequests = async (req: Request, res: Response) => {
    try {
        if (!req.tenantDB) return res.status(500).json({ error: "Tenant connection not available" });

        getProjectModel(req.tenantDB);
        const CashRequest = getCashRequestModel(req.tenantDB);

        const User = await getUserModel();

        const filter: any = {};
        if (req.query.status) filter.status = req.query.status;
        if (req.query.mine === 'true' && req.userId)
            filter.created_by = new mongoose.Types.ObjectId(req.userId);
        else if (req.role === 'standard' && req.userId)
            // Standard users only see their own requests
            filter.created_by = new mongoose.Types.ObjectId(req.userId);

        const docs = await CashRequest.find(filter)
            .populate('project_id', 'name')
            .populate({ path: 'created_by', select: 'name email', model: User })
            .populate({ path: 'beneficiary_id', select: 'name email', model: User })
            .populate({ path: 'approved_by', select: 'name', model: User })
            .populate({ path: 'authorized_by', select: 'name', model: User })
            .populate({ path: 'paid_by', select: 'name', model: User })
            .sort({ createdAt: -1 })
            .lean();

        return res.json(docs.map((d: any) => ({ ...d, _id: d._id.toString() })));
    } catch (err) {
        console.error("GET /cash-requests error:", err);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};

// ─── Get by ID ────────────────────────────────────────────────────────────────
export const getCashRequestById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid ID" });
        if (!req.tenantDB) return res.status(500).json({ error: "Tenant connection not available" });

        getProjectModel(req.tenantDB);
        const CashRequest = getCashRequestModel(req.tenantDB);

        const User = await getUserModel();

        const doc = await CashRequest.findById(id)
            .populate('project_id', 'name projectOwner')
            .populate({ path: 'created_by', select: 'name email', model: User })
            .populate({ path: 'beneficiary_id', select: 'name email', model: User })
            .lean();

        if (!doc) return res.status(404).json({ error: "Cash request not found" });

        return res.json({ ...doc, _id: doc._id.toString() });
    } catch (err) {
        console.error("GET /cash-requests/:id error:", err);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};

// ─── Create ───────────────────────────────────────────────────────────────────
export const createCashRequest = async (req: Request, res: Response) => {
    try {
        if (!req.tenantDB) return res.status(500).json({ error: "Tenant connection not available" });

        const CashRequest = getCashRequestModel(req.tenantDB);
        const Project = getProjectModel(req.tenantDB);
        const User = await getUserModel();

        const data: any = { ...req.body, created_by: req.userId };

        if (req.body.beneficiary_email) {
            const beneficiaryUser = await User.findOne({ email: req.body.beneficiary_email.trim().toLowerCase() });
            if (beneficiaryUser) {
                data.beneficiary_id = beneficiaryUser._id;
            } else {
                return res.status(400).json({ error: `Usuario beneficiario con correo ${req.body.beneficiary_email} no encontrado en el sistema` });
            }
        } else {
            data.beneficiary_id = req.userId; // Por defecto el creador es el beneficiado
        }

        const doc = await new CashRequest(data).save();

        // ── Temporal: iniciar workflow ────────────────────────────────────────
        if (isTemporalEnabled()) {
            try {
                const project = await Project.findById(doc.project_id);
                const employee = doc.beneficiary_id ? await User.findById(doc.beneficiary_id) : await User.findById(doc.created_by);
                const supervisor = project?.projectOwner ? await User.findById(project.projectOwner) : null;
                // SuperAdmin: find any user with role=superadmin in the system
                const superAdmin = await User.findOne({ role: 'superadmin' });

                const input = temporalCR.buildCRInput(
                    doc, project, employee, supervisor, superAdmin,
                    req.tenantDetailId ?? req.tenantId ?? 'unknown',
                );
                await temporalCR.startCRWorkflow(input);
            } catch (temporalErr: any) {
                console.error("⚠️ [Temporal] Error iniciando CR workflow:", temporalErr?.message);
            }
        }

        // Ensure the returned document is populated before responding
        await doc.populate('project_id', 'name');
        await doc.populate({ path: 'created_by', select: 'name email', model: User });
        await doc.populate({ path: 'beneficiary_id', select: 'name email', model: User });

        return res.status(201).json(doc);
    } catch (err) {
        console.error("POST /cash-requests error:", err);
        return res.status(500).json({ error: "Error creating cash request" });
    }
};

// ─── Update (generic field patch) ─────────────────────────────────────────────
export const updateCashRequest = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid ID" });
        if (!req.tenantDB) return res.status(500).json({ error: "Tenant connection not available" });

        const CashRequest = getCashRequestModel(req.tenantDB);
        const updated = await CashRequest.findByIdAndUpdate(id, { $set: req.body }, { new: true });
        if (!updated) return res.status(404).json({ error: "Cash request not found" });
        return res.json(updated);
    } catch (err) {
        console.error("PUT /cash-requests/:id error:", err);
        return res.status(500).json({ error: "Error updating cash request" });
    }
};

// ─── Delete ───────────────────────────────────────────────────────────────────
export const deleteCashRequest = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid ID" });
        if (!req.tenantDB) return res.status(500).json({ error: "Tenant connection not available" });

        const CashRequest = getCashRequestModel(req.tenantDB);
        const deleted = await CashRequest.findByIdAndDelete(id);
        if (!deleted) return res.status(404).json({ error: "Cash request not found" });
        return res.json({ ok: true });
    } catch (err) {
        console.error("DELETE /cash-requests/:id error:", err);
        return res.status(500).json({ error: "Error deleting cash request" });
    }
};

// ─── Approve (Supervisor) ─────────────────────────────────────────────────────
export const approveCashRequest = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid ID" });
        if (!req.tenantDB) return res.status(500).json({ error: "Tenant connection not available" });

        const CashRequest = getCashRequestModel(req.tenantDB);
        const Project = getProjectModel(req.tenantDB);
        const User = await getUserModel();

        const cr = await CashRequest.findById(id);
        if (!cr) return res.status(404).json({ error: "Cash request not found" });
        if (cr.status !== 'created') return res.status(400).json({ error: `Cannot approve from status: ${cr.status}` });

        const currentUser = await User.findById(req.userId);
        const isSuperAdmin = currentUser?.role === 'superadmin';
        const project = await Project.findById(cr.project_id);

        if (!isSuperAdmin && (!project?.projectOwner || project.projectOwner.toString() !== req.userId)) {
            return res.status(403).json({ error: "Only the Supervisor (Project Owner) or SuperAdmin can approve" });
        }

        cr.status = 'approved';
        cr.approved_by = new mongoose.Types.ObjectId(req.userId!);
        if (req.body.notes) cr.approval_notes = req.body.notes;
        await cr.save();

        await temporalCR.signalApprove(id, req.userId!, currentUser?.name ?? req.userId!, req.body.notes);

        return res.json(cr);
    } catch (err) {
        console.error("PUT /cash-requests/:id/approve error:", err);
        return res.status(500).json({ error: "Error approving cash request" });
    }
};

// ─── Authorize (SuperAdmin) ───────────────────────────────────────────────────
export const authorizeCashRequest = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid ID" });
        if (!req.tenantDB) return res.status(500).json({ error: "Tenant connection not available" });

        const CashRequest = getCashRequestModel(req.tenantDB);
        const User = await getUserModel();

        const cr = await CashRequest.findById(id);
        if (!cr) return res.status(404).json({ error: "Cash request not found" });
        if (cr.status !== 'approved') return res.status(400).json({ error: `Cannot authorize from status: ${cr.status}` });

        const currentUser = await User.findById(req.userId);
        if (currentUser?.role !== 'superadmin') {
            return res.status(403).json({ error: "Only SuperAdmin can authorize cash requests" });
        }

        const { authorizedAmount, expensePeriodDays = 7, notes } = req.body;
        if (!authorizedAmount || isNaN(Number(authorizedAmount))) {
            return res.status(400).json({ error: "authorizedAmount is required" });
        }

        cr.status = 'authorized';
        cr.authorized_by = new mongoose.Types.ObjectId(req.userId!);
        cr.authorized_amount = Number(authorizedAmount);
        cr.expense_period_days = Number(expensePeriodDays);
        cr.authorization_notes = notes;
        await cr.save();

        await temporalCR.signalAuthorize(
            id, req.userId!, currentUser.name ?? req.userId!,
            Number(authorizedAmount), Number(expensePeriodDays), notes,
        );

        return res.json(cr);
    } catch (err) {
        console.error("PUT /cash-requests/:id/authorize error:", err);
        return res.status(500).json({ error: "Error authorizing cash request" });
    }
};

// ─── Pay / Disburse (SuperAdmin as Treasurer) ─────────────────────────────────
export const payCashRequest = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid ID" });
        if (!req.tenantDB) return res.status(500).json({ error: "Tenant connection not available" });

        const CashRequest = getCashRequestModel(req.tenantDB);
        const User = await getUserModel();

        const cr = await CashRequest.findById(id);
        if (!cr) return res.status(404).json({ error: "Cash request not found" });
        if (cr.status !== 'authorized') return res.status(400).json({ error: `Cannot pay from status: ${cr.status}` });

        const currentUser = await User.findById(req.userId);
        if (currentUser?.role !== 'superadmin') {
            return res.status(403).json({ error: "Only SuperAdmin (Treasurer) can disburse cash" });
        }

        const { paymentProof, notes } = req.body;

        cr.status = 'paid';
        cr.paid_by = new mongoose.Types.ObjectId(req.userId!);
        cr.payment_proof = paymentProof;
        cr.payment_notes = notes;
        cr.expense_period_started_at = new Date();
        await cr.save();

        await temporalCR.signalPay(id, req.userId!, currentUser.name ?? req.userId!, paymentProof ?? '', notes);

        return res.json(cr);
    } catch (err) {
        console.error("PUT /cash-requests/:id/pay error:", err);
        return res.status(500).json({ error: "Error disbursing cash request" });
    }
};

// ─── Submit Expense Report ────────────────────────────────────────────────────
export const submitExpense = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid ID" });
        if (!req.tenantDB) return res.status(500).json({ error: "Tenant connection not available" });

        const CashRequest = getCashRequestModel(req.tenantDB);
        const User = await getUserModel();

        const cr = await CashRequest.findById(id);
        if (!cr) return res.status(404).json({ error: "Cash request not found" });
        if (!['paid', 'expense_draft'].includes(cr.status)) {
            return res.status(400).json({ error: `Cannot submit expense from status: ${cr.status}` });
        }

        const currentUser = await User.findById(req.userId);
        const { totalSpent, files = [], notes } = req.body;

        cr.status = 'submitted';
        cr.total_spent = Number(totalSpent);
        cr.expense_files = files;
        cr.submitted_at = new Date();
        await cr.save();

        await temporalCR.signalSubmitExpense(
            id, req.userId!, currentUser?.name ?? req.userId!,
            Number(totalSpent), files, notes,
        );

        return res.json(cr);
    } catch (err) {
        console.error("PUT /cash-requests/:id/submit-expense error:", err);
        return res.status(500).json({ error: "Error submitting expense report" });
    }
};

// ─── Review & determine balance (SuperAdmin) ──────────────────────────────────
export const reviewCashRequest = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid ID" });
        if (!req.tenantDB) return res.status(500).json({ error: "Tenant connection not available" });

        const CashRequest = getCashRequestModel(req.tenantDB);
        const User = await getUserModel();

        const cr = await CashRequest.findById(id);
        if (!cr) return res.status(404).json({ error: "Cash request not found" });
        if (cr.status !== 'submitted') return res.status(400).json({ error: `Cannot review from status: ${cr.status}` });

        const currentUser = await User.findById(req.userId);
        if (currentUser?.role !== 'superadmin') {
            return res.status(403).json({ error: "Only SuperAdmin can review expenses" });
        }

        const { totalSpent, notes } = req.body;
        const authorizedAmount = cr.authorized_amount ?? cr.requested_amount;
        const spentNum = Number(totalSpent ?? cr.total_spent ?? 0);
        const balance = spentNum - authorizedAmount; // positive = reimburse, negative = refund

        // Determine next status
        let nextStatus: 'closed' | 'reimbursement' | 'refund';
        if (balance === 0) nextStatus = 'closed';
        else if (balance > 0) nextStatus = 'reimbursement';
        else nextStatus = 'refund';

        cr.status = nextStatus === 'closed' ? 'closed' : nextStatus;
        cr.reviewed_by = new mongoose.Types.ObjectId(req.userId!);
        cr.total_spent = spentNum;
        cr.balance = balance;
        cr.review_notes = notes;
        if (nextStatus === 'closed') cr.closed_at = new Date();
        await cr.save();

        await temporalCR.signalReview(
            id, req.userId!, currentUser.name ?? req.userId!,
            spentNum, authorizedAmount, balance, notes,
        );

        return res.json({ ...cr.toObject(), balance, nextStatus });
    } catch (err) {
        console.error("PUT /cash-requests/:id/review error:", err);
        return res.status(500).json({ error: "Error reviewing expense" });
    }
};

// ─── Close / Settle (SuperAdmin as Treasurer) ─────────────────────────────────
export const closeCashRequest = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid ID" });
        if (!req.tenantDB) return res.status(500).json({ error: "Tenant connection not available" });

        const CashRequest = getCashRequestModel(req.tenantDB);
        const User = await getUserModel();

        const cr = await CashRequest.findById(id);
        if (!cr) return res.status(404).json({ error: "Cash request not found" });
        if (!['reimbursement', 'refund'].includes(cr.status)) {
            return res.status(400).json({ error: `Cannot close from status: ${cr.status}` });
        }

        const currentUser = await User.findById(req.userId);
        if (currentUser?.role !== 'superadmin') {
            return res.status(403).json({ error: "Only SuperAdmin (Treasurer) can close settlements" });
        }

        const { proof, notes } = req.body;
        cr.status = 'closed';
        cr.closed_by = new mongoose.Types.ObjectId(req.userId!);
        cr.closure_proof = proof;
        cr.closure_notes = notes;
        cr.closed_at = new Date();
        await cr.save();

        await temporalCR.signalClose(id, req.userId!, currentUser.name ?? req.userId!, proof, notes);

        return res.json(cr);
    } catch (err) {
        console.error("PUT /cash-requests/:id/close error:", err);
        return res.status(500).json({ error: "Error closing cash request" });
    }
};

// ─── Reject ───────────────────────────────────────────────────────────────────
export const rejectCashRequest = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid ID" });
        if (!req.tenantDB) return res.status(500).json({ error: "Tenant connection not available" });

        const CashRequest = getCashRequestModel(req.tenantDB);
        const User = await getUserModel();

        const cr = await CashRequest.findById(id);
        if (!cr) return res.status(404).json({ error: "Cash request not found" });

        const terminal = ['closed', 'rejected'];
        if (terminal.includes(cr.status)) {
            return res.status(400).json({ error: `Cannot reject from status: ${cr.status}` });
        }

        const currentUser = await User.findById(req.userId);
        const { reason = 'No reason provided' } = req.body;

        cr.status = 'rejected';
        cr.rejected_by = new mongoose.Types.ObjectId(req.userId!);
        cr.rejection_reason = reason;
        await cr.save();

        await temporalCR.signalReject(id, req.userId!, currentUser?.name ?? req.userId!, reason);

        return res.json(cr);
    } catch (err) {
        console.error("PUT /cash-requests/:id/reject error:", err);
        return res.status(500).json({ error: "Error rejecting cash request" });
    }
};

// ─── Add Expense Item with AI Analysis (Progressive) ──────────────────────────
export const addExpenseItemAI = async (req: Request, res: Response) => {
    try {
        const { id } = req.params; // CashRequest ID
        const file = req.file;   // Multer file from upload
        const { method = 'n8n' } = req.body; // 'gemini' or 'n8n'

        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid ID" });
        if (!req.tenantDB) return res.status(500).json({ error: "Tenant connection not available" });
        if (!file) return res.status(400).json({ error: "No image file provided" });

        const CashRequest = getCashRequestModel(req.tenantDB);
        const cr = await CashRequest.findById(id);
        if (!cr) return res.status(404).json({ error: "Cash request not found" });

        // Allowed statuses for adding expenses
        const allowedStatuses = ['paid', 'expense_draft', 'submitted', 'under_review'];
        if (!allowedStatuses.includes(cr.status)) {
            return res.status(400).json({ error: `Cannot add expense items in status: ${cr.status}` });
        }

        // 1. Analyze with AI
        let aiResult: any;
        if (method === 'n8n') {
            const n8nService = new (require("../services/n8n/n8n").N8NService)();
            aiResult = await n8nService.readCashRequestInvoice(file);
        } else {
            const { geminiInvoiceService } = require("../services/ai/geminiInvoiceService");
            aiResult = await geminiInvoiceService.analyzeInvoice(file.buffer, file.mimetype);
        }

        if (!aiResult) {
            return res.status(500).json({ error: "AI Analysis failed to extract data" });
        }

        // 2. Map AI result to our internal structure
        // Note: Mapping might vary based on N8N's specific output, 
        // Gemini's output is structured by our prompt.
        const expenseItem = {
            date: aiResult.date ? new Date(aiResult.date) : new Date(),
            amount: Number(aiResult.total || 0),
            currency: aiResult.currency || 'PEN',
            issuer_name: aiResult.issuer?.name || '',
            tax_id: aiResult.issuer?.taxId || '',
            description: aiResult.items?.[0]?.description || 'Gasto detectado por IA',
            items: aiResult.items || [],
            ai_raw_data: aiResult
        };

        // 2b. Store the file in database for visualization
        const FileModel = getTenantFileModel(req.tenantDB);
        const base64Data = file.buffer.toString('base64');
        const dataUrl = `data:${file.mimetype};base64,${base64Data}`;
        
        const fileDoc = await new FileModel({
            fileName: file.originalname,
            mimeType: file.mimetype,
            size: file.size,
            base64Url: dataUrl
        }).save();
        
        const fileUrl = `/api/files/${fileDoc._id}`;

        // 3. Update the CashRequest document incrementally
        // We set status to 'expense_draft' if it was 'paid'
        if (cr.status === 'paid') cr.status = 'expense_draft';

        cr.expense_items = cr.expense_items || [];
        cr.expense_items.push(expenseItem as any);

        // Add the file URL to the visual list
        cr.expense_files = cr.expense_files || [];
        cr.expense_files.push(fileUrl);

        // Optionally update total_spent automatically
        const newTotal = cr.expense_items.reduce((sum, item) => sum + (item.amount || 0), 0);
        cr.total_spent = newTotal;

        await cr.save();

        console.log(`✅ Item de gasto añadido a CR ${id} via ${method}. Nuevo total: ${newTotal}`);

        return res.json({
            message: "Gasto procesado y añadido correctamente",
            addedItem: expenseItem,
            fileUrl,
            total_spent: newTotal,
            expense_files: cr.expense_files,
            status: cr.status
        });

    } catch (err: any) {
        console.error("Error in addExpenseItemAI:", err);
        return res.status(500).json({ error: err.message || "Internal error processing automated expense" });
    }
};

// ─── Internal status update (called by Temporal activities) ───────────────────
export const internalStatusUpdate = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        // Allow access via internal token header (no tenantContext needed if Temporal calls it)
        const internalToken = req.headers['x-internal-token'];
        if (internalToken !== (process.env.INTERNAL_API_TOKEN ?? 'temporal-internal')) {
            return res.status(403).json({ error: "Forbidden" });
        }
        if (!req.tenantDB) return res.status(500).json({ error: "Tenant connection not available" });

        const CashRequest = getCashRequestModel(req.tenantDB);
        const updated = await CashRequest.findByIdAndUpdate(id, { $set: req.body }, { new: true });
        if (!updated) return res.status(404).json({ error: "Cash request not found" });

        console.log(`🔄 [Internal] CashRequest ${id} actualizado por Temporal:`, req.body?.status);
        return res.json({ ok: true });
    } catch (err) {
        console.error("PUT /cash-requests/:id/internal-status error:", err);
        return res.status(500).json({ error: "Internal error" });
    }
};

// ─── Workflow status ──────────────────────────────────────────────────────────
export const getCashRequestWorkflowStatus = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!isTemporalEnabled()) {
            return res.json({ temporal: false, message: "Temporal not enabled" });
        }
        const status = await temporalCR.getCRWorkflowStatus(id);
        return res.json({ temporal: true, status });
    } catch (err) {
        console.error("GET /cash-requests/:id/workflow-status error:", err);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};

import mongoose, { Document, Model } from "mongoose";

export interface CashRequestDocument extends Document {
    created_by?: mongoose.Types.ObjectId;
    beneficiary_id?: mongoose.Types.ObjectId;
    project_id: mongoose.Types.ObjectId;
    employee_name?: string;
    employee_email?: string;
    requested_amount: number;
    authorized_amount?: number;
    expense_period_days?: number;
    currency: string;
    purpose: string;
    notes?: string;
    status: 'created' | 'approved' | 'authorized' | 'paid' | 'expense_draft' |
            'submitted' | 'under_review' | 'closed' | 'rejected' | 'reimbursement' | 'refund';
    // Approval
    approved_by?: mongoose.Types.ObjectId;
    approval_notes?: string;
    // Authorization
    authorized_by?: mongoose.Types.ObjectId;
    authorization_notes?: string;
    expense_period_started_at?: Date;
    // Payment (disbursement)
    paid_by?: mongoose.Types.ObjectId;
    payment_proof?: string;
    payment_notes?: string;
    // Expense report
    total_spent?: number;
    expense_files?: string[];
    expense_items?: Array<{
        file_id?: string;
        date?: Date;
        amount: number;
        currency: string;
        issuer_name?: string;
        tax_id?: string;
        description?: string;
        items?: Array<{
            description: string;
            quantity: number;
            unit?: string;
            unitPrice: number;
            total: number;
        }>;
        ai_raw_data?: any;
    }>;
    submitted_at?: Date;
    // Review / settlement
    reviewed_by?: mongoose.Types.ObjectId;
    balance?: number;  // positive = reimbursement, negative = refund
    review_notes?: string;
    // Closure
    closed_by?: mongoose.Types.ObjectId;
    closure_proof?: string;
    closure_notes?: string;
    closed_at?: Date;
    // Rejection
    rejected_by?: mongoose.Types.ObjectId;
    rejection_reason?: string;
    createdAt: Date;
    updatedAt: Date;
}

const CashRequestSchema = new mongoose.Schema({
    created_by:              { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    beneficiary_id:          { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    project_id:              { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    employee_name:           { type: String },
    employee_email:          { type: String },
    requested_amount:        { type: Number, required: true },
    authorized_amount:       { type: Number },
    expense_period_days:     { type: Number, default: 7 },
    currency:                { type: String, default: 'PEN' },
    purpose:                 { type: String, required: true },
    notes:                   { type: String },
    status: {
        type: String,
        enum: ['created', 'approved', 'authorized', 'paid', 'expense_draft',
               'submitted', 'under_review', 'closed', 'rejected', 'reimbursement', 'refund'],
        default: 'created',
    },
    approved_by:             { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approval_notes:          { type: String },
    authorized_by:           { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    authorization_notes:     { type: String },
    expense_period_started_at: { type: Date },
    paid_by:                 { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    payment_proof:           { type: String },
    payment_notes:           { type: String },
    total_spent:             { type: Number },
    expense_files:           { type: [String], default: [] },
    expense_items: {
        type: [{
            file_id:      { type: String },
            date:         { type: Date },
            amount:       { type: Number, required: true },
            currency:     { type: String },
            issuer_name:  { type: String },
            tax_id:       { type: String },
            description:  { type: String },
            items: [{
                description: { type: String },
                quantity:    { type: Number },
                unit:        { type: String },
                unitPrice:   { type: Number },
                total:       { type: Number }
            }],
            ai_raw_data: { type: mongoose.Schema.Types.Mixed }
        }],
        default: []
    },
    submitted_at:            { type: Date },
    reviewed_by:             { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    balance:                 { type: Number },
    review_notes:            { type: String },
    closed_by:               { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    closure_proof:           { type: String },
    closure_notes:           { type: String },
    closed_at:               { type: Date },
    rejected_by:             { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rejection_reason:        { type: String },
}, {
    timestamps: true,
    collection: 'cash_requests',
});

export function getCashRequestModel(connection: mongoose.Connection): Model<CashRequestDocument> {
    return connection.model<CashRequestDocument>("CashRequest", CashRequestSchema);
}

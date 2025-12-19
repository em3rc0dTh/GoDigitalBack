import mongoose from "mongoose";

export interface TransactionRawIMAPDocument extends mongoose.Document {
    uid: number;
    message_id: string;
    from: string;
    subject: string;
    date: Date;
    html_body: string | null;
    text_body: string | null;
    pdfs: any[];
    fetched_at: Date;
    source: string;
}

export const TransactionRawIMAPSchema = new mongoose.Schema(
    {
        uid: {
            type: Number,
            required: true,
            index: true,
        },
        message_id: {
            type: String,
            required: true,
            index: true,
        },
        from: {
            type: String,
            required: true,
            index: true,
        },
        subject: {
            type: String,
            required: true,
        },
        date: {
            type: Date,
            required: true,
            index: true,
        },
        html_body: {
            type: String,
            default: null,
        },
        text_body: {
            type: String,
            default: null,
        },
        pdfs: {
            type: [mongoose.Schema.Types.Mixed],
            default: [],
        },
        fetched_at: {
            type: Date,
            required: true,
            index: true,
        },
        source: {
            type: String,
            required: true,
            index: true,
        },
    },
    {
        collection: "Transaction_Raw_IMAP",
        timestamps: false,
        strict: false, // importante: tolera campos extras
    }
);

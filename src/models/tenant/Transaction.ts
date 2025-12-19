// src/models/tenant/Transaction.ts (actualizado)
import mongoose from "mongoose";

const TransactionSchema = new mongoose.Schema({
    accountId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Account",
        required: true,
        index: true,
    },
    uuid: {
        type: String,
        sparse: true
    },
    descripcion: {
        type: String,
        trim: true,
        default: ""
    },
    fecha_hora: {
        type: Date,
        index: true
    },
    fecha_hora_raw: String,
    monto: Number,
    currency: String,
    currency_raw: String,
    operation_date: String,
    process_date: String,
    operation_number: String,
    movement: String,
    channel: String,
    amount: Number,
    balance: Number,

    // ⭐ NUEVO: Metadata adicional del parser mejorado
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
        // Contendrá:
        // {
        //   yapero: string,
        //   origen: string,
        //   nombreBenef: string,
        //   cuentaBenef: string,
        //   celularBenef: string,
        //   comision: string,
        //   banco: string
        // }
    }
}, {
    timestamps: true
});

TransactionSchema.index(
    { accountId: 1, uuid: 1 },
    { unique: true, sparse: true }
);

// Índice para búsquedas por metadata
TransactionSchema.index({ "metadata.banco": 1 });
TransactionSchema.index({ "metadata.yapero": 1 });
TransactionSchema.index({ "metadata.nombreBenef": 1 });

/**
 * Collection: Transaction_Raw_<accountNumber>
 */
export function getTransactionModel(
    connection: mongoose.Connection,
    accountNumber: string
) {
    const sanitized = accountNumber.replace(/[^a-zA-Z0-9]/g, "");
    const collectionName = `Transaction_Raw_${sanitized}`;

    if (connection.models[collectionName]) {
        return connection.models[collectionName];
    }

    return connection.model(
        collectionName,
        TransactionSchema,
        collectionName
    );
}
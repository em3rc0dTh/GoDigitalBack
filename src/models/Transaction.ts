import mongoose from "mongoose";

const TransactionSchema = new mongoose.Schema(
  {
    tenantId: {
      type: String,
      index: true,
      required: true, // recomendado para multi-tenant
    },

    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      index: true,
    },

    descripcion: {
      type: String,
      trim: true,
      default: "",
    },

    fecha_hora: { type: Date },
    fecha_hora_raw: { type: String },

    monto: {
      type: Number,
      default: 0,
    },

    currency: {
      type: String,
      enum: ["PEN", "USD", "EUR", "OTRO"],
      default: "PEN",
    },

    currency_raw: { type: String },

    uuid: {
      type: String,
      index: true,
      sparse: true,
    },
  },
  { timestamps: true }
);

TransactionSchema.index(
  { tenantId: 1, accountId: 1, uuid: 1 },
  { unique: true, sparse: true }
);

export default mongoose.models.Transaction ||
  mongoose.model("Transaction", TransactionSchema);

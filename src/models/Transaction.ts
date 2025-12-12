// import mongoose from "mongoose";

// const TransactionSchema = new mongoose.Schema(
//   {
//     // ------------ MULTI TENANT ------------
//     tenantId: {
//       type: String,
//       required: true,
//       index: true,
//     },

//     accountId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "Account",
//       required: true,
//       index: true,
//     },

//     // ------------ COMMON ------------
//     uuid: {
//       type: String,
//       sparse: true,
//     },

//     descripcion: {
//       type: String,
//       trim: true,
//       default: "",
//     },

//     fecha_hora: {
//       type: Date,
//       index: true,
//     },

//     fecha_hora_raw: String,

//     monto: Number,

//     currency: {
//       type: String,
//       enum: ["PEN", "USD", "EUR", "OTRO"],
//     },

//     currency_raw: String,

//     // ------------ BUSINESS (BANCOS EMPRESA) ------------
//     operation_date: String,
//     process_date: String,
//     operation_number: String,
//     movement: String,
//     channel: String,
//     amount: Number,
//     balance: Number,
//   },
//   { timestamps: true }
// );

// TransactionSchema.index(
//   { tenantId: 1, accountId: 1, uuid: 1 },
//   { unique: true, sparse: true }
// );

// export default mongoose.models.Transaction ||
//   mongoose.model("Transaction", TransactionSchema);

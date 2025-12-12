// import mongoose from "mongoose";

// const UserSchema = new mongoose.Schema({
//   email: { type: String, required: true, unique: true },
//   passwordHash: { type: String, required: true },
//   fullName: { type: String, required: true },
//   company: { type: String, required: true },
//   tenantId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "Tenant",
//     required: true,
//     index: true,
//   },
//   role: {
//     type: String,
//     enum: ["admin", "user", "superadmin"],
//     default: "user",
//   },
// }, { timestamps: true });

// export default mongoose.model("User", UserSchema);
import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  fullName: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("User", UserSchema);
import { Router } from "express";
import User from "../models/User";
import bcrypt from "bcryptjs";

const router = Router();

function createSessionToken(email: string, fullName: string) {
  return Buffer.from(`${email}:${fullName}`).toString("base64");
}

// Signup/Login
router.post("/", async (req, res) => {
  const { action, email, password, fullName } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });

  if (action === "signup" && !fullName) return res.status(400).json({ error: "Full name required" });

  const userExists = await User.findOne({ email });

  if (action === "signup") {
    if (userExists) return res.status(400).json({ error: "User already exists" });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ email, passwordHash, fullName });
    const token = createSessionToken(email, fullName);
    res.cookie("session_token", token, { httpOnly: true, maxAge: 604800000 }); // 7 días
    return res.json({ success: true, user: { email, fullName } });
  }

  if (action === "login") {
    if (!userExists) return res.status(401).json({ error: "Invalid credentials" });
    const match = await bcrypt.compare(password, userExists.passwordHash);
    if (!match) return res.status(401).json({ error: "Invalid credentials" });
    const token = createSessionToken(userExists.email, userExists.fullName);
    res.cookie("session_token", token, { httpOnly: true, maxAge: 604800000 });
    return res.json({ success: true, user: { email: userExists.email, fullName: userExists.fullName } });
  }

  res.status(400).json({ error: "Invalid action" });
});

// Logout
router.post("/logout", (_, res) => {
  res.clearCookie("session_token");
  res.json({ success: true });
});

export default router;

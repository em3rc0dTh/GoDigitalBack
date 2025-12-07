import { Request, Response } from "express";
import User from "../models/User";
import bcrypt from "bcryptjs";

// Helper functions kept from your original code
function createSessionToken(email: string, fullName: string) {
  return Buffer.from(`${email}:${fullName}`).toString("base64");
}

async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export const authHandler = async (req: Request, res: Response) => {
  try {
    const { action, email, password, fullName } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    if (action === "login") {
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const passwordMatch = await verifyPassword(password, user.passwordHash);
      if (!passwordMatch) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const token = createSessionToken(user.email, user.fullName);

      res.cookie("session_token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 1000 * 60 * 60 * 24 * 7,
      });

      return res.json({
        success: true,
        user: { email: user.email, fullName: user.fullName },
      });
    }

    if (action === "signup") {
      if (!fullName) {
        return res.status(400).json({ error: "Full name is required for signup" });
      }

      const exists = await User.findOne({ email });
      if (exists) {
        return res.status(400).json({ error: "User already exists" });
      }

      const passwordHash = await hashPassword(password);
      const user = await User.create({
        email,
        passwordHash,
        fullName,
      });

      const token = createSessionToken(email, fullName);

      res.cookie("session_token", token, {
        httpOnly: true,
        secure: false, // lax for signup/dev as per your original code
        sameSite: "lax",
        maxAge: 1000 * 60 * 60 * 24 * 7,
      });

      return res.json({
        success: true,
        user: { email: user.email, fullName: user.fullName },
      });
    }

    return res.status(400).json({ error: "Invalid action" });

  } catch (error) {
    console.error("Auth error:", error);
    return res.status(500).json({ error: "An error occurred during authentication" });
  }
};

export const logoutHandler = (req: Request, res: Response) => {
  res.clearCookie("session_token", { path: "/" });
  return res.json({ success: true });
};
import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User";
import Tenant from "../models/Tenant";

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRES_IN = "7d";
const SALT_ROUNDS = 10;

export const authHandler = async (req: Request, res: Response) => {
  try {
    const { action, email, password, fullName } = req.body;

    if (!action || !email || !password) {
      return res.status(400).json({
        error: "action, email and password are required",
      });
    }

    if (action === "login") {
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const token = jwt.sign(
        {
          userId: user._id.toString(),
          tenantId: user.tenantId.toString(),
          email: user.email,
          fullName: user.fullName,
          role: user.role,
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );

      res.cookie("session_token", token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      return res.json({
        success: true,
        user: {
          email: user.email,
          fullName: user.fullName,
          tenantId: user.tenantId,
          role: user.role,
          token,
        },
      });
    }

    if (action === "signup") {
      if (!fullName) {
        return res.status(400).json({
          error: "Full name is required for signup",
        });
      }

      const exists = await User.findOne({ email });
      if (exists) {
        return res.status(409).json({ error: "User already exists" });
      }

      const tenant = await Tenant.create({
        name: `Workspace of ${fullName}`,
        ownerEmail: email,
      });

      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

      const user = await User.create({
        email,
        passwordHash,
        fullName,
        tenantId: tenant._id,
        role: "superadmin",
      });

      const token = jwt.sign(
        {
          userId: user._id.toString(),
          tenantId: tenant._id.toString(),
          email: user.email,
          fullName: user.fullName,
          role: user.role,
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );
      console.log(token);

      res.cookie("session_token", token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      return res.status(201).json({
        success: true,
        user: {
          email: user.email,
          fullName: user.fullName,
          tenantId: tenant._id,
          role: user.role,
          token,
        },
      });
    }

    return res.status(400).json({ error: "Invalid action" });

  } catch (err) {
    console.error("Auth error:", err);
    return res.status(500).json({
      error: "An error occurred during authentication",
    });
  }
};

export const logoutHandler = (req: Request, res: Response) => {
  res.clearCookie("session_token", { path: "/" });
  return res.json({ success: true });
};

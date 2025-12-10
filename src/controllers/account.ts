import { Request, Response } from "express";
import Account from "../models/Account";
import mongoose from "mongoose";

export const getAccounts = async (req: Request, res: Response) => {
  try {
    const docs = await Account.find().sort({ createdAt: -1 }).lean();

    const normalized = docs.map((d: any) => ({
      id: d._id.toString(),
      alias: d.alias,
      bank_name: d.bank_name,
      account_holder: d.account_holder,
      account_number: d.account_number,
      bank_account_type: d.bank_account_type,
      currency: d.currency,
      account_type: d.account_type,
      createdAt: d.createdAt,
      tx_count: d.tx_count,
      oldest: d.oldest,
      newest: d.newest,
    }));
    return res.json(normalized);
  } catch (err) {
    console.error("GET /account error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

export const createAccount = async (req: Request, res: Response) => {
  try {
    const data = req.body.account ? req.body.account : req.body;

    const doc = await Account.create(data);

    if (req.body.account) {
      return res.json({ ok: true, saved: doc });
    }
    return res.status(201).json(doc);
  } catch (err) {
    console.error("POST /account error:", err);
    return res.status(500).json({ ok: false, error: "Error saving account" });
  }
};

export const getAccountById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid account ID" });
    }

    const doc = await Account.findById(id).lean();

    if (!doc) {
      return res.status(404).json({ error: "Account not found" });
    }

    return res.json({
      id: doc._id.toString(),
      alias: doc.alias,
      bank_name: doc.bank_name,
      account_holder: doc.account_holder,
      account_number: doc.account_number,
      bank_account_type: doc.bank_account_type,
      currency: doc.currency,
      account_type: doc.account_type,
      tx_count: doc.tx_count ?? 0,
      oldest: doc.oldest ?? null,
      newest: doc.newest ?? null,
    });
  } catch (err) {
    console.error("GET /account/:id error:", err);
    return res.status(500).json({ error: "Error getting account" });
  }
};

export const updateAccount = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid account ID" });
    }

    const updated = await Account.findByIdAndUpdate(
      id,
      { $set: req.body },
      { new: true, runValidators: true, strict: false }
    );

    if (!updated) {
      return res.status(404).json({ error: "Account not found" });
    }

    return res.json({
      id: updated._id.toString(),
      alias: updated.alias,
      bank_name: updated.bank_name,
      account_holder: updated.account_holder,
      account_number: updated.account_number,
      bank_account_type: updated.bank_account_type,
      currency: updated.currency,
      account_type: updated.account_type,
      tx_count: updated.tx_count ?? 0,
      oldest: updated.oldest ?? null,
      newest: updated.newest ?? null,
      createdAt: updated.createdAt,
    });
  } catch (err) {
    console.error("PUT /account/:id error:", err);
    return res.status(500).json({ error: "Error updating account" });
  }
};

export const deleteAccount = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid account ID" });
    }

    const deleted = await Account.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ error: "Account not found" });
    }

    return res.json({ ok: true, message: "Account deleted successfully" });
  } catch (err) {
    console.error("DELETE /account/:id error:", err);
    return res.status(500).json({ error: "Error deleting account" });
  }
};


export const getAccountByTenantId = async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(tenantId)) {
      return res.status(400).json({ error: "Invalid tenant ID" });
    }

    const docs = await Account.find({ tenantId }).sort({ createdAt: -1 }).lean();

    const normalized = docs.map((d: any) => ({
      id: d._id.toString(),
      alias: d.alias,
      bank_name: d.bank_name,
      account_holder: d.account_holder,
      account_number: d.account_number,
      bank_account_type: d.bank_account_type,
      currency: d.currency,
      account_type: d.account_type,
      tx_count: d.tx_count,
      oldest: d.oldest,
      newest: d.newest,
    }));
    return res.json(normalized);
  } catch (err) {
    console.error("GET /account/:tenantId error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};  
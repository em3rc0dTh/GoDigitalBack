// src/controllers/account.ts
import { Request, Response } from "express";
import mongoose from "mongoose";
import { getAccountModel } from "../models/tenant/Account";
import { getTransactionModel } from "../models/tenant/Transaction";

export const getAccounts = async (req: Request, res: Response) => {
  try {
    if (!req.tenantDB) {
      return res.status(500).json({ error: "Tenant connection not available" });
    }

    const Account = getAccountModel(req.tenantDB);

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
    console.error("GET /accounts error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

export const createAccount = async (req: Request, res: Response) => {
  try {
    if (!req.tenantDB) {
      return res.status(500).json({ error: "Tenant connection not available" });
    }

    const Account = getAccountModel(req.tenantDB);
    const data = req.body.account || req.body;

    const newAccount = new Account(data);
    const doc = await newAccount.save();

    // 🔥 Crear colección de transacciones por número de cuenta
    const Transaction = getTransactionModel(
      req.tenantDB,
      doc.account_number
    );
    await Transaction.createCollection();

    if (req.body.account) {
      return res.json({ ok: true, saved: doc });
    }

    return res.status(201).json({
      ...doc.toObject(),
      transactionCollection: `Transaction_Raw_${doc.account_number}`,
    });
  } catch (err) {
    console.error("POST /accounts error:", err);
    return res.status(500).json({ ok: false, error: "Error saving account" });
  }
};

export const getAccountById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid account ID" });
    }

    if (!req.tenantDB) {
      return res.status(500).json({ error: "Tenant connection not available" });
    }

    const Account = getAccountModel(req.tenantDB);
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
    console.error("GET /accounts/:id error:", err);
    return res.status(500).json({ error: "Error getting account" });
  }
};

export const updateAccount = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid account ID" });
    }

    if (!req.tenantDB) {
      return res.status(500).json({ error: "Tenant connection not available" });
    }

    const Account = getAccountModel(req.tenantDB);

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
      updatedAt: updated.updatedAt,
    });
  } catch (err) {
    console.error("PUT /accounts/:id error:", err);
    return res.status(500).json({ error: "Error updating account" });
  }
};

export const deleteAccount = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid account ID" });
    }

    if (!req.tenantDB) {
      return res.status(500).json({ error: "Tenant connection not available" });
    }

    const Account = getAccountModel(req.tenantDB);

    const deleted = await Account.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ error: "Account not found" });
    }

    return res.json({ ok: true, message: "Account deleted successfully" });
  } catch (err) {
    console.error("DELETE /accounts/:id error:", err);
    return res.status(500).json({ error: "Error deleting account" });
  }
};

export async function getAccountInformationById(
  tenantDB: mongoose.Connection,
  accountId: mongoose.Types.ObjectId
) {
  const Account = getAccountModel(tenantDB);
  return Account.findById(accountId).lean();
}

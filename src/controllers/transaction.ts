// src/controllers/transaction.ts
import { Request, Response } from "express";
import mongoose from "mongoose";
import { getTransactionModel } from "../models/tenant/Transaction";
import { getAccountModel } from "../models/tenant/Account";

export const getTransactionsByAccount = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid id format" });
    }

    if (!req.tenantDB) {
      return res.status(403).json({
        error: "Database not provisioned",
        needsProvisioning: true
      });
    }

    const Account = getAccountModel(req.tenantDB);
    const account = await Account.findById(id);

    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    const Transaction = getTransactionModel(
      req.tenantDB,
      account.account_number
    );

    const docs = await Transaction.find({ accountId: id })
      .sort({ fecha_hora: -1 })
      .lean();

    return res.status(200).json(docs);
  } catch (err) {
    console.error("GET /accounts/:id/transactions error:", err);
    return res.status(500).json({ error: "Error fetching transactions" });
  }
};

export const replaceTransactions = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const body = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid id format" });
    }

    if (!body.transactions || !Array.isArray(body.transactions)) {
      return res.status(400).json({ error: "transactions array is required" });
    }

    if (!req.tenantDB) {
      return res.status(403).json({
        error: "Database not provisioned",
        needsProvisioning: true
      });
    }

    const Account = getAccountModel(req.tenantDB);
    const account = await Account.findById(id);

    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    const Transaction = getTransactionModel(
      req.tenantDB,
      account.account_number
    );

    await Transaction.deleteMany({ accountId: id });

    const inserted = await Transaction.insertMany(
      body.transactions.map((x: any) => ({
        ...x,
        accountId: id,
      }))
    );

    if (inserted.length > 0) {
      const dates = inserted
        .map(t => t.fecha_hora)
        .filter(Boolean)
        .sort();

      await Account.findByIdAndUpdate(id, {
        tx_count: inserted.length,
        oldest: dates[0] || null,
        newest: dates[dates.length - 1] || null,
      });
    }

    return res.status(200).json({
      ok: true,
      inserted: inserted.length,
      collection: `Transaction_Raw_${account.account_number}`,
    });
  } catch (err) {
    console.error("POST /accounts/:id/transactions error:", err);
    return res.status(500).json({ error: "Error saving transactions" });
  }
};

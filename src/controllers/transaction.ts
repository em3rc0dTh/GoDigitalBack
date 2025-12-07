import { Request, Response } from "express";
import Transaction from "../models/Transaction";
import mongoose from "mongoose";

export const getTransactionsByAccount = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid id format" });
    }

    const docs = await Transaction.find({ accountId: id }).sort({ fecha_hora: -1 });
    return res.status(200).json(docs);
  } catch (err) {
    console.error("GET /transactions/:id error:", err);
    return res.status(500).json({ error: "Error fetching transactions" });
  }
};

export const replaceTransactions = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const body = req.body;

    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid id format" });
    }
    if (!body.transactions || !Array.isArray(body.transactions)) {
      return res.status(400).json({ error: "transactions array is required" });
    }

    await Transaction.deleteMany({ accountId: id });

    const inserted = await Transaction.insertMany(
      body.transactions.map((x: any) => ({ ...x, accountId: id }))
    );

    return res.status(200).json({
      ok: true,
      inserted: inserted.length,
      message: `${inserted.length} transactions saved`,
    });
  } catch (err) {
    console.error("POST /transactions/:id error:", err);
    return res.status(500).json({ error: "Error saving transactions" });
  }
};
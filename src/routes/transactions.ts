import { Router } from "express";
import Transaction from "../models/Transaction";
import { connectDB } from "../config/db";

const router = Router();

// GET transactions by account
router.get("/:id", async (req, res) => {
    await connectDB();
    const { id } = req.params;
    const docs = await Transaction.find({ accountId: id }).sort({ fecha_hora: -1 });
    res.json(docs);
});

// POST replace transactions
router.post("/:id", async (req, res) => {
    await connectDB();
    const { id } = req.params;
    const { transactions } = req.body;

    await Transaction.deleteMany({ accountId: id });
    const inserted = await Transaction.insertMany(transactions.map((t: any) => ({ ...t, accountId: id })));
    res.json({ ok: true, inserted: inserted.length });
});

export default router;

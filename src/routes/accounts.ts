import { Router } from "express";
import Account from "../models/Account";
import { connectDB } from "../config/db";

const router = Router();

// GET all accounts
router.get("/", async (_, res) => {
    await connectDB();
    const docs = await Account.find().sort({ createdAt: -1 });
    const normalized = docs.map(d => ({
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
    res.json(normalized);
});

// POST create account
router.post("/", async (req, res) => {
    await connectDB();
    const data = req.body;
    const doc = await Account.create(data);
    res.json(doc);
});

// PUT update account
router.put("/:id", async (req, res) => {
    await connectDB();
    const { id } = req.params;
    const data = req.body;
    const updated = await Account.findByIdAndUpdate(id, data, { new: true });
    if (!updated) return res.status(404).json({ error: "Account not found" });
    res.json(updated);
});

// DELETE account
router.delete("/:id", async (req, res) => {
    await connectDB();
    const { id } = req.params;
    await Account.findByIdAndDelete(id);
    res.json({ ok: true });
});

export default router;

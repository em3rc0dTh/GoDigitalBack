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
      collection: `Transaction_Raw_Web_${account.account_number}`,
    });
  } catch (err) {
    console.error("POST /accounts/:id/transactions error:", err);
    return res.status(500).json({ error: "Error saving transactions" });
  }
};

// src/controllers/transactions.ts
import { getTenantDB } from '../config/tenantDb';
import getTenantDetailModel from '../models/system/TenantDetail';

/**
 * Obtener transacciones procesadas con sus referencias
 * GET /api/transactions/processed/:tenantDetailId
 */
export async function getProcessedTransactions(req: Request, res: Response) {
  try {
    const { tenantDetailId } = req.params;
    const { bank, startDate, endDate, limit = 50 } = req.query;

    const TenantDetail = await getTenantDetailModel();
    const detail = await TenantDetail.findById(tenantDetailId);

    if (!detail) {
      return res.status(404).json({ error: 'TenantDetail not found' });
    }

    const tenantConnection = await getTenantDB(
      detail.tenantId.toString(),
      detail._id.toString()
    );

    // Construir filtros
    const query: any = {};
    if (bank) query.bank = bank.toString().toUpperCase();
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate as string);
      if (endDate) query.date.$lte = new Date(endDate as string);
    }

    // Obtener transacciones procesadas con lookup
    const transactions = await tenantConnection
      .collection('transaction_raw_processed')
      .aggregate([
        { $match: query },
        { $sort: { date: -1 } },
        { $limit: parseInt(limit as string) },

        // Lookup a raw_gmail
        {
          $lookup: {
            from: 'transaction_raw_gmail',
            localField: 'rawGmailId',
            foreignField: '_id',
            as: 'rawData'
          }
        },
        { $unwind: { path: '$rawData', preserveNullAndEmptyArrays: true } },

        // Lookup a emails
        {
          $lookup: {
            from: 'emails',
            localField: 'emailId',
            foreignField: '_id',
            as: 'emailData'
          }
        },
        { $unwind: { path: '$emailData', preserveNullAndEmptyArrays: true } },

        // Proyectar campos
        {
          $project: {
            _id: 1,
            bank: 1,
            amount: 1,
            currency: 1,
            date: 1,
            description: 1,
            reference: 1,
            accountHint: 1,
            confidence: 1,
            createdAt: 1,

            // Datos del raw
            'raw.id': '$rawData._id',
            'raw.rawText': '$rawData.rawText',
            'raw.status': '$rawData.status',

            // Datos del email
            'email.id': '$emailData._id',
            'email.from': '$emailData.from',
            'email.subject': '$emailData.subject',
            'email.receivedAt': '$emailData.receivedAt',
            'email.gmailId': '$emailData.gmailId'
          }
        }
      ])
      .toArray();

    // Estadísticas
    const stats = await tenantConnection
      .collection('transaction_raw_processed')
      .aggregate([
        { $match: query },
        {
          $group: {
            _id: '$bank',
            count: { $sum: 1 },
            totalAmount: { $sum: '$amount' },
            avgConfidence: { $avg: '$confidence' }
          }
        }
      ])
      .toArray();

    res.json({
      total: transactions.length,
      transactions,
      stats
    });

  } catch (error: any) {
    console.error('Error fetching processed transactions:', error);
    res.status(500).json({
      error: 'Failed to fetch transactions',
      details: error.message
    });
  }
}

/**
 * Obtener detalles de una transacción específica
 * GET /api/transactions/detail/:tenantDetailId/:transactionId
 */
export async function getTransactionDetail(req: Request, res: Response) {
  try {
    const { tenantDetailId, transactionId } = req.params;

    const TenantDetail = await getTenantDetailModel();
    const detail = await TenantDetail.findById(tenantDetailId);

    if (!detail) {
      return res.status(404).json({ error: 'TenantDetail not found' });
    }

    const tenantConnection = await getTenantDB(
      detail.tenantId.toString(),
      detail._id.toString()
    );

    const { ObjectId } = require('mongodb');

    // Obtener transacción con todos sus lookups
    const transaction = await tenantConnection
      .collection('transaction_raw_processed')
      .aggregate([
        { $match: { _id: new ObjectId(transactionId) } },

        // Lookup a raw_gmail
        {
          $lookup: {
            from: 'transaction_raw_gmail',
            localField: 'rawGmailId',
            foreignField: '_id',
            as: 'rawData'
          }
        },
        { $unwind: '$rawData' },

        // Lookup a emails
        {
          $lookup: {
            from: 'emails',
            localField: 'emailId',
            foreignField: '_id',
            as: 'emailData'
          }
        },
        { $unwind: '$emailData' }
      ])
      .toArray();

    if (!transaction.length) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    res.json(transaction[0]);

  } catch (error: any) {
    console.error('Error fetching transaction detail:', error);
    res.status(500).json({
      error: 'Failed to fetch transaction',
      details: error.message
    });
  }
}

/**
 * Obtener transacciones raw sin procesar
 * GET /api/transactions/raw/:tenantDetailId
 */
export async function getRawTransactions(req: Request, res: Response) {
  try {
    const { tenantDetailId } = req.params;
    const { status = 'parsed' } = req.query;

    const TenantDetail = await getTenantDetailModel();
    const detail = await TenantDetail.findById(tenantDetailId);

    if (!detail) {
      return res.status(404).json({ error: 'TenantDetail not found' });
    }

    const tenantConnection = await getTenantDB(
      detail.tenantId.toString(),
      detail._id.toString()
    );

    const rawTransactions = await tenantConnection
      .collection('transaction_raw_gmail')
      .find({ status })
      .sort({ parsedAt: -1 })
      .limit(100)
      .toArray();

    res.json({
      total: rawTransactions.length,
      transactions: rawTransactions
    });

  } catch (error: any) {
    console.error('Error fetching raw transactions:', error);
    res.status(500).json({
      error: 'Failed to fetch raw transactions',
      details: error.message
    });
  }
}
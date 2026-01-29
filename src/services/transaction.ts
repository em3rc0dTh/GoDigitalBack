
import mongoose from "mongoose";
import { getTransactionModel } from "../models/tenant/Transaction";
import { getAccountModel } from "../models/tenant/Account";
import { getTenantDB } from "../config/tenantDb";
import getTenantDetailModel from "../models/system/TenantDetail";
import { ObjectId } from 'mongodb';

export class TransactionService {

    async getTransactionsByAccount(accountId: string, n: any, tenantDB: any) {
        // Validation
        if (!mongoose.Types.ObjectId.isValid(accountId)) {
            throw new Error("Invalid id format");
        }

        if (!tenantDB) {
            const error: any = new Error("Database not provisioned");
            error.status = 403;
            error.needsProvisioning = true;
            throw error;
        }

        const rawN = Number(n);
        const MAX_LIMIT = 100;
        let limit: number | undefined;

        if (Number.isInteger(rawN)) {
            if (rawN > 0) {
                limit = Math.min(rawN, MAX_LIMIT);
            } else if (rawN === 0) {
                limit = undefined; // no limit
            }
        } else {
            limit = 5; // default
        }

        const Account = getAccountModel(tenantDB);
        const account = await Account.findById(accountId);

        if (!account) {
            const error: any = new Error("Account not found");
            error.status = 404;
            throw error;
        }

        const Transaction = getTransactionModel(tenantDB, account.account_number);
        let query = Transaction.find({ accountId: accountId })
            .sort({ fecha_hora: -1 });

        if (limit !== undefined) {
            query = query.limit(limit);
        }

        return await query.lean();
    }

    async replaceTransactions(accountId: string, transactions: any[], tenantDB: any) {
        if (!mongoose.Types.ObjectId.isValid(accountId)) {
            throw new Error("Invalid id format");
        }

        if (!tenantDB) {
            const error: any = new Error("Database not provisioned");
            error.status = 403;
            error.needsProvisioning = true;
            throw error;
        }

        const Account = getAccountModel(tenantDB);
        const account = await Account.findById(accountId);

        if (!account) {
            const error: any = new Error("Account not found");
            error.status = 404;
            throw error;
        }

        const Transaction = getTransactionModel(tenantDB, account.account_number);

        await Transaction.deleteMany({ accountId: accountId });

        const inserted = await Transaction.insertMany(
            transactions.map((x: any) => ({
                ...x,
                accountId: accountId,
            }))
        );

        if (inserted.length > 0) {
            const dates = inserted
                .map(t => t.fecha_hora)
                .filter(Boolean)
                .sort();

            await Account.findByIdAndUpdate(accountId, {
                tx_count: inserted.length,
                oldest: dates[0] || null,
                newest: dates[dates.length - 1] || null,
            });
        }

        return {
            inserted: inserted.length,
            collection: `Transaction_Raw_Web_${account.account_number}`,
        };
    }

    async getProcessedTransactions(tenantDetailId: string, queryParams: any) {
        const { bank, startDate, endDate, limit = 50 } = queryParams;

        const TenantDetail = await getTenantDetailModel();
        const detail = await TenantDetail.findById(tenantDetailId);

        if (!detail) {
            const error: any = new Error("TenantDetail not found");
            error.status = 404;
            throw error;
        }

        const tenantConnection = await getTenantDB(
            detail.tenantId.toString(),
            detail._id.toString()
        );

        // Build filters
        const query: any = {};
        if (bank) query.bank = bank.toString().toUpperCase();
        if (startDate || endDate) {
            query.date = {};
            if (startDate) query.date.$gte = new Date(startDate as string);
            if (endDate) query.date.$lte = new Date(endDate as string);
        }

        const transactions = await tenantConnection
            .collection('transaction_raw_processed')
            .aggregate([
                { $match: query },
                { $sort: { date: -1 } },
                { $limit: parseInt(limit as string) },
                {
                    $lookup: {
                        from: 'transaction_raw_gmail',
                        localField: 'rawGmailId',
                        foreignField: '_id',
                        as: 'rawData'
                    }
                },
                { $unwind: { path: '$rawData', preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: 'emails',
                        localField: 'emailId',
                        foreignField: '_id',
                        as: 'emailData'
                    }
                },
                { $unwind: { path: '$emailData', preserveNullAndEmptyArrays: true } },
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
                        'raw.id': '$rawData._id',
                        'raw.rawText': '$rawData.rawText',
                        'raw.status': '$rawData.status',
                        'email.id': '$emailData._id',
                        'email.from': '$emailData.from',
                        'email.subject': '$emailData.subject',
                        'email.receivedAt': '$emailData.receivedAt',
                        'email.gmailId': '$emailData.gmailId'
                    }
                }
            ])
            .toArray();

        // Stats
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

        return {
            total: transactions.length,
            transactions,
            stats
        };
    }

    async getTransactionDetail(tenantDetailId: string, transactionId: string) {
        const TenantDetail = await getTenantDetailModel();
        const detail = await TenantDetail.findById(tenantDetailId);

        if (!detail) {
            const error: any = new Error("TenantDetail not found");
            error.status = 404;
            throw error;
        }

        const tenantConnection = await getTenantDB(
            detail.tenantId.toString(),
            detail._id.toString()
        );

        const transaction = await tenantConnection
            .collection('transaction_raw_processed')
            .aggregate([
                { $match: { _id: new ObjectId(transactionId) } },
                {
                    $lookup: {
                        from: 'transaction_raw_gmail',
                        localField: 'rawGmailId',
                        foreignField: '_id',
                        as: 'rawData'
                    }
                },
                { $unwind: '$rawData' },
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

        if (!transaction.length) throw new Error("Transaction not found");

        return transaction[0];
    }

    async getRawTransactions(tenantDetailId: string, status: string = 'parsed') {
        const TenantDetail = await getTenantDetailModel();
        const detail = await TenantDetail.findById(tenantDetailId);

        if (!detail) {
            const error: any = new Error("TenantDetail not found");
            error.status = 404;
            throw error;
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

        return {
            total: rawTransactions.length,
            transactions: rawTransactions
        };
    }
}

export const transactionService = new TransactionService();

import mongoose from "mongoose";
import { getTransactionRawModel } from "../models/tenant/TransactionRaw";

export class RecoService {
    /**
     * Ingest transactions from any source into the Unified Master Collection (Transaction_Raw).
     * Now supports smart matching to consolidate data from multiple sources.
     */
    async ingest(
        tenantId: string,
        detailId: string,
        source: 'Statement' | 'WEB' | 'API' | 'GMAIL' | 'IMAP',
        data: any[]
    ) {
        console.log(`📥 RecoService: Ingesting ${data.length} transactions from ${source}`);

        const TransactionRaw = await getTransactionRawModel(tenantId, detailId);
        let savedCount = 0;
        let errorsCount = 0;

        for (const item of data) {
            try {
                const mappedDoc = this.mapToMaster(item, source);

                // 1. Try to find a match
                const match = await this.findMatch(TransactionRaw, mappedDoc);

                if (match) {
                    console.log(`🔗 Match found for ${source} transaction (Amt: ${mappedDoc.transactionVariables.amount}, Op: ${mappedDoc.transactionVariables.operationNumber})`);

                    // 2. Update existing match
                    // Add to linkedSources
                    const linkedSourceEntry = {
                        source: source,
                        sourceId: item._id ? new mongoose.Types.ObjectId(item._id) : new mongoose.Types.ObjectId(), // Use item._id if available, else new
                        externalId: mappedDoc.externalId,
                        rawData: item, // Store full raw data as requested
                        extractedAt: new Date()
                    };

                    // Update fields if the new source is "better" or just merge info?
                    // Usually Statement > Web > API/Gmail/IMAP in terms of accuracy for dates/amounts.
                    // For now, we just append source info and maybe fill missing fields.

                    match.linkedSources.push(linkedSourceEntry);

                    // Update top level fields if currently null
                    if (!match.transactionVariables.operationNumber && mappedDoc.transactionVariables.operationNumber) {
                        match.transactionVariables.operationNumber = mappedDoc.transactionVariables.operationNumber;
                    }
                    if (!match.transactionVariables.originAccount && mappedDoc.transactionVariables.originAccount) {
                        match.transactionVariables.originAccount = mappedDoc.transactionVariables.originAccount;
                    }
                    if (!match.transactionVariables.destinationAccount && mappedDoc.transactionVariables.destinationAccount) {
                        match.transactionVariables.destinationAccount = mappedDoc.transactionVariables.destinationAccount;
                    }

                    match.matchStatus = true;
                    match.matchAt = new Date();

                    await match.save();
                    savedCount++;

                } else {
                    // 3. Create new if no match
                    mappedDoc.linkedSources = [{
                        source: source,
                        sourceId: item._id ? new mongoose.Types.ObjectId(item._id) : new mongoose.Types.ObjectId(),
                        externalId: mappedDoc.externalId,
                        rawData: item,
                        extractedAt: new Date()
                    }];

                    await TransactionRaw.create(mappedDoc);
                    savedCount++;
                }

            } catch (error: any) {
                console.error(`❌ Error processing item from ${source}:`, error);
                errorsCount++;
            }
        }

        return { saved: savedCount, errors: errorsCount, processedIds: data.map(d => d._id) };
    }

    private async findMatch(Model: any, doc: any) {
        const cleanAcc = (acc: any) => {
            if (!acc) return null;
            return String(acc).replace(/[-\sX]/g, '').trim();
        };

        const docOrigin = cleanAcc(doc.transactionVariables?.originAccount);
        const docDest = cleanAcc(doc.transactionVariables?.destinationAccount);

        const isAccountCompatible = (matchDoc: any) => {
            const matchOrigin = cleanAcc(matchDoc.transactionVariables?.originAccount);
            const matchDest = cleanAcc(matchDoc.transactionVariables?.destinationAccount);

            const checkCompat = (acc1: string | null, acc2: string | null) => {
                if (!acc1 || !acc2) return true; // Allows merging web transactions with incomplete info
                return acc1.endsWith(acc2) || acc2.endsWith(acc1);
            };

            const originCompat = checkCompat(docOrigin, matchOrigin);
            const destCompat = checkCompat(docDest, matchDest);

            if (!originCompat || !destCompat) {
                console.log(`⚠️ Match found but Account mismatch! Origin: ${originCompat}, Dest: ${destCompat}`);
            }
            return originCompat && destCompat;
        };

        const docAmount = doc.transactionVariables?.amount;
        if (docAmount == null) return null;

        const absAmount = Math.abs(docAmount);
        const amountsToMatch = [absAmount, -absAmount];
        const currency = doc.transactionVariables?.currency;

        const date = doc.transactionVariables?.operationDate ? new Date(doc.transactionVariables.operationDate) : new Date(doc.receivedAt);
        const startDate = new Date(date);
        startDate.setDate(date.getDate() - 3);
        const endDate = new Date(date);
        endDate.setDate(date.getDate() + 3);

        // Check for Idempotency (Same Source & ExternalId)
        if (doc.externalId) {
            const exactSameSourceDoc = await Model.findOne({
                "linkedSources.source": doc.source,
                "linkedSources.externalId": doc.externalId
            });
            if (exactSameSourceDoc) {
                console.log(`🔗 Idempotency Match found for ${doc.source}`);
                return exactSameSourceDoc;
            }
        }

        // Find cross-source candidates
        const query = {
            "transactionVariables.amount": { $in: amountsToMatch },
            "transactionVariables.currency": currency,
            "linkedSources.source": { $ne: doc.source }, // Only match distinct sources
            $or: [
                { "transactionVariables.operationDate": { $gte: startDate, $lte: endDate } },
                { "receivedAt": { $gte: startDate, $lte: endDate } }
            ]
        };

        const candidates = await Model.find(query).lean();

        // Find best match based on closest date
        let bestMatch = null;
        let smallestTimeDiff = Infinity;
        const docOpNum = doc.transactionVariables?.operationNumber ? String(doc.transactionVariables.operationNumber).trim() : null;

        for (const candidate of candidates) {
            if (!isAccountCompatible(candidate)) continue;

            const candOpNum = candidate.transactionVariables?.operationNumber ? String(candidate.transactionVariables.operationNumber).trim() : null;

            if (docOpNum && candOpNum) {
                const cleanDocOp = docOpNum.replace(/[^0-9]/g, '');
                const cleanCandOp = candOpNum.replace(/[^0-9]/g, '');
                // If neither is WEB and numbers conflict strictly, skip. If WEB, tolerate different OP num formats.
                if (cleanDocOp && cleanCandOp && cleanDocOp !== cleanCandOp && !cleanDocOp.includes(cleanCandOp) && !cleanCandOp.includes(cleanDocOp)) {
                    if (doc.source !== 'WEB' && !candidate.linkedSources.some((s: any) => s.source === 'WEB')) {
                        continue;
                    }
                }
            }

            const candDate = candidate.transactionVariables?.operationDate ? new Date(candidate.transactionVariables.operationDate) : new Date(candidate.receivedAt);
            const timeDiff = Math.abs(candDate.getTime() - date.getTime());

            // Pick the closest date
            if (timeDiff < smallestTimeDiff) {
                smallestTimeDiff = timeDiff;
                bestMatch = candidate;
            }
        }

        if (bestMatch) {
            return await Model.findById(bestMatch._id);
        }

        return null;
    }

    /**
     * Maps diverse input formats to the unified TransactionRaw schema
     */
    private mapToMaster(item: any, source: string): any {
        const now = new Date();
        const receivedAt = item.fecha_hora ? new Date(item.fecha_hora) : (item.receivedAt ? new Date(item.receivedAt) : now);

        const rawAmount = item.transactionVariables?.amount ?? item.amount ?? item.monto ?? null;

        let originAcc = item.transactionVariables?.originAccount || null;
        let destAcc = item.transactionVariables?.destinationAccount || item.destination_account || null;

        // For WEB, source_account is the known monitored account. 
        if (source === 'WEB' && item.source_account) {
            if (rawAmount < 0) {
                // We sent money -> Our account is origin
                originAcc = item.source_account;
            } else if (rawAmount > 0) {
                // We received money -> Our account is destination
                destAcc = item.source_account;
            } else {
                originAcc = item.source_account;
            }
        } else if (!originAcc) {
            originAcc = item.source_account || null;
        }

        return {
            source: source,
            externalId: item.fileId || item.id || null,

            // Core Date
            receivedAt: receivedAt,

            // Gmail Fields 
            gmailId: item.gmailId || null,
            messageId: item.messageId || null,
            threadId: item.threadId || null,
            historyId: item.historyId || null,
            from: item.from || null,
            subject: item.subject || null,

            // Routing
            routing: item.routing || {
                entityId: null,
                bank: null,
                accountNumber: null
            },

            // Transaction Variables
            transactionVariables: {
                originAccount: originAcc,
                destinationAccount: destAcc,
                amount: rawAmount,
                currency: (item.transactionVariables?.currency || item.currency || 'PEN').trim(),
                operationDate: item.transactionVariables?.operationDate ? new Date(item.transactionVariables.operationDate) : receivedAt,
                operationNumber: (item.transactionVariables?.operationNumber || item.operation_number) ? String(item.transactionVariables?.operationNumber || item.operation_number).trim() : null,
            },

            transactionType: item.transactionType || null,
            processed: false,
            createdAt: now,
            updatedAt: now,

            // Generate hash for safety, though smart matching handles main duplication.
            deduplicationHash: this.generateHash(item, source)
        };
    }

    private generateHash(item: any, source: string): string | null {
        // Keep hash logic but maybe less unique constraints on DB if we do manual matching?
        // Actually, we should rely on our smart match. 
        // But let's keep it to avoid exact duplicate ingestion from same source run twice.

        try {
            const id = item._id || item.id || item.messageId || item.gmailId;
            if (id) return `${source}_${id}`;

            const amount = item.transactionVariables?.amount ?? item.amount ?? item.monto ?? '0';
            const date = item.fecha_hora || item.receivedAt || Date.now();
            return `${source}_${amount}_${date}`;
        } catch (e) {
            return null;
        }
    }
}

export const recoService = new RecoService();

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

        // Helper to check account compatibility
        const isCompatible = (match: any) => {
            const incomeAcc = doc.transactionVariables.originAccount;
            const matchAcc = match.transactionVariables.originAccount;

            if (!incomeAcc || !matchAcc) return true;

            const clean1 = incomeAcc.replace(/X/g, '').trim();
            const clean2 = matchAcc.replace(/X/g, '').trim();

            if (!clean1 || !clean2) return true;

            const compatible = incomeAcc.endsWith(clean2) || matchAcc.endsWith(clean1);
            if (!compatible) {
                console.log(`⚠️ Match found but Account Number mismatch! (${incomeAcc} vs ${matchAcc})`);
            }
            return compatible;
        };

        // Strategy 1: Match by Operation Number (if available)
        const opNum = doc.transactionVariables.operationNumber;
        if (opNum) {
            const query = {
                "transactionVariables.operationNumber": opNum,
                "transactionVariables.currency": doc.transactionVariables.currency
            };
            console.log(`🔍 [Reco] DBG Query OpNum:`, JSON.stringify(query));
            const match = await Model.findOne(query);
            if (match && isCompatible(match)) return match;
        }

        // Strategy 2: Match by Amount + Date Window + Currency
        const amount = doc.transactionVariables.amount;
        const currency = doc.transactionVariables.currency;
        const date = new Date(doc.receivedAt);

        if (amount) {
            const startDate = new Date(date);
            startDate.setDate(date.getDate() - 3);
            const endDate = new Date(date);
            endDate.setDate(date.getDate() + 3);

            const amountsToMatch = [amount, -amount];

            const query = {
                "transactionVariables.amount": { $in: amountsToMatch },
                "transactionVariables.currency": currency,
                "receivedAt": { $gte: startDate, $lte: endDate },
                "linkedSources.source": { $ne: doc.source }
            };
            console.log(`🔍 [Reco] DBG Query Amount:`, JSON.stringify(query));

            const match = await Model.findOne(query);
            if (match && isCompatible(match)) return match;
        }

        return null;
    }

    /**
     * Maps diverse input formats to the unified TransactionRaw schema
     */
    private mapToMaster(item: any, source: string): any {
        const now = new Date();
        const receivedAt = item.fecha_hora ? new Date(item.fecha_hora) : (item.receivedAt ? new Date(item.receivedAt) : now);

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
                originAccount: item.transactionVariables?.originAccount || item.source_account || null,
                destinationAccount: item.transactionVariables?.destinationAccount || item.destination_account || null,
                amount: item.transactionVariables?.amount ?? item.amount ?? item.monto ?? null,
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

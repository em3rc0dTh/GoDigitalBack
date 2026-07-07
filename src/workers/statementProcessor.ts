import cron from 'node-cron';
import { getStatementUploadTaskModel } from '../models/tenant/StatementUploadTask';
import { statementService } from '../services/statement';
import getTenantDetailModel from '../models/system/TenantDetail';

let isProcessing = false;

// Run every 10 seconds to check for new tasks
cron.schedule('*/10 * * * * *', async () => {
    if (isProcessing) return; // Prevent overlapping runs
    isProcessing = true;

    try {
        // Iterate through all tenants to find pending tasks.
        // In a highly optimized architecture, we would have a system-level queue,
        // but since we are keeping it simple, we check tenant by tenant, or just query active ones.
        
        const TenantDetail = await getTenantDetailModel();
        const activeTenants = await TenantDetail.find({}); // You might want to filter active ones only

        for (const tenant of activeTenants) {
            if (!tenant.dbName || !tenant.tenantId) continue;
            
            const detailId = tenant._id.toString();
            const tenantId = tenant.tenantId.toString();
            
            const StatementUploadTask = await getStatementUploadTaskModel(tenantId, detailId);

            // Find oldest pending task
            const task = await StatementUploadTask.findOneAndUpdate(
                { status: 'pending' },
                { status: 'processing', updatedAt: new Date() },
                { sort: { createdAt: 1 }, new: true }
            );

            if (task) {
                console.log(`[Worker] Picked up statement task: ${task.fileName} for tenant ${tenantId}`);
                try {
                    // Process the PDF
                    await statementService.processPdfStatement(
                        task.fileBuffer,
                        task.fileName,
                        task.entityId,
                        tenantId
                    );

                    // Mark completed
                    await StatementUploadTask.updateOne(
                        { _id: task._id },
                        { status: 'completed', updatedAt: new Date() }
                    );
                    console.log(`[Worker] Successfully processed task: ${task.fileName}`);
                } catch (err: any) {
                    console.error(`[Worker] Failed task ${task.fileName}:`, err);
                    await StatementUploadTask.updateOne(
                        { _id: task._id },
                        { 
                            status: 'failed', 
                            error: err.message || 'Unknown error',
                            updatedAt: new Date()
                        }
                    );
                }
            }
        }
    } catch (err) {
        console.error('[Worker] Fatal error in statement processor cron:', err);
    } finally {
        isProcessing = false;
    }
});

console.log('[Worker] Statement processor cron job initialized.');

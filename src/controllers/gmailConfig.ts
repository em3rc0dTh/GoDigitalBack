
import { Request, Response } from 'express';
import { gmailManagementService } from '../services/gmail/management';

export class GmailConfigController {

    async createConfig(req: Request, res: Response) {
        try {
            const { entityId, forwardingData } = req.body;

            // Validación básica
            if (!entityId) {
                return res.status(400).json({ error: "entityId is required" });
            }

            if (!forwardingData || !Array.isArray(forwardingData)) {
                return res.status(400).json({ error: "forwardingData must be an array" });
            }

            const config = await gmailManagementService.createOrUpdateConfig(entityId, forwardingData);

            res.json({
                success: true,
                message: "Forwarding config created/updated",
                config: {
                    id: config._id,
                    entityId: config.entityId,
                    forwardingData: config.forwardingData,
                    active: config.active
                }
            });

        } catch (error: any) {
            console.error("Error creating forwarding config:", error);
            res.status(500).json({
                error: "Failed to create forwarding config",
                details: error.message
            });
        }
    }

    async getConfigByEntity(req: Request, res: Response) {
        try {
            const { entityId } = req.params;
            const config = await gmailManagementService.getConfigByEntity(entityId);

            if (!config) {
                return res.status(404).json({
                    error: "No forwarding config found for this entity"
                });
            }

            res.json({
                success: true,
                config: {
                    id: config._id,
                    entityId: config.entityId,
                    forwardingData: config.forwardingData,
                    active: config.active,
                    createdAt: config.createdAt,
                    updatedAt: config.updatedAt
                }
            });

        } catch (error: any) {
            console.error("Error fetching forwarding config:", error);
            res.status(500).json({
                error: "Failed to fetch forwarding config",
                details: error.message
            });
        }
    }

    async listConfigs(req: Request, res: Response) {
        try {
            const configs = await gmailManagementService.listConfigs();

            res.json({
                success: true,
                count: configs.length,
                configs: configs.map(c => ({
                    id: c._id,
                    entityId: c.entityId,
                    forwardingData: c.forwardingData,
                    active: c.active,
                    createdAt: c.createdAt
                }))
            });

        } catch (error: any) {
            console.error("Error listing forwarding configs:", error);
            res.status(500).json({
                error: "Failed to list forwarding configs",
                details: error.message
            });
        }
    }

    async toggleConfig(req: Request, res: Response) {
        try {
            const { entityId } = req.params;
            const config = await gmailManagementService.toggleConfig(entityId);

            if (!config) {
                return res.status(404).json({
                    error: "No forwarding config found"
                });
            }

            res.json({
                success: true,
                message: `Config ${config.active ? 'activated' : 'deactivated'}`,
                active: config.active
            });

        } catch (error: any) {
            console.error("Error toggling forwarding config:", error);
            res.status(500).json({
                error: "Failed to toggle forwarding config",
                details: error.message
            });
        }
    }

    async deleteConfig(req: Request, res: Response) {
        try {
            const { entityId } = req.params;
            const result = await gmailManagementService.deleteConfig(entityId);

            if (!result) {
                return res.status(404).json({
                    error: "No forwarding config found"
                });
            }

            res.json({
                success: true,
                message: "Forwarding config deleted"
            });

        } catch (error: any) {
            console.error("Error deleting forwarding config:", error);
            res.status(500).json({
                error: "Failed to delete forwarding config",
                details: error.message
            });
        }
    }

    async testMatch(req: Request, res: Response) {
        try {
            const { from, subject } = req.body;

            if (!from) {
                return res.status(400).json({ error: "from is required" });
            }

            const result = await gmailManagementService.testMatch(from, subject);

            res.json({
                success: true,
                input: { from, subject },
                result: {
                    matched: result.matched,
                    entityId: result.entityId?.toString(),
                    bank: result.bank,
                    accountNumber: result.accountNumber
                }
            });

        } catch (error: any) {
            console.error("Error testing match:", error);
            res.status(500).json({
                error: "Failed to test match",
                details: error.message
            });
        }
    }

    async getRawEmails(req: Request, res: Response) {
        try {
            const limit = parseInt(req.query.limit as string) || 20;
            const entityId = req.query.entityId as string;
            const matched = req.query.matched as string;

            const emails = await gmailManagementService.getRawEmails(limit, entityId, matched);

            res.json({
                success: true,
                count: emails.length,
                emails: emails.map(e => ({
                    id: e._id,
                    gmailId: e.gmailId,
                    from: e.from,
                    subject: e.subject,
                    receivedAt: e.receivedAt,
                    routing: e.routing,
                    processed: e.processed,
                    error: e.error,
                    createdAt: e.createdAt
                }))
            });

        } catch (error: any) {
            console.error("Error fetching raw emails:", error);
            res.status(500).json({
                error: "Failed to fetch raw emails",
                details: error.message
            });
        }
    }

    async getRawEmailDetail(req: Request, res: Response) {
        try {
            const { gmailId } = req.params;
            const email = await gmailManagementService.getRawEmailById(gmailId);

            if (!email) {
                return res.status(404).json({
                    error: "Email not found in System.Email.Raw"
                });
            }

            res.json({
                success: true,
                email
            });

        } catch (error: any) {
            console.error("Error fetching email detail:", error);
            res.status(500).json({
                error: "Failed to fetch email detail",
                details: error.message
            });
        }
    }

    async getMatchingStats(req: Request, res: Response) {
        try {
            const stats = await gmailManagementService.getMatchingStats();
            res.json({
                success: true,
                stats
            });
        } catch (error: any) {
            console.error("Error fetching stats:", error);
            res.status(500).json({
                error: "Failed to fetch stats",
                details: error.message
            });
        }
    }

    async fetchEmailsManual(req: Request, res: Response) {
        try {
            const { maxResults = 100000, idFetching } = req.body;

            if (!idFetching) {
                return res.status(400).json({ error: "idFetching is required" });
            }

            const result = await gmailManagementService.fetchEmailsManual(idFetching, maxResults);
            res.json(result);

        } catch (error: any) {
            console.error("❌ fetch-emails error:", error);
            res.status(500).json({
                error: "Failed to fetch emails",
                details: error.message
            });
        }
    }

    async processHistoryManual(req: Request, res: Response) {
        try {
            const { tenantDetailId } = req.params;
            console.log(`📧 Processing history for tenant: ${tenantDetailId}`);

            const result = await gmailManagementService.processHistoryManual(tenantDetailId);

            res.json({
                success: true,
                message: "History processed successfully",
                ...result
            });

        } catch (error: any) {
            console.error("❌ Error processing history:", error);
            res.status(500).json({
                error: "Failed to process history",
                details: error.message
            });
        }
    }

    async getEmailsList(req: Request, res: Response) {
        try {
            const { entityId } = req.params;

            const result = await gmailManagementService.getEmailsList(entityId);

            res.json({
                success: true,
                count: result.emails.length,
                total: result.total,
                emails: result.emails
            });

        } catch (error: any) {
            console.error("❌ Error listing emails:", error);
            res.status(500).json({
                error: "Failed to list emails",
                details: error.message
            });
        }
    }

    async reconcileEmails(req: Request, res: Response) {
        try {
            const { entityId } = req.params;
            const result = await gmailManagementService.reconcileEmails(entityId);
            res.json(result);
        } catch (error: any) {
            console.error(error);
            res.status(500).json({ message: "Error en reconcile" });
        }
    }

    async getWatchStatus(req: Request, res: Response) {
        try {
            const { tenantDetailId } = req.params;
            const status = await gmailManagementService.getWatchStatus(tenantDetailId);

            if (!status) {
                return res.status(404).json({
                    error: "No Gmail watch found for this tenant"
                });
            }

            res.json({
                success: true,
                watch: status
            });
        } catch (error: any) {
            console.error("❌ Error fetching watch status:", error);
            res.status(500).json({
                error: "Failed to fetch watch status",
                details: error.message
            });
        }
    }

    async listWatches(req: Request, res: Response) {
        try {
            const watches = await gmailManagementService.listWatches();
            res.json({
                success: true,
                count: watches.length,
                watches
            });
        } catch (error: any) {
            console.error("❌ Error listing watches:", error);
            res.status(500).json({
                error: "Failed to list watches",
                details: error.message
            });
        }
    }
}

export const gmailConfigController = new GmailConfigController();

// src/routes/routes.ts
import { Router } from "express";
import * as AccountController from "../controllers/account";
import * as TxController from "../controllers/transaction";
import * as AuthController from "../controllers/auth";
import { tenantContext } from "../middleware/tenantContext";

const router = Router();

router.post("/users", AuthController.authHandler);
router.post("/logout", AuthController.logoutHandler);
router.get("/logout", AuthController.logoutHandler);

router.use(tenantContext);

router.get("/tenants/:id", AuthController.getTenantHandler);
router.put("/tenants/:id", AuthController.updateTenantHandler);
router.post("/tenants/:id/provision", AuthController.provisionDatabaseHandler);
router.get("/tenant-details/:detailId", AuthController.getTenantDetailHandler);
router.put("/tenant-details/:detailId", AuthController.updateTenantDetailHandler);
router.get("/tenants/details/:id", AuthController.getTenantsListWithDetails);

router.get("/accounts", AccountController.getAccounts);
router.post("/accounts", AccountController.createAccount);
router.put("/accounts/:id", AccountController.updateAccount);
router.delete("/accounts/:id", AccountController.deleteAccount);
router.get("/accounts/:id", AccountController.getAccountById);

router.get("/accounts/:id/transactions", TxController.getTransactionsByAccount);
router.post("/accounts/:id/transactions", TxController.replaceTransactions);

// 🆕 Rutas de transacciones procesadas
router.get('/transactions/processed/:tenantDetailId', TxController.getProcessedTransactions);
router.get('/transactions/detail/:tenantDetailId/:transactionId', TxController.getTransactionDetail);
router.get('/transactions/raw/:tenantDetailId', TxController.getRawTransactions);

export default router;
import { Router } from "express";
import * as AccountController from "../controllers/account";
import * as TxController from "../controllers/transaction";
import * as AuthController from "../controllers/auth";

const router = Router();

router.post("/users", AuthController.authHandler);
router.post("/logout", AuthController.logoutHandler);
router.get("/logout", AuthController.logoutHandler);

router.get("/accounts", AccountController.getAccounts);
router.post("/accounts", AccountController.createAccount);
router.put("/accounts/:id", AccountController.updateAccount);
router.delete("/accounts/:id", AccountController.deleteAccount);
router.get("/accounts/:id", AccountController.getAccountById);
router.get("/accounts/tenant/:tenantId", AccountController.getAccountByTenantId);

router.get("/accounts/:id/transactions", TxController.getTransactionsByAccount);
router.post("/accounts/:id/transactions", TxController.replaceTransactions);

export default router;
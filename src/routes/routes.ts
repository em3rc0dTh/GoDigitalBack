// src/routes/routes.ts
import { Router } from "express";
import * as AccountController from "../controllers/account";
import * as TxController from "../controllers/transaction";
import * as AuthController from "../controllers/auth";
import { tenantContext } from "../middleware/tenantContext";
import * as RolesController from "../controllers/roles";
import * as PermissionsController from "../controllers/permissions";
import statementRoutes from "./statement";
import reconcileRoutes from "./reconcile";

const router = Router();

// Auth Routes
router.post("/users", AuthController.authHandler); // Legacy support
router.post("/auth/login", AuthController.loginHandler);
router.post("/auth/google", AuthController.googleLoginHandler); // 🆕 Google Login
router.post("/auth/signup", AuthController.signupHandler);
router.post("/auth/forgot-password", AuthController.forgotPasswordHandler);
router.post("/auth/reset-password", AuthController.resetPasswordHandler);

router.post("/logout", AuthController.logoutHandler);
router.get("/logout", AuthController.logoutHandler);
router.post("/verify-email", AuthController.verifyEmailHandler);
router.post("/auth/resend-verification", AuthController.resendVerificationHandler);
router.use(tenantContext);

// Roles Management
router.get("/roles", RolesController.listRoles);
router.get("/roles/:id", RolesController.getRoleById);
router.post("/roles", RolesController.createRole);
router.put("/roles/:id", RolesController.updateRole);
router.delete("/roles/:id", RolesController.deleteRole);

// Permissions Management
router.get("/permissions", PermissionsController.listPermissions);
router.get("/permissions/:id", PermissionsController.getPermissionById);
router.post("/permissions", PermissionsController.createPermission);
router.put("/permissions/:id", PermissionsController.updatePermission);
router.delete("/permissions/:id", PermissionsController.deletePermission);

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

// Statements
router.use("/statements", statementRoutes);

// Reconcile 
router.use("/reconcile/:tenantDetailId", reconcileRoutes);

export default router;
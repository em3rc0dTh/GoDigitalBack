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
import formRoutes from "./formSchema";
import * as EntityController from "../controllers/entity";
import * as ProjectController from "../controllers/project";
import * as PurchaseOrderController from "../controllers/purchaseOrder";
import * as PaymentRequestController from "../controllers/paymentRequest";
import * as BusinessUnitController from "../controllers/businessUnit";

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

// Forms
router.use("/forms", formRoutes);
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

// Entities
router.get("/entities/providers", EntityController.getProviders); // Explicit providers endpoint
router.get("/entities", EntityController.getEntities);
router.post("/entities", EntityController.createEntity);
router.get("/entities/:id", EntityController.getEntityById);
router.put("/entities/:id", EntityController.updateEntity);
router.delete("/entities/:id", EntityController.deleteEntity);

// Projects
router.get("/projects", ProjectController.getProjects);
router.post("/projects", ProjectController.createProject);
router.get("/projects/:id", ProjectController.getProjectById);
router.put("/projects/:id", ProjectController.updateProject);
router.delete("/projects/:id", ProjectController.deleteProject);

// Purchase Orders
router.get("/purchase-orders", PurchaseOrderController.getPurchaseOrders);
router.post("/purchase-orders", PurchaseOrderController.createPurchaseOrder);
router.get("/purchase-orders/:id", PurchaseOrderController.getPurchaseOrderById);
router.put("/purchase-orders/:id", PurchaseOrderController.updatePurchaseOrder);
router.delete("/purchase-orders/:id", PurchaseOrderController.deletePurchaseOrder);

// Payment Requests
// Payment Requests
router.get("/payment-requests", PaymentRequestController.getPaymentRequests);
router.post("/payment-requests", PaymentRequestController.createPaymentRequest);

// ✅ SPECIFIC routes FIRST (before :id routes)
router.put("/payment-requests/:id/approve", PaymentRequestController.approvePaymentRequest);
router.put("/payment-requests/:id/authorize", PaymentRequestController.authorizePaymentRequest);
router.put("/payment-requests/:id/pay", PaymentRequestController.payPaymentRequest);
router.put("/payment-requests/:id/reject", PaymentRequestController.rejectPaymentRequest);

// ✅ GENERIC routes LAST
router.get("/payment-requests/:id", PaymentRequestController.getPaymentRequestById);
router.put("/payment-requests/:id", PaymentRequestController.updatePaymentRequest);
router.delete("/payment-requests/:id", PaymentRequestController.deletePaymentRequest);

// 🆕 Rutas de transacciones procesadas
router.get('/transactions/processed/:tenantDetailId', TxController.getProcessedTransactions);
router.get('/transactions/detail/:tenantDetailId/:transactionId', TxController.getTransactionDetail);
router.get('/transactions/raw/:tenantDetailId', TxController.getRawTransactions);

// Business Units
router.get("/business-units", BusinessUnitController.getBusinessUnits);
router.post("/business-units", BusinessUnitController.createBusinessUnit);
router.get("/business-units/:id", BusinessUnitController.getBusinessUnitById);
router.put("/business-units/:id", BusinessUnitController.updateBusinessUnit);
router.delete("/business-units/:id", BusinessUnitController.deleteBusinessUnit);

// Statements
router.use("/statements", statementRoutes);

// Reconcile 
router.use("/reconcile/:tenantDetailId", reconcileRoutes);

export default router;
// src/routes/routes.ts
import { Router } from "express";
import * as AccountController from "../controllers/account";
import * as TxController from "../controllers/transaction";
import * as AuthController from "../controllers/auth";
import { tenantContext, authContext } from "../middleware/tenantContext";
import { checkPermission } from "../middleware/rbac"; // 🆕
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
import * as CashRequestController from "../controllers/cashRequest";
import * as FileController from "../controllers/file";
import * as MemberController from "../controllers/member";
import multer from "multer";

const router = Router();

// Auth Routes (Public or authContext)
router.post("/users", AuthController.authHandler); 
router.post("/auth/login", AuthController.loginHandler);
router.post("/auth/google", AuthController.googleLoginHandler); 
router.post("/auth/signup", AuthController.signupHandler);
router.post("/auth/forgot-password", AuthController.forgotPasswordHandler);
router.post("/auth/reset-password", AuthController.resetPasswordHandler);

router.post("/logout", AuthController.logoutHandler);
router.get("/logout", AuthController.logoutHandler);
router.post("/verify-email", AuthController.verifyEmailHandler);
router.post("/auth/resend-verification", AuthController.resendVerificationHandler);
router.get("/auth/workspaces", authContext, AuthController.listWorkspacesHandler);
router.post("/auth/select-workspace", authContext, AuthController.selectWorkspaceHandler);

// Forms
router.use("/forms", formRoutes);

// --- PROTECTED ROUTES (Tenant Context Required) ---
router.use(tenantContext);

// Roles Management
router.get("/roles", checkPermission("roles:view"), RolesController.listRoles);
router.get("/roles/:id", checkPermission("roles:view"), RolesController.getRoleById);
router.post("/roles", checkPermission("roles:manage"), RolesController.createRole);
router.put("/roles/:id", checkPermission("roles:manage"), RolesController.updateRole);
router.delete("/roles/:id", checkPermission("roles:manage"), RolesController.deleteRole);

// Permissions Management
router.get("/permissions", checkPermission("roles:view"), PermissionsController.listPermissions);
router.get("/permissions/:id", checkPermission("roles:view"), PermissionsController.getPermissionById);
router.post("/permissions", checkPermission("roles:manage"), PermissionsController.createPermission);
router.put("/permissions/:id", checkPermission("roles:manage"), PermissionsController.updatePermission);
router.delete("/permissions/:id", checkPermission("roles:manage"), PermissionsController.deletePermission);

// Tenant Management
router.get("/tenants/:id", checkPermission("tenant:view"), AuthController.getTenantHandler);
router.put("/tenants/:id", checkPermission("tenant:manage"), AuthController.updateTenantHandler);
router.post("/tenants/:id/provision", checkPermission("tenant:manage"), AuthController.provisionDatabaseHandler);
router.get("/tenant-details/:detailId", checkPermission("tenant:view"), AuthController.getTenantDetailHandler);
router.put("/tenant-details/:detailId", checkPermission("tenant:manage"), AuthController.updateTenantDetailHandler);
router.get("/tenants/details/:id", checkPermission("tenant:view"), AuthController.getTenantsListWithDetails);

// Members Management
router.get("/members", checkPermission("members:view"), MemberController.listMembers);
router.post("/members/invite", checkPermission("members:manage"), MemberController.inviteMember);
router.put("/members/:id", checkPermission("members:manage"), MemberController.updateMember);
router.delete("/members/:id", checkPermission("members:manage"), MemberController.removeMember);

// Accounts
router.get("/accounts", checkPermission("accounts:view"), AccountController.getAccounts);
router.post("/accounts", checkPermission("accounts:manage"), AccountController.createAccount);
router.put("/accounts/:id", checkPermission("accounts:manage"), AccountController.updateAccount);
router.delete("/accounts/:id", checkPermission("accounts:manage"), AccountController.deleteAccount);
router.get("/accounts/:id", checkPermission("accounts:view"), AccountController.getAccountById);

// Transactions
router.get("/accounts/:id/transactions", checkPermission("accounts:view"), TxController.getTransactionsByAccount);
router.post("/accounts/:id/transactions", checkPermission("accounts:manage"), TxController.replaceTransactions);
router.get("/accounts/bu/:businessUnitId", checkPermission("accounts:view"), AccountController.getAccountsByBusinessUnit);

// Entities (Providers/Customers)
router.get("/entities/providers", checkPermission("entities:view"), EntityController.getProviders);
router.get("/entities", checkPermission("entities:view"), EntityController.getEntities);
router.post("/entities", checkPermission("entities:manage"), EntityController.createEntity);
router.get("/entities/:id", checkPermission("entities:view"), EntityController.getEntityById);
router.put("/entities/:id", checkPermission("entities:manage"), EntityController.updateEntity);
router.delete("/entities/:id", checkPermission("entities:manage"), EntityController.deleteEntity);

// Projects
router.get("/projects", checkPermission("projects:view"), ProjectController.getProjects);
router.post("/projects", checkPermission("projects:manage"), ProjectController.createProject);
router.get("/projects/:id", checkPermission("projects:view"), ProjectController.getProjectById);
router.put("/projects/:id", checkPermission("projects:manage"), ProjectController.updateProject);
router.delete("/projects/:id", checkPermission("projects:manage"), ProjectController.deleteProject);

// Purchase Orders
router.get("/purchase-orders", checkPermission("projects:view"), PurchaseOrderController.getPurchaseOrders);
router.post("/purchase-orders", checkPermission("projects:manage"), PurchaseOrderController.createPurchaseOrder);
router.get("/purchase-orders/:id", checkPermission("projects:view"), PurchaseOrderController.getPurchaseOrderById);
router.put("/purchase-orders/:id", checkPermission("projects:manage"), PurchaseOrderController.updatePurchaseOrder);
router.delete("/purchase-orders/:id", checkPermission("projects:manage"), PurchaseOrderController.deletePurchaseOrder);

// Payment Requests
router.get("/payment-requests", checkPermission("payment_req:view"), PaymentRequestController.getPaymentRequests);
router.post("/payment-requests", checkPermission("payment_req:create"), PaymentRequestController.createPaymentRequest);

// ✅ SPECIFIC routes FIRST
router.put("/payment-requests/:id/approve", checkPermission("payment_req:authorize"), PaymentRequestController.approvePaymentRequest);
router.put("/payment-requests/:id/authorize", checkPermission("payment_req:authorize"), PaymentRequestController.authorizePaymentRequest);
router.put("/payment-requests/:id/pay", checkPermission("payment_req:pay"), PaymentRequestController.payPaymentRequest);
router.put("/payment-requests/:id/reject", checkPermission("payment_req:authorize"), PaymentRequestController.rejectPaymentRequest);

router.get("/payment-requests/:id", checkPermission("payment_req:view"), PaymentRequestController.getPaymentRequestById);
router.put("/payment-requests/:id", checkPermission("payment_req:create"), PaymentRequestController.updatePaymentRequest);
router.delete("/payment-requests/:id", checkPermission("payment_req:authorize"), PaymentRequestController.deletePaymentRequest);
router.get("/payment-requests/:id/workflow-status", checkPermission("payment_req:view"), PaymentRequestController.getPaymentRequestWorkflowStatus);

// Transactions processed (Tesorero/Payor)
router.get('/transactions/processed/:tenantDetailId', checkPermission("banks:view_raw"), TxController.getProcessedTransactions);
router.get('/transactions/detail/:tenantDetailId/:transactionId', checkPermission("banks:view_raw"), TxController.getTransactionDetail);
router.get('/transactions/raw/:tenantDetailId', checkPermission("banks:view_raw"), TxController.getRawTransactions);

// Business Units
router.get("/business-units", checkPermission("tenant:view"), BusinessUnitController.getBusinessUnits);
router.post("/business-units", checkPermission("tenant:manage"), BusinessUnitController.createBusinessUnit);
router.get("/business-units/:id", checkPermission("tenant:view"), BusinessUnitController.getBusinessUnitById);
router.put("/business-units/:id", checkPermission("tenant:manage"), BusinessUnitController.updateBusinessUnit);
router.delete("/business-units/:id", checkPermission("tenant:manage"), BusinessUnitController.deleteBusinessUnit);

// Cash Requests
router.get("/cash-requests", checkPermission("payment_req:view"), CashRequestController.getCashRequests);
router.post("/cash-requests", checkPermission("payment_req:create"), CashRequestController.createCashRequest);

router.put("/cash-requests/:id/approve", checkPermission("payment_req:authorize"), CashRequestController.approveCashRequest);
router.put("/cash-requests/:id/authorize", checkPermission("payment_req:authorize"), CashRequestController.authorizeCashRequest);
router.put("/cash-requests/:id/pay", checkPermission("payment_req:pay"), CashRequestController.payCashRequest);
router.put("/cash-requests/:id/submit-expense", checkPermission("payment_req:create"), CashRequestController.submitExpense);
router.post("/cash-requests/:id/add-expense-ai", checkPermission("payment_req:create"), multer({ storage: multer.memoryStorage() }).single('file'), CashRequestController.addExpenseItemAI);
router.put("/cash-requests/:id/review", checkPermission("proof:review"), CashRequestController.reviewCashRequest);
router.put("/cash-requests/:id/close", checkPermission("proof:review"), CashRequestController.closeCashRequest);
router.put("/cash-requests/:id/reject", checkPermission("payment_req:authorize"), CashRequestController.rejectCashRequest);
router.put("/cash-requests/:id/internal-status", checkPermission("payment_req:authorize"), CashRequestController.internalStatusUpdate);
router.get("/cash-requests/:id/workflow-status", checkPermission("payment_req:view"), CashRequestController.getCashRequestWorkflowStatus);

router.get("/cash-requests/:id", checkPermission("payment_req:view"), CashRequestController.getCashRequestById);
router.put("/cash-requests/:id", checkPermission("payment_req:create"), CashRequestController.updateCashRequest);
router.delete("/cash-requests/:id", checkPermission("payment_req:authorize"), CashRequestController.deleteCashRequest);

// Files (Tenant bounded)
router.post("/files", checkPermission("proof:upload"), FileController.uploadFile);
router.get("/files/:id", authContext, FileController.downloadFile);

// Statements
router.use("/statements", statementRoutes); // Interior routes are controlled in statement.ts

// Reconcile 
router.use("/reconcile/:tenantDetailId", checkPermission("reconcile:manage"), reconcileRoutes);

export default router;
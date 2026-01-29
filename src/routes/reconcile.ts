
import { Router } from "express";
import { reconcileAll } from "../controllers/reconcile";

const router = Router({ mergeParams: true });

// Trigger full reconciliation for a tenant detail
router.post("/", reconcileAll);
router.get("/", reconcileAll); // Allow GET for easier manual triggering if needed

export default router;

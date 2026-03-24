
import { Router } from "express";
import { upload, uploadStatement, getStatements, getStatementTransactions } from "../controllers/statement";

const router = Router();

// GET /api/statements - List all processed statements
router.get("/", getStatements);

// GET /api/statements/:fileId - Get transactions for a specific statement
router.get("/:fileId", getStatementTransactions);

// POST /api/statements/upload - Process a new PDF statement
// Requires 'file' field in multipart/form-data
router.post("/upload", upload.single("file"), uploadStatement);

export default router;

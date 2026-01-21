
import { Router } from "express";
import { upload, uploadStatement } from "../controllers/statement";

const router = Router();

// POST /api/statements/upload
// Requires 'file' field in multipart/form-data
router.post("/upload", upload.single("file"), uploadStatement);

export default router;

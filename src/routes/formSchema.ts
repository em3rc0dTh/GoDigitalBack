import { Router } from "express";
import * as FormSchemaController from "../controllers/FormSchemaController";

const router = Router();

router.post("/", FormSchemaController.createFormSchema);
router.get("/", FormSchemaController.listFormSchemas);
router.get("/:id", FormSchemaController.getFormSchemaById);
router.get("/name/:name", FormSchemaController.getFormSchemaByName);
router.put("/:id", FormSchemaController.updateFormSchema);

export default router;

import { Router } from 'express';
import * as OdooController from '../controllers/odooController';
import { authContext } from '../middleware/tenantContext';

const router = Router();

// Secure all Odoo routes with authContext
router.use(authContext);

router.get('/entities', OdooController.getEntities);
router.get('/orders', OdooController.getOrders);
router.get('/orders/create-data', OdooController.getOrderFormData);
router.get('/orders/:id', OdooController.getOrderDetails);
router.put('/orders/:id/confirm', OdooController.confirmOrder);
router.post('/orders', OdooController.createOrder);
router.get('/orders/:id/pdf', OdooController.downloadOrderPdf);

export default router;


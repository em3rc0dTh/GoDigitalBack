
import { Request, Response } from 'express';
import OdooService from '../services/odooService';

export const getEntities = async (req: Request, res: Response) => {
    try {
        const companies = await OdooService.searchCompanies();
        const partners = await OdooService.searchPartners();
        res.json({ companies, partners });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getOrders = async (req: Request, res: Response) => {
    try {
        const orders = await OdooService.getPurchaseOrders();
        res.json(orders);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getOrderDetails = async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id);
        const order = await OdooService.getPurchaseOrder(id);
        if (!order) {
            res.status(404).json({ error: "Order not found" });
        } else {
            res.json(order);
        }
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const confirmOrder = async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id);
        await OdooService.confirmOrder(id);
        res.json({ success: true, message: "Order confirmed" });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const createOrder = async (req: Request, res: Response) => {
    try {
        const { partner_id, company_id, product_id, qty, price } = req.body;
        const newId = await OdooService.createOrder({ partner_id, company_id, product_id, qty, price });
        res.json({ success: true, id: newId });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getOrderFormData = async (req: Request, res: Response) => {
    try {
        const companies = await OdooService.searchCompanies();
        const partners = await OdooService.searchPartners(); // Can filter for suppliers here if needed
        const products = await OdooService.getProducts();
        res.json({ companies, partners, products });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}

export const downloadOrderPdf = async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id);
        const pdfBuffer = await OdooService.generatePdf(id);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=PO_${id}.pdf`);
        res.send(pdfBuffer);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};


import xmlrpc from 'xmlrpc';
import { OdooConfig } from '../config/odoo';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

interface OdooPurchaseOrder {
    id: number;
    name: string;
    partner_id: [number, string];
    company_id: [number, string];
    date_order: string;
    amount_total: number;
    state: string;
    order_line: number[];
    lines?: OdooOrderLine[]; // Hydrated lines
}

interface OdooOrderLine {
    id: number;
    product_id: [number, string];
    name: string;
    product_qty: number;
    price_unit: number;
    price_subtotal: number;
}

class OdooService {
    private common: xmlrpc.Client;
    private object: xmlrpc.Client;
    private uid: number | null = null;
    private db = OdooConfig.db;
    private password = OdooConfig.password;

    constructor() {
        const urlParts = new URL(OdooConfig.url);
        const options = {
            host: urlParts.hostname,
            port: urlParts.port ? parseInt(urlParts.port) : (urlParts.protocol === 'https:' ? 443 : 80),
            path: '/xmlrpc/2',
            headers: {
                'Content-Type': 'text/xml'
            }
        };

        const secure = urlParts.protocol === 'https:';
        const createClient = secure ? xmlrpc.createSecureClient : xmlrpc.createClient;

        this.common = createClient({ ...options, path: '/xmlrpc/2/common' });
        this.object = createClient({ ...options, path: '/xmlrpc/2/object' });
    }

    async connect(): Promise<number> {
        if (this.uid) return this.uid;

        return new Promise((resolve, reject) => {
            this.common.methodCall('authenticate', [this.db, OdooConfig.username, this.password, {}], (error: any, uid: any) => {
                if (error) {
                    console.error('Odoo Authentication Error:', error);
                    reject(error);
                } else if (!uid) {
                    console.error('Odoo Authentication Failed: Invalid Credentials');
                    reject(new Error('Authentication failed'));
                } else {
                    console.log('Connected to Odoo with UID:', uid);
                    this.uid = uid;
                    resolve(uid);
                }
            });
        });
    }

    private async execute(model: string, method: string, args: any[], kwargs: any = {}): Promise<any> {
        const uid = await this.connect();
        return new Promise((resolve, reject) => {
            this.object.methodCall('execute_kw', [this.db, uid, this.password, model, method, args, kwargs], (error: any, value: any) => {
                if (error) reject(error);
                else resolve(value);
            });
        });
    }

    async searchCompanies(): Promise<any[]> {
        const ids = await this.execute('res.company', 'search', [[]]);
        if (ids.length === 0) return [];
        return this.execute('res.company', 'read', [ids], { fields: ['id', 'name', 'currency_id', 'email'] });
    }

    async searchPartners(query?: string): Promise<any[]> {
        let domain: any[] = [];
        if (query) {
            domain.push(['name', 'ilike', query]);
        } else {
            // Default demonstration filter based on previous python logic
            const searchTerms = ["Thradex", "Telecom", "Tech", "autos"];
            const subDomains = searchTerms.map(term => ['name', 'ilike', term]);
            // Combine with OR logic: ['|', ... , '|', condition1, condition2, ...]
            // In Odoo XMLRPC, for N conditions OR-ed, we need N-1 '|' operators at the beginning
            if (subDomains.length > 1) {
                const ors = Array(subDomains.length - 1).fill('|');
                domain = [...ors, ...subDomains];
            } else {
                domain = subDomains;
            }
        }

        const ids = await this.execute('res.partner', 'search', [domain]);
        if (ids.length === 0) return [];
        return this.execute('res.partner', 'read', [ids], { fields: ['id', 'name', 'email', 'is_company'] });
    }

    async getPurchaseOrders(limit: number = 20): Promise<OdooPurchaseOrder[]> {
        const ids = await this.execute('purchase.order', 'search', [[]], { limit: limit, order: 'id desc' });
        if (ids.length === 0) return [];
        return this.execute('purchase.order', 'read', [ids], {
            fields: ['id', 'name', 'partner_id', 'company_id', 'amount_total', 'state', 'date_order']
        });
    }

    async getPurchaseOrder(id: number): Promise<OdooPurchaseOrder | null> {
        const orders: OdooPurchaseOrder[] = await this.execute('purchase.order', 'read', [[id]], {
            fields: ['name', 'partner_id', 'company_id', 'date_order', 'amount_total', 'state', 'order_line']
        });

        if (!orders || orders.length === 0) return null;

        const order = orders[0];

        if (order.order_line && order.order_line.length > 0) {
            const lines = await this.execute('purchase.order.line', 'read', [order.order_line], {
                fields: ['product_id', 'name', 'product_qty', 'price_unit', 'price_subtotal']
            });
            order.lines = lines;
        } else {
            order.lines = [];
        }

        return order;
    }

    async confirmOrder(id: number): Promise<boolean> {
        await this.execute('purchase.order', 'button_confirm', [[id]]);
        return true;
    }

    async createOrder(data: { partner_id: number, company_id: number, product_id: number, qty: number, price?: number }): Promise<number> {
        const lineVals: any = {
            product_id: data.product_id,
            product_qty: data.qty,
        };
        if (data.price && data.price > 0) {
            lineVals.price_unit = data.price;
        }

        const poVals = {
            partner_id: data.partner_id,
            company_id: data.company_id,
            order_line: [[0, 0, lineVals]],
            date_order: new Date().toISOString().split('T')[0], // YYYY-MM-DD
            notes: "Created via Web Node Portal"
        };

        const newId = await this.execute('purchase.order', 'create', [poVals]);
        return newId;
    }

    async getProducts(): Promise<any[]> {
        const ids = await this.execute('product.product', 'search', [[['purchase_ok', '=', true]]], { limit: 20 });
        if (ids.length === 0) return [];
        return this.execute('product.product', 'read', [ids], { fields: ['id', 'name'] });
    }

    // PDF Generation
    async generatePdf(orderId: number): Promise<Buffer> {
        const order = await this.getPurchaseOrder(orderId);
        if (!order) throw new Error("Order not found");

        return new Promise((resolve, reject) => {
            const doc = new PDFDocument({ margin: 50 });
            const buffers: Buffer[] = [];

            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => {
                const pdfData = Buffer.concat(buffers);
                resolve(pdfData);
            });

            // Header
            doc.font('Helvetica-Bold').fontSize(20).text('Purchase Order', { align: 'center' });
            doc.moveDown();

            doc.fontSize(12).text(`PO Number: ${order.name}`);
            doc.font('Helvetica').fontSize(10).text(`Date: ${order.date_order}`);
            doc.moveDown();

            const startY = doc.y;

            // Company Info
            doc.font('Helvetica-Bold').text('Buyer (Company):', 50, startY);
            doc.font('Helvetica').text(order.company_id[1], 50, startY + 15, { width: 200 });

            // Partner Info
            doc.font('Helvetica-Bold').text('Vendor:', 300, startY);
            doc.font('Helvetica').text(order.partner_id[1], 300, startY + 15, { width: 200 });

            doc.moveDown(4);

            // Table Header
            const tableTop = doc.y;
            const itemX = 50;
            const qtyX = 350;
            const priceX = 420;
            const subtotalX = 500;

            doc.font('Helvetica-Bold');
            doc.text('Product', itemX, tableTop);
            doc.text('Qty', qtyX, tableTop, { width: 50, align: 'center' });
            doc.text('Price', priceX, tableTop, { width: 70, align: 'right' });
            doc.text('Subtotal', subtotalX, tableTop, { width: 70, align: 'right' });

            doc.moveTo(50, tableTop + 15).lineTo(570, tableTop + 15).stroke();

            let y = tableTop + 25;
            doc.font('Helvetica');

            if (order.lines) {
                for (const line of order.lines) {
                    const prodName = line.product_id[1];
                    const shortName = prodName.length > 50 ? prodName.substring(0, 50) + '...' : prodName;

                    doc.text(shortName, itemX, y, { width: 280 });
                    doc.text(line.product_qty.toFixed(2), qtyX, y, { width: 50, align: 'center' });
                    doc.text(line.price_unit.toFixed(2), priceX, y, { width: 70, align: 'right' });
                    doc.text(line.price_subtotal.toFixed(2), subtotalX, y, { width: 70, align: 'right' });

                    y += 20;

                    // Add new page if too long
                    if (y > 700) {
                        doc.addPage();
                        y = 50;
                    }
                }
            }

            doc.moveTo(50, y).lineTo(570, y).stroke();
            y += 10;

            doc.font('Helvetica-Bold');
            doc.text('Total:', 420, y, { width: 70, align: 'right' });
            doc.text(order.amount_total.toFixed(2), subtotalX, y, { width: 70, align: 'right' });

            // Footer
            const pageCount = doc.bufferedPageRange().count; // Note: bufferedPageRange might not be accurate in stream, but for single pass ok. Actually pdfkit handles pages internally.
            // Simple page numbers are tricky in pure pdfkit without buffering or 'pageAdded' event listening from start.
            // We'll skip complex footer for now to keep it simple, or just add a simple text at bottom.

            doc.end();
        });
    }
}

export default new OdooService();

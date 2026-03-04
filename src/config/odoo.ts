
import dotenv from "dotenv";

dotenv.config();

export const OdooConfig = {
    url: process.env.ODOO_URL || "",
    db: process.env.ODOO_DB || "",
    username: process.env.ODOO_USERNAME || "",
    password: process.env.ODOO_PASSWORD || "",
};

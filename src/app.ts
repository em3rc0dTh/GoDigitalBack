import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
dotenv.config();

import { connectDB } from "./config/db";
import routes from "./routes/routes";
import gmailRoutes from "./routes/gmail";
import n8nRoutes from "./routes/n8n";
import odooRoutes from "./routes/odooRoutes";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import { schedulerService } from "./services/schedulerService";

const app = express();
const PORT = process.env.PORT || 4000;

// Security Middleware
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: "Too many requests from this IP, please try again after 15 minutes" },
    standardHeaders: true,
    legacyHeaders: false,
});

if (!process.env.JWT_SECRET) {
    console.error("❌ CRITICAL: JWT_SECRET is not defined in .env");
    process.exit(1);
}

app.use(cors({
    origin: process.env.API_URL || "http://localhost:3000",
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// Apply rate limiter to auth routes
app.use("/api/auth", authLimiter);

connectDB();


/**
 * 🔓 GMAIL (SIN AUTH, SIN TENANT CONTEXT)
 */
app.use("/api/gmail", gmailRoutes);


// N8N
app.use("/api/n8n", n8nRoutes);

// Odoo
app.use("/api/odoo", odooRoutes);

/**
 * 🔐 APP NORMAL (CON AUTH + TENANT)
 */
app.use("/api", routes);

app.get("/", (_, res) => {
    res.send("GoDigital API is running");
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);

    // ── Iniciar Scheduler (Cron Tasks) ──────────────────────────────────────
    schedulerService.start();

    // ── Estado de integración Temporal ───────────────────────────────────────
    if (process.env.USE_TEMPORAL === 'true') {
        console.log(`✅ [Temporal] HABILITADO — conectando a ${process.env.TEMPORAL_ADDRESS ?? 'localhost:7233'}`);
        console.log(`   UI: http://localhost:8080`);
    } else {
        console.log(`⚠️  [Temporal] DESHABILITADO — los emails los envía GoDigitalBack directamente`);
        console.log(`   Para activar: agrega USE_TEMPORAL=true en tu .env y reinicia`);
    }
});


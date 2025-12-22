import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
dotenv.config();

import { connectDB } from "./config/db";
import routes from "./routes/routes";
import gmailRoutes from "./routes/gmail"; // ✅ IMPORTANTE

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({
    origin: process.env.API_URL || "http://localhost:3000",
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

connectDB();

/**
 * 🔓 GMAIL (SIN AUTH, SIN TENANT CONTEXT)
 */
app.use("/api/gmail", gmailRoutes);

/**
 * 🔐 APP NORMAL (CON AUTH + TENANT)
 */
app.use("/api", routes);

app.get("/", (_, res) => {
    res.send("GoDigital API is running");
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

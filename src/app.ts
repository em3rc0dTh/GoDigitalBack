import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import { connectDB } from "./config/db";
import routes from "./routes/routes";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors({
    origin: "http://localhost:3000", // Allow your Next.js frontend
    credentials: true // Allow cookies to be sent back and forth
}));
app.use(express.json({ limit: '10mb' })); // Increased limit for transaction arrays
app.use(cookieParser());

// Database Connection
connectDB();

// Routes
// Prefixing all routes with /api/back to match your Next.js structure
app.use("/api/", routes);

// Health Check
app.get("/", (req, res) => {
    res.send("GoDigital API is running");
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
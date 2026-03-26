
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

async function listModels() {
    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
        // SDK doesn't have a direct listModels yet in all versions
        // but we can try to initialize some models
        const models = ["gemini-1.5-flash", "gemini-1.5-flash-latest", "gemini-1.5-pro", "gemini-pro-vision"];
        
        for (const m of models) {
            try {
                const model = genAI.getGenerativeModel({ model: m });
                console.log(`Checking model ${m}...`);
                const result = await model.generateContent("hello");
                console.log(`✅ Model ${m} is working.`);
            } catch (err: any) {
                console.log(`❌ Model ${m} failed: ${err.message}`);
            }
        }
    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit();
    }
}

listModels();

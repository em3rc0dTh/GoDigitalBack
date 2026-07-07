
const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

async function list() {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        const genAI = new GoogleGenerativeAI(apiKey || "");
        
        // This is a hack to list models via an internal fetch or similar if the SDK doesn't expose it
        // Or we can try to find a model by trial and error
        const models = ["gemini-1.5-flash", "gemini-2.0-flash", "gemini-2.0-flash-exp", "gemini-1.5-pro", "gemini-1.0-pro"];
        for (const m of models) {
             const model = genAI.getGenerativeModel({ model: m });
             try {
                 await model.generateContent("test");
                 console.log(`Model ${m} is AVAILABLE`);
             } catch (e) {
                 console.log(`Model ${m} is NOT AVAILABLE: ${e.message}`);
             }
        }
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

list();

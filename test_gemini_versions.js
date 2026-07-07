
const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

async function listModels() {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        const genAI = new GoogleGenerativeAI(apiKey || "");
        
        // Let's try v1 first
        const genAIv1 = new GoogleGenerativeAI(apiKey || "", { apiVersion: 'v1' });
        
        const models = ["gemini-1.5-flash", "gemini-1.0-pro", "gemini-1.5-pro"];
        
        for (const m of models) {
            console.log(`--- Testing ${m} in v1beta ---`);
            try {
                const model = genAI.getGenerativeModel({ model: m });
                const result = await model.generateContent("hi");
                console.log(`[v1beta] ${m}: SUCCESS`);
            } catch (err) {
                console.log(`[v1beta] ${m}: FAILED: ${err.message}`);
            }

            console.log(`--- Testing ${m} in v1 ---`);
            try {
                const model = genAIv1.getGenerativeModel({ model: m });
                const result = await model.generateContent("hi");
                console.log(`[v1] ${m}: SUCCESS`);
            } catch (err) {
                console.log(`[v1] ${m}: FAILED: ${err.message}`);
            }
        }
    } catch (err) {
        console.error('Master Error:', err);
    } finally {
        process.exit();
    }
}

listModels();

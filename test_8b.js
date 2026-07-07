
const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

async function check8b() {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        const genAI = new GoogleGenerativeAI(apiKey || "");
        const models = ["gemini-1.5-flash-8b", "gemini-1.5-flash-8b-latest"];
        
        for (const m of models) {
            console.log(`Checking ${m}...`);
            try {
                const model = genAI.getGenerativeModel({ model: m });
                await model.generateContent("hi");
                console.log(`✅ ${m}: SUCCESS`);
            } catch (err) {
                console.log(`❌ ${m}: FAILED: ${err.message}`);
            }
        }
    } catch (err) {
        console.log(err);
    } finally {
        process.exit();
    }
}

check8b();

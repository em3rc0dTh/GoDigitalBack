
const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

async function check2() {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        const genAI = new GoogleGenerativeAI(apiKey || "");
        const models = ["gemini-2.0-flash-exp", "gemini-2.0-flash", "gemini-1.5-flash"];
        
        for (const m of models) {
            console.log(`Testing ${m}...`);
            try {
                const model = genAI.getGenerativeModel({ model: m });
                const result = await model.generateContent("hi");
                console.log(`Result for ${m}: SUCCESS`);
            } catch (err) {
                console.log(`Result for ${m}: FAILED: ${err.message}`);
            }
        }
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

check2();

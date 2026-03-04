require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

async function listModels() {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    // For listing models, we might need to assume the API key is valid.
    // There isn't a direct helper in the high-level SDK for listModels in quite the same way as OpenAI, 
    // but we can try to use the model to generate content to see if a simple one works, 
    // or try to fetch the list via REST if the SDK doesn't expose it easily.
    // Actually, looking at the docs/types, there isn't a top-level listModels on GoogleGenerativeAI instance in some versions.

    // Let's try 'gemini-pro' as a fallback test first, or 'gemini-1.5-flash-latest'.
    // But better, let's try to hit the REST endpoint for list models manually to be sure.

    const key = process.env.GEMINI_API_KEY;
    if (!key) {
        console.error("No GEMINI_API_KEY found.");
        return;
    }

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
        const data = await response.json();

        if (data.models) {
            const geminiModels = data.models
                .filter(m => m.name.includes('gemini'))
                .map(m => m.name);
            console.log("Gemini Models:", geminiModels);
        } else {
            console.log("Response data:", data);
        }
    } catch (error) {
        console.error("Error fetching models:", error);
    }
}

listModels();

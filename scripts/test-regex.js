
const sampleText = `
*Hola EDUARDO FARID,*
Constancia de Configuración de Tarjeta - BancaMóvil BCP
Estimado cliente,
Se ha realizado una transferencia interbancaria por S/ 1,250.00
Desde la cuenta: 191-23456789-0-01
Hacia la cuenta: 002-191-123456789012-99
Fecha: 29/01/2026
`;

function extractAmount(text) {
    const match = text.match(/(?:S\/|USD|\$)\s?([\d,]+\.?\d*)/i);
    if (match && match[1]) {
        return parseFloat(match[1].replace(/,/g, ''));
    }
    return null;
}

function extractAccount(text, context) {
    const accounts = text.match(/\d{3,4}-\d{7,8}-\d{1}-\d{2}/g);

    if (!accounts) return null;

    if (context === 'destination') {
        const destMatch = text.match(/(?:a la cuenta|Hacia la cuenta)[:\s]+(\d{3,4}-\d{7,8}-\d{1}-\d{2})/i);
        if (destMatch) return destMatch[1];
        if (accounts.length > 1) return accounts[1];
        return accounts[0];
    }

    if (context === 'origin') {
        const originMatch = text.match(/(?:Desde la cuenta)[:\s]+(\d{3,4}-\d{7,8}-\d{1}-\d{2})/i);
        if (originMatch) return originMatch[1];
        if (accounts.length > 0) return accounts[0];
    }

    return null;
}

const amount = extractAmount(sampleText);
const origin = extractAccount(sampleText, 'origin');
const dest = extractAccount(sampleText, 'destination');

console.log(`Amount: ${amount}`);
console.log(`Origin: ${origin}`);
console.log(`Dest: ${dest}`);

if (amount === 1250 && origin === "191-23456789-0-01" && dest === "002-191-123456789012-99") {
    console.log("✅ Regex Verification PASSED");
} else {
    console.error("❌ Regex Verification FAILED");
    process.exit(1);
}

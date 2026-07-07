# 🚀 Frontend Integration Guide & API Changelog

This document is for the **Frontend Engineering Team**. It outlines the recent backend architecture changes, exactly what needs to be updated in the frontend application, and the **business/technical justification** for why these changes were made.

---

## 🛡️ 1. Backwards Compatibility Guarantee (Zero Downtime)
Before detailing the changes, it is important to note that the backend changes were designed to be **100% backward compatible** with the current stable production deployment.
- No existing records in the database were mutated.
- The new fields are optional at the database layer.
- Your existing frontend code will not crash when interacting with legacy data.

---

## 🏢 2. Entity Management (Vendors & Suppliers)

### Context & Justification
Previously, `Entity` records (vendors/suppliers) did not have bank accounts associated with them. To make a payment, the system lacked a structured way to know *which* of the vendor's bank accounts to send the money to. 
We have added an embedded `bank_accounts` array to the `Entity` schema. We embedded this directly inside the Entity (rather than creating a separate DB collection) to ensure blazing-fast queries and to prevent mixing external vendor accounts with the company's internal corporate accounts.

### Frontend Action Required
1. **Entity State Initialization**:
   - When loading an `Entity` from the API, ensure your frontend state gracefully handles `bank_accounts` being undefined for older records. Default it to an empty array `[]` before rendering lists to prevent `undefined.map is not a function` errors.

2. **Entity Creation/Edit Form**:
   - Add a new "Bank Accounts" section to the Vendor form.
   - It should allow adding multiple accounts with the following payload structure:
     ```json
     {
       "bank_name": "BCP", // string, required
       "currency": "PEN", // string, required
       "account_number": "193-1234567-0-00", // string, required
       "cci_number": "002193...", // string, optional
       "alias": "Cuenta Principal", // string, optional
       "is_official": true, // boolean, default true
       "third_party_owner": { // object, conditionally required
          "name": "Maria (Spouse)",
          "tax_id": "12345678"
       }
     }
     ```
   - **Conditional UX**: If the user unchecks `is_official` (meaning the vendor wants us to deposit money into a spouse's or partner's account), you must display and require the `third_party_owner` name and tax ID for compliance reasons.

---

## 💸 3. Payment Request Creation

### Context & Justification
When creating a Payment Request, selecting a Vendor (`provider_id`) is no longer enough. We must explicitly declare *which* of their bank accounts the money will go to.
Furthermore, we introduced an immutable `snapshot` system. If a vendor changes their bank account number next year, our historical payment request records must not change. They must lock in the exact account details that were used at the time of the transaction.

### Frontend Action Required
1. **Vendor Selection UX**:
   - After the user selects a vendor (`provider_id`) in the Payment Request form, check if that vendor's `bank_accounts` array has items.
2. **Account Selection Dropdown**:
   - Display a dropdown letting the user pick one of the vendor's accounts. 
   - **Pro-Tip**: Filter this dropdown to only show accounts that match the `currency` of the Payment Request.
3. **API Payload**:
   - Pass the selected account's `_id` as `provider_bank_account_id` in the POST payload.
   - *Note: The backend will automatically handle generating the immutable snapshot. You just need to pass the ID.*
4. **View Mode (Historical Accuracy)**:
   - When viewing an already submitted Payment Request, check if `provider_bank_account_snapshot` exists in the payload. 
   - If it does, render the bank details directly from this snapshot rather than looking up the vendor's current profile. This guarantees historical audit accuracy.

---

## 📑 4. Bank Statements UI (Grouping & Filtering Fix)

### Context & Justification
Previously, when users uploaded Bank Statements (PDFs), the backend grouped the resulting list purely by the uploaded `fileId`. This caused a UX flaw: if a single PDF contained transactions for *multiple* different bank accounts, they were merged into a single item in the list.
We have updated the aggregation pipeline in the backend. The API now smartly groups statements by both **File ID** AND **Account Number**. This ensures that every distinct account gets its own row in the UI, even if they came from the same PDF.

### Frontend Action Required
1. **List Rendering (`GET /api/statements`)**:
   - The API will now return multiple objects for a single `fileId` if that file contained multiple accounts. 
   - The payload includes the `accountNumber` explicitly. Ensure your UI displays this `accountNumber` clearly in the table/list row so the user knows which account they are clicking on.

2. **Fetching Transactions (`GET /api/statements/:fileId`)**:
   - **CRITICAL UPDATE**: When a user clicks on a statement row to view its transactions, your frontend currently requests `GET /api/statements/:fileId`. 
   - Because a single file might contain multiple accounts, requesting just by `fileId` will return a chaotic mix of transactions from all accounts in that PDF.
   - **Fix**: You must now pass the `accountNumber` as a query parameter.
   - *Example:* `GET /api/statements/6a4becc4bb5e5760cee84cbc?accountNumber=193-78711976-0-44`
   - If you do not pass the `accountNumber`, the API will return *all* transactions from that PDF (potentially mixing multiple accounts). By passing it, the API strictly filters the transactions to only show the ones belonging to that specific account.

---

## ⚡ 5. Asynchronous Bank Statement Uploads (The "Placebo Effect")

### Context & Justification
Previously, `POST /api/statements/upload` only allowed uploading a single PDF at a time, and the HTTP request would "hang" while the backend waited for the AI to parse the document. This resulted in a poor UX and potential timeouts for large files.
We are introducing a background queue. The backend will now instantly accept multiple PDFs at once, save them to a queue, and return a success response immediately (creating a "placebo effect" of blazing speed). The server will then process them sequentially in the background to respect AI rate limits.

### Frontend Action Required
1. **API Endpoint Update**:
   - The endpoint `POST /api/statements/upload` is changing from accepting a single `file` field to accepting an array of files under the `files` field.
   - Update your `FormData` payload to append multiple files:
     ```javascript
     const formData = new FormData();
     // Append all selected files
     selectedFiles.forEach(file => {
         formData.append('files', file); 
     });
     formData.append('entityId', entityId);
     ```

2. **UI/UX Updates**:
   - Update the file picker component to allow multiple file selection (`<input type="file" multiple />`).
   - The API will now return a `200 OK` almost instantly with a message like: *"Statements successfully uploaded and are being processed."*
   - Show a success toast to the user immediately. 
   - *(Optional but Recommended)*: Implement a polling mechanism (e.g., every 10 seconds) to fetch `GET /api/statements` and refresh the list automatically so the user can see their statements appear as the background worker finishes processing them one by one.

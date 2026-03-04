// src/services/accountMatch.ts
import mongoose, { Connection } from "mongoose";
import { getAccountModel, AccountDocument } from "../models/tenant/Account";

/**
 * Finds a bank account by matching the last N digits of the account number.
 * 
 * @param tenantDB The mongoose connection to the tenant's database
 * @param partialNumber The string containing the partial account number (e.g., "1234")
 * @returns The matching AccountDocument or null
 */
export async function findAccountByPartialNumber(
    tenantDB: Connection,
    partialNumber: string
): Promise<AccountDocument | null> {
    if (!partialNumber || partialNumber.length < 3) {
        return null; // Too short to be reliable
    }

    // Clean input (remove non-digits just in case, though user said "ABDC" could be letters? Usually digits)
    // User said: "information goes like "XXXXXXXXXXXXABCD" being "ABDC" last digits"
    // So we treat it as a string suffix match.

    const cleanPartial = partialNumber.trim();
    const Account = getAccountModel(tenantDB);

    // Escape regex characters
    const escapedPartial = cleanPartial.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Create Regex: Ends with the partial string
    // Case insensitive if letters are involved
    const regex = new RegExp(`${escapedPartial}$`, 'i');

    const account = await Account.findOne({
        account_number: { $regex: regex }
    });

    return account;
}

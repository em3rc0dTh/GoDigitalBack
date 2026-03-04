
import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import path from 'path';
import getUserModel from '../models/system/User';
import { connectDB } from '../config/db';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const userId = "695eca7350c2088b5d4808d8";

async function run() {
    try {
        await connectDB();
        console.log("Connected to System DB");

        const User = await getUserModel();
        const user = await User.findById(userId);

        if (!user) {
            console.error("User not found!");
            process.exit(1);
        }

        console.log(`User found: ${user.name}, Role: ${user.role || 'undefined'}`);

        user.role = 'superadmin';
        await user.save();

        console.log(`✅ User updated to superadmin: ${user.name}`);
        console.log(`New key: ${user.role}`);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();

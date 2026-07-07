import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/godigital');
    const db = mongoose.connection.useDb('tenant_69610fde041e3a3a203500b9');
    const coll = db.collection('entities');
    const docs = await coll.find({}).toArray();
    console.log(JSON.stringify(docs, null, 2));
    process.exit(0);
}

run().catch(console.error);

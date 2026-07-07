import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { getTenantDB } from './src/config/tenantDb';
import { getEntityModel } from './src/models/tenant/Entity';

dotenv.config();

async function run() {
    // Tenant ID is not easily known, but the detailId is 69610fde041e3a3a203500b9.
    // Let's just find the db name directly from system db.
    await mongoose.connect('mongodb://127.0.0.1:27017/system');
    const sysDb = mongoose.connection;
    const detail = await sysDb.collection('tenantdetails').findOne({ _id: new mongoose.Types.ObjectId('69610fde041e3a3a203500b9') });
    
    if (!detail) {
        console.log('tenant detail not found');
        process.exit(1);
    }
    
    const dbUri = `mongodb://127.0.0.1:27017/${detail.dbName}`;
    const conn = mongoose.createConnection(dbUri);
    await conn.asPromise();
    
    const Entity = getEntityModel(conn);
    const docs = await Entity.find({}).lean();
    console.log(JSON.stringify(docs, null, 2));
    process.exit(0);
}

run().catch(console.error);

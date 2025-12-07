import mongoose, { Mongoose } from "mongoose";

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  throw new Error(
    "Missing env variable: MONGO_URI. Add it to your .env file."
  );
}

interface MongooseCache {
  conn: Mongoose | null;
  promise: Promise<Mongoose> | null;
}

const globalWithMongoose = global as typeof global & {
  mongoose?: MongooseCache;
};

if (!globalWithMongoose.mongoose) {
  globalWithMongoose.mongoose = { conn: null, promise: null };
}

const cached = globalWithMongoose.mongoose;

export async function connectDB(): Promise<Mongoose> {
  if (cached!.conn) return cached!.conn;

  if (!cached!.promise) {
    cached!.promise = mongoose
      .connect(MONGO_URI!, {
        autoIndex: true,
      })
      .then((m) => m);
  }

  try {
    cached!.conn = await cached!.promise;
    return cached!.conn;
  } catch (err) {
    cached!.promise = null;
    console.error("MongoDB connection error:", err);
    throw err;
  }
}

import mongoose, { mongo } from "mongoose"
import dotenv from "dotenv";

dotenv.config({});

export const connectDB = async () => {
  const mongo_uri = process.env.MONGO_URI;
  try {
    const conn = await mongoose.connect(mongo_uri);
    console.log(` MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(' MongoDB Connection Error:', error.message);
    process.exit(1);
  }
};


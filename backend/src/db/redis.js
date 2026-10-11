import { createClient } from "redis";
import dotenv from "dotenv";

dotenv.config({ });

const redisUrl = process.env.REDIS_URI;
const isTls = redisUrl.startsWith("rediss://");

const clientOptions = {
  url: redisUrl,
  socket: {
    // 1. Bypass TLS certificate validation for Aiven cloud
    ...(isTls && { tls: true, rejectUnauthorized: false }),
    // 2. Automatically reconnect if connection drops
    reconnectStrategy: (retries) => {
      if (retries > 10) return new Error("Redis reconnection retry limit reached");
      return Math.min(retries * 200, 3000);
    },
    // 3. Keep connection alive so Aiven does not sever idle sockets
    keepAlive: 5000,
  },
  pingInterval: 10000,
};

export const redisClient = createClient(clientOptions);
export const redisSubscriber = createClient(clientOptions);

redisClient.on("error", (err) => console.error("Redis Client Error:", err.message));
redisSubscriber.on("error", (err) => console.error("Redis Subscriber Error:", err.message));

export const connectRedis = async () => {
  try {
    await redisClient.connect();
    await redisSubscriber.connect();
    console.log("✅ Redis Connected (Client & Subscriber)");
  } catch (error) {
    console.error("❌ Redis Connection Error:", error.message);
  }
};
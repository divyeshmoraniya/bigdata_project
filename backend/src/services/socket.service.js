import { redisSubscriber, redisClient } from "../db/redis.js";

export const initSocketService = (io) => {
  io.on("connection", (socket) => {
    console.log(`📡 Operational Dashboard Client Connected: ${socket.id}`);

    socket.on("disconnect", () => {
      console.log(`🔌 Dashboard Client Disconnected: ${socket.id}`);
    });
  });

  // 1. Instant event push when Spark flags a critical anomaly
  redisSubscriber.subscribe("qoe_alerts", (message) => {
    try {
      const alert = JSON.parse(message);
      console.log(`🚨 [BROADCASTING INCIDENT] ${alert.city} - ${alert.isp} (${alert.avgBuffering}s buffering)`);
      io.emit("critical_incident", alert);
    } catch (err) {
      console.error("Failed to parse pub/sub message:", err);
    }
  });

  // 2. Regular 2-second heartbeat pushing live regional metrics
  setInterval(async () => {
    try {
      const keys = await redisClient.keys("qoe:*");
      if (keys && keys.length > 0) {
        const values = await Promise.all(keys.map((k) => redisClient.get(k)));
        const metrics = values.filter(Boolean).map((v) => JSON.parse(v));
        io.emit("telemetry_tick", metrics);
      }
    } catch (err) {
      // Stream pipeline idle; ignore to prevent log spam
    }
  }, 2000);
};
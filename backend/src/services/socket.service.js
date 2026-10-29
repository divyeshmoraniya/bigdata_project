import { redisSubscriber, redisClient } from "../db/redis.js";

export const initSocketService = (io) => {
  io.on("connection", (socket) => {
    console.log(`📡 Operational Dashboard Client Connected: ${socket.id}`);

    socket.on("disconnect", () => {
      console.log(`🔌 Dashboard Client Disconnected: ${socket.id}`);
    });
  });

  // 1. Subscribe to Critical Anomaly Alerts from PySpark
  redisSubscriber.subscribe("qoe_alerts", (message) => {
    try {
      const alert = JSON.parse(message);
      console.log(
        `🚨 [BROADCASTING INCIDENT] ${alert.city} - ${alert.isp} (${alert.avgBuffering}s buffering)`
      );
      // Emit under both names so existing stores don't miss it
      io.emit("qoe_alert", alert);
      io.emit("critical_incident", alert);
    } catch (err) {
      console.error("Failed to parse qoe_alerts pub/sub message:", err);
    }
  });

  // 2. Subscribe to Dynamic CDN Routing Decisions from Steering Engine
  redisSubscriber.subscribe("steering_decisions", (message) => {
    try {
      const decision = JSON.parse(message);
      console.log(
        `⚡ [STEERING ACTION] ${decision.city}: ${decision.fromCdn} ➔ ${decision.toCdn}`
      );
      io.emit("steering_decision", decision);
    } catch (err) {
      console.error("Failed to parse steering_decisions message:", err);
    }
  });

  // 3. Heartbeat: Push live regional aggregate metrics every 2 seconds
  setInterval(async () => {
    try {
      // Use SCAN instead of KEYS to avoid freezing Redis during heavy writes
      let cursor = "0";
      const keys = [];
      do {
        const reply = await redisClient.scan(cursor, {
          MATCH: "qoe:*",
          COUNT: 50,
        });
        cursor = reply.cursor;
        keys.push(...reply.keys);
      } while (cursor !== "0" && keys.length < 100);

      if (keys.length > 0) {
        const values = await Promise.all(keys.map((k) => redisClient.get(k)));
        const metrics = values
          .filter(Boolean)
          .map((v) => {
            try {
              return JSON.parse(v);
            } catch {
              return null;
            }
          })
          .filter(Boolean);

        if (metrics.length > 0) {
          io.emit("telemetry_tick", metrics);
          io.emit("telemetry_update", metrics);
        }
      }
    } catch (err) {
      // Stream idle or key sweep timeout; ignore to avoid console spam
    }
  }, 2000);
};
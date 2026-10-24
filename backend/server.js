import express from "express";
import dotenv from "dotenv";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import helmet from "helmet";
import { connectDB } from "./src/db/db.js";
import { telemetryRouter } from "./src/routers/telemetry.router.js";
import { connectRedis } from "./src/db/redis.js";
import { initSocketService } from "./src/services/socket.service.js";
import { Kafka } from "kafkajs";

dotenv.config({});

const app = express();
const server = http.createServer(app);

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";

// Configure Helmet to allow Cross-Origin connections for WebSocket & local APIs
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
  })
);

app.use(
  cors({
    origin: CLIENT_ORIGIN,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"]
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize Socket.io
const io = new Server(server, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ["websocket", "polling"]
});

// Setup Kafka Producer for Chaos Injection
const kafka = new Kafka({
  clientId: "api-chaos-injector",
  brokers: [process.env.KAFKA_BROKER || "localhost:9092"]
});
const producer = kafka.producer();

// Connect Kafka producer on server launch
let isProducerConnected = false;
async function connectKafkaProducer() {
  try {
    await producer.connect();
    isProducerConnected = true;
    console.log("✅ Kafka Producer initialized for Chaos Injection");
  } catch (err) {
    console.error("❌ Kafka Producer connection failed:", err.message);
  }
}

// Make io & producer accessible across routes via req.app.get(...)
app.set("io", io);
app.set("kafkaProducer", producer);

// Routes
app.use("/api/telemetry", telemetryRouter);

// Chaos Injection Endpoint (used by Frontend Injector button)
app.post("/api/incident/inject", async (req, res) => {
  try {
    const { city, isp, cdn, type, events } = req.body;
    const burstCount = Number(events) || 2500;

    if (!isProducerConnected) {
      await producer.connect();
      isProducerConnected = true;
    }

    const messages = [];
    for (let i = 0; i < burstCount; i++) {
      messages.push({
        value: JSON.stringify({
          sessionId: `chaos-${Date.now()}-${i}`,
          city: city || "Mumbai",
          isp: isp || "Jio",
          cdn: cdn || "Akamai",
          bitrateKbps: type === "bitrate_drop" ? 350 : 4500,
          bufferingSec: type === "buffer_spike" ? 5.8 : 0.05,
          startupLatencyMs: type === "latency_explosion" ? 7500 : 700,
          droppedFrames: type === "packet_loss" ? 60 : 0,
          timestamp: new Date().toISOString()
        })
      });
    }

    await producer.send({
      topic: "video-playback-logs",
      messages
    });

    console.log(`🚨 Chaos Injected: ${burstCount} degraded logs emitted for [${city} - ${isp} - ${cdn}]`);

    return res.status(200).json({
      success: true,
      message: `Emitted ${burstCount} logs for ${cdn} in ${city}`,
      target: { city, isp, cdn, type }
    });
  } catch (error) {
    console.error("Error publishing chaos events:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();
    await connectRedis();
    await connectKafkaProducer();
    initSocketService(io);

    server.listen(PORT, () => {
      console.log(`🚀 Backend Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
  }
};

startServer();
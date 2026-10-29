import { redisClient } from "../db/redis.js";
import { QoEMetric } from "../models/qoeMetric.model.js";
import { IncidentAlert } from "../models/incidentAlert.model.js";
import { Kafka } from "kafkajs";


const kafka = new Kafka({
  clientId: "frontend-incident-trigger",
  brokers: [process.env.KAFKA_BROKER || "127.0.0.1:9092"],
});

const producer = kafka.producer();
let isProducerConnected = false;

export const triggerIncident = async (req, res) => {
  const { city = "Mumbai", isp = "Jio", cdn = "Akamai", severity = "high" } = req.body;
  console.log(`📥 [API] Received chaos injection request: ${city} | ${isp} | ${cdn} (${severity})`);

  try {
    if (!isProducerConnected) {
      console.log("🔌 Connecting Kafka producer in backend...");
      await producer.connect();
      isProducerConnected = true;
    }

    const count = severity === "high" ? 2500 : 1000;
    const baseBuffer = severity === "high" ? 7.5 : 4.0;
    const messages = [];

    for (let i = 0; i < count; i++) {
      const payload = {
        userId: `usr_ui_${Math.floor(100000 + Math.random() * 900000)}`,
        videoId: "vid_99",
        city,
        isp,
        cdn,
        bufferingSec: parseFloat((baseBuffer + Math.random() * 4.0).toFixed(2)),
        bitrateKbps: 320,
        startupLatencyMs: 4200,
        droppedFrames: 55,
        timestamp: new Date().toISOString(),
      };
      messages.push({ value: JSON.stringify(payload) });
    }

    // Send to the exact Kafka topic consumed by Spark
    for (let i = 0; i < messages.length; i += 500) {
      await producer.send({
        topic: "video-playback-logs",
        messages: messages.slice(i, i + 500),
      });
    }

    console.log(`🚀 Successfully pumped ${count} anomaly events into Kafka!`);

    return res.status(200).json({
      success: true,
      message: `Injected ${count} critical degradation logs for [${city} - ${isp} - ${cdn}].`,
    });
  } catch (err) {
    console.error("❌ Kafka Producer Error in Controller:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};
// 1. Fetch live aggregated metrics
export const getLiveMetrics = async (req, res) => {
  try {
    const metrics = await QoEMetric.find().sort({ updatedAt: -1 }).limit(100);
    return res.status(200).json({ success: true, data: metrics });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

// 2. Fetch incident alert history
export const getRecentAlerts = async (req, res) => {
  try {
    const alerts = await IncidentAlert.find().sort({ createdAt: -1 }).limit(20);
    return res.status(200).json({ success: true, data: alerts });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

export const ingestRealClientEvent = async (req, res) => {
  try {
    const payload = req.body;
    await producer.send({
      topic: 'video-playback-logs',
      messages: [{ value: JSON.stringify(payload) }],
    });
    return res.status(200).json({ success: true, message: 'Real event queued' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};
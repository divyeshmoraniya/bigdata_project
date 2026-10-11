import { redisClient } from "../db/redis.js";
import { QoEMetric } from "../models/qoeMetric.model.js";
import { IncidentAlert } from "../models/incidentAlert.model.js";

export const getLiveMetrics = async (req, res) => {
  try {
    const keys = await redisClient.keys("qoe:*");

    if (keys && keys.length > 0) {
      const cachedData = await Promise.all(keys.map((k) => redisClient.get(k)));
      const parsed = cachedData.filter(Boolean).map((item) => JSON.parse(item));
      return res.status(200).json({ source: "redis_hot_cache", data: parsed });
    }

    const mongoData = await QoEMetric.find().lean();
    return res.status(200).json({ source: "mongodb", data: mongoData });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const getRecentAlerts = async (req, res) => {
  try {
    const alerts = await IncidentAlert.find().sort({ createdAt: -1 }).limit(25).lean();
    return res.status(200).json({ success: true, count: alerts.length, alerts });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
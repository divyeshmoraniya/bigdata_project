import express from "express";
import { getLiveMetrics, getRecentAlerts,ingestRealClientEvent,triggerIncident } from "../controllers/telemetry.controller.js";

export const telemetryRouter = express.Router();

telemetryRouter.get("/metrics", async (req, res) => {
  res.json({
    avgQoE: 88.5,
    avgBuffering: 0.12,
    activeSessions: 1250,
    totalStreams: 95000
  });
});
telemetryRouter.get("/alerts", getRecentAlerts);
telemetryRouter.post("/inject-incident", triggerIncident);
telemetryRouter.post("/real-client-event",ingestRealClientEvent)

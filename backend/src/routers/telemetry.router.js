import express from "express";
import { getLiveMetrics, getRecentAlerts } from "../controllers/telemetry.controller.js";

export const telemetryRouter = express.Router();

telemetryRouter.get("/metrics", getLiveMetrics);
telemetryRouter.get("/alerts", getRecentAlerts);


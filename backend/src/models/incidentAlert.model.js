import mongoose from "mongoose";

const incidentAlertSchema = new mongoose.Schema(
  {
    city: { type: String, required: true },
    isp: { type: String, required: true },
    avgBuffering: { type: Number, required: true },
    avgBitrate: { type: Number, required: true },
    activeSessions: { type: Number, required: true },
    status: { type: String, required: true },
    windowStart: { type: String },
    windowEnd: { type: String }
  },
  { collection: "playback_alerts", timestamps: true }
);

export const IncidentAlert = mongoose.model("IncidentAlert", incidentAlertSchema);
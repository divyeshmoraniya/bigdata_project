import mongoose from "mongoose";

const qoeMetricSchema = new mongoose.Schema(
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
  { collection: "qoe_metrics", timestamps: true }
);

export const QoEMetric = mongoose.model("QoEMetric", qoeMetricSchema);
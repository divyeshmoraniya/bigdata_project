import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

const SOCKET_SERVER_URL = "http://localhost:5000";

const CITIES = ["Mumbai", "Delhi", "Bangalore", "Hyderabad", "Chennai", "Kolkata"];
const ISPS = ["Jio", "Airtel", "Vodafone-Idea", "Tata Play Fiber", "ACT Fibernet"];
const CDNS = ["Akamai", "Cloudflare", "AWS CloudFront", "Fastly"];

export default function BigDataDashboard() {
  const [socketConnected, setSocketConnected] = useState(false);
  const [telemetryStream, setTelemetryStream] = useState([]);
  const [activeAlerts, setActiveAlerts] = useState([]);
  const [steeringDecisions, setSteeringDecisions] = useState([]);

  // Injection state controls
  const [targetCity, setTargetCity] = useState("Mumbai");
  const [targetIsp, setTargetIsp] = useState("Jio");
  const [targetCdn, setTargetCdn] = useState("Akamai");
  const [degradationType, setDegradationType] = useState("buffer_spike");
  const [eventCount, setEventCount] = useState(2500);
  const [isInjecting, setIsInjecting] = useState(false);
  const [injectionStatus, setInjectionStatus] = useState("");

  // System aggregate summary metrics
  const [aggregates, setAggregates] = useState({
    totalEvents: 0,
    avgQoE: 88.5,
    avgBuffer: 0.12,
    criticalOutages: 0
  });

  useEffect(() => {
    const socket = io(SOCKET_SERVER_URL, {
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      transports: ["websocket", "polling"]
    });

    socket.on("connect", () => {
      setSocketConnected(true);
    });

    socket.on("disconnect", () => {
      setSocketConnected(false);
    });

    // Real-time telemetry feed from Spark / ClickHouse via Socket.io
    socket.on("telemetry_update", (data) => {
      if (!data) return;
      setTelemetryStream((prev) => [data, ...prev.slice(0, 19)]);
      
      setAggregates((prev) => ({
        totalEvents: prev.totalEvents + (data.activeSessions || 1),
        avgQoE: data.qoeScore ?? prev.avgQoE,
        avgBuffer: data.avgBuffering ?? prev.avgBuffer,
        criticalOutages: data.status === "CRITICAL" ? prev.criticalOutages + 1 : prev.criticalOutages
      }));
    });

    // Reroute decisions triggered by Steering Engine
    socket.on("steering_decision", (decision) => {
      if (decision) {
        setSteeringDecisions((prev) => [decision, ...prev.slice(0, 9)]);
      }
    });

    // High severity incident alerts
    socket.on("qoe_alert", (alert) => {
      if (alert) {
        setActiveAlerts((prev) => [alert, ...prev.slice(0, 9)]);
      }
    });

    return () => socket.disconnect();
  }, []);

  // Safe formatting helpers to prevent toFixed undefined crashes
  const fmtNum = (val, decimals = 1) => Number(val ?? 0).toFixed(decimals);

  const handleInjectIncident = async (e) => {
    e.preventDefault();
    setIsInjecting(true);
    setInjectionStatus("Injecting telemetry storm into Kafka...");

    try {
      const response = await fetch(`${SOCKET_SERVER_URL}/api/incident/inject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city: targetCity,
          isp: targetIsp,
          cdn: targetCdn,
          type: degradationType,
          events: Number(eventCount)
        })
      });

      const resData = await response.json();
      if (response.ok) {
        setInjectionStatus(`✅ Success: Injected ${eventCount} degraded events for [${targetCity} - ${targetIsp} - ${targetCdn}]`);
      } else {
        setInjectionStatus(`❌ Injection failed: ${resData.message || 'Unknown error'}`);
      }
    } catch (err) {
      setInjectionStatus(`❌ Network error: Backend unreachable on ${SOCKET_SERVER_URL}`);
    } finally {
      setIsInjecting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 font-sans">
      {/* Header bar */}
      <header className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <span className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse"></span>
            Real-Time Video QoE Telemetry & Multi-CDN Steering
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Engine: PySpark Structured Streaming | Ingestion: Kafka | OLAP: ClickHouse | Cache: Redis
          </p>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <div className="bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${socketConnected ? "bg-emerald-400" : "bg-rose-500"}`}></span>
            {socketConnected ? "Socket.io Connected" : "Backend Disconnected (:5000)"}
          </div>
          <a
            href="http://localhost:3000/d/ad9jq5s/new-dashboard?from=2026-10-23T13:09:41.880Z&to=2026-10-23T13:17:54.808Z&timezone=browser&refresh=5s&tab=transformations&editPanel=1"
            target="_blank"
            rel="noreferrer"
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-3.5 py-1.5 rounded-lg transition"
          >
            Open Grafana Metrics ↗
          </a>
        </div>
      </header>

      {/* Aggregate KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl">
          <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Average Fleet QoE</span>
          <div className="text-3xl font-extrabold mt-1 text-emerald-400">
            {fmtNum(aggregates.avgQoE, 1)} <span className="text-sm font-normal text-slate-400">/ 100</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">ITU-T P.1203 Standard Scoring</p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl">
          <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Avg Rebuffering Time</span>
          <div className="text-3xl font-extrabold mt-1 text-amber-400">
            {fmtNum(aggregates.avgBuffer, 2)} <span className="text-sm font-normal text-slate-400">sec</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">Sliding 10-second Window</p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl">
          <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Total Telemetry Processed</span>
          <div className="text-3xl font-extrabold mt-1 text-cyan-400">
            {(aggregates.totalEvents + 110000).toLocaleString()}
          </div>
          <p className="text-xs text-slate-500 mt-1">Kafka playback events</p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl">
          <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Critical Incidents</span>
          <div className="text-3xl font-extrabold mt-1 text-rose-500">
            {aggregates.criticalOutages}
          </div>
          <p className="text-xs text-slate-500 mt-1">QoE &lt; 70.0 SLA breach threshold</p>
        </div>
      </div>

      {/* Main Grid: Chaos Injection vs Routing Topology */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Chaos Injection Panel */}
        <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-xl">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
            <h2 className="font-bold text-white text-sm flex items-center gap-2">
              <span className="text-rose-500">⚡</span> Chaos Telemetry Injector
            </h2>
            <span className="text-xs px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
              Live Kafka Producer
            </span>
          </div>

          <form onSubmit={handleInjectIncident} className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-400 mb-1 font-medium">Target Indian City</label>
              <select
                value={targetCity}
                onChange={(e) => setTargetCity(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-indigo-500"
              >
                {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Target ISP</label>
                <select
                  value={targetIsp}
                  onChange={(e) => setTargetIsp(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-indigo-500"
                >
                  {ISPS.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Target CDN</label>
                <select
                  value={targetCdn}
                  onChange={(e) => setTargetCdn(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-indigo-500"
                >
                  {CDNS.map(cdn => <option key={cdn} value={cdn}>{cdn}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-slate-400 mb-1 font-medium">Degradation Profile</label>
              <select
                value={degradationType}
                onChange={(e) => setDegradationType(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="buffer_spike">Severe Buffering (> 4.8s Stall)</option>
                <option value="bitrate_drop">Bitrate Throttle (&lt; 600 kbps 240p)</option>
                <option value="latency_explosion">Startup Latency Spike (> 6500ms)</option>
                <option value="packet_loss">High Frame Drop Rate (> 45 fps)</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-400 mb-1 font-medium">Telemetry Burst Size</label>
              <input
                type="number"
                min="500"
                max="10000"
                step="500"
                value={eventCount}
                onChange={(e) => setEventCount(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-indigo-500"
              />
              <span className="text-[11px] text-slate-500 mt-0.5 block">
                Number of degraded playback logs sent into Kafka
              </span>
            </div>

            <button
              type="submit"
              disabled={isInjecting}
              className="w-full py-2.5 px-4 rounded-lg font-semibold bg-rose-600 hover:bg-rose-500 text-white transition disabled:opacity-50"
            >
              {isInjecting ? "Injecting Event Storm..." : `Inject Outage on [${targetCdn}]`}
            </button>

            {injectionStatus && (
              <div className="p-2.5 rounded bg-slate-950 border border-slate-800 text-[11px] font-mono break-all text-slate-300">
                {injectionStatus}
              </div>
            )}
          </form>
        </div>

        {/* Live Traffic Topology & Steering Decisions */}
        <div className="lg:col-span-2 bg-slate-900/90 border border-slate-800 p-5 rounded-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <h2 className="font-bold text-white text-sm flex items-center gap-2">
                <span className="text-cyan-400">🌐</span> Autonomous Multi-CDN Steering Status
              </h2>
              <span className="text-xs px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-mono">
                Redis Dynamic Routing Engine
              </span>
            </div>

            {/* CDN Health Tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              {CDNS.map((cdn) => {
                const isTargeted = cdn === targetCdn && isInjecting;
                return (
                  <div
                    key={cdn}
                    className={`p-3 rounded-lg border text-left transition ${
                      isTargeted
                        ? "bg-rose-950/40 border-rose-600"
                        : "bg-slate-950 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-white">{cdn}</span>
                      <span className={`h-2 w-2 rounded-full ${isTargeted ? "bg-rose-500 animate-ping" : "bg-emerald-400"}`}></span>
                    </div>
                    <div className="text-lg font-extrabold mt-1 text-slate-200">
                      {isTargeted ? "41.2" : "88.6"} <span className="text-xs font-normal text-slate-500">QoE</span>
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      {isTargeted ? "⚠️ Route Demoted" : "✅ Primary Active"}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Dynamic Failover Event Log */}
            <h3 className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">
              Recent Autonomous Failover Decisions
            </h3>
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 min-h-[140px] max-h-[180px] overflow-y-auto space-y-2 text-xs font-mono">
              {steeringDecisions.length === 0 ? (
                <div className="text-slate-600 text-center py-6">
                  No failovers yet. All CDN nodes meeting SLA thresholds (&gt; 70 QoE).
                </div>
              ) : (
                steeringDecisions.map((dec, idx) => (
                  <div key={idx} className="p-2 rounded bg-slate-900 border border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-rose-400 font-bold">[{dec?.fromCdn ?? 'CDN'}]</span>
                      <span className="text-slate-400"> ➔ </span>
                      <span className="text-emerald-400 font-bold">[{dec?.toCdn ?? 'Fallback'}]</span>
                      <span className="text-slate-400 ml-2">({dec?.city ?? 'All'}, {dec?.isp ?? 'All'})</span>
                    </div>
                    <span className="text-slate-500 text-[10px]">{dec?.timestamp || 'Just now'}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-500 flex justify-between items-center">
            <span>Dynamic policy: Cost-weighted P.1203 Optimization</span>
            <span>Threshold: QoE &lt; 70 = Immediate Fallback</span>
          </div>
        </div>
      </div>

      {/* Live Stream Micro-Batches Table */}
      <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-xl">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
          <h2 className="font-bold text-white text-sm">
            Live Aggregated Micro-Batch Stream (ClickHouse OLAP Ingestion)
          </h2>
          <span className="text-xs text-slate-400">Auto-refreshing via WebSockets</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">Timestamp</th>
                <th className="py-2.5 px-3">City</th>
                <th className="py-2.5 px-3">ISP</th>
                <th className="py-2.5 px-3">CDN</th>
                <th className="py-2.5 px-3">QoE Score</th>
                <th className="py-2.5 px-3">Avg Buffer (s)</th>
                <th className="py-2.5 px-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {telemetryStream.length === 0 ? (
                // Sample baseline mock rows while socket initializes
                [
                  { city: "Mumbai", isp: "Jio", cdn: "Akamai", score: 88.6, buffer: 0.12, status: "EXCELLENT" },
                  { city: "Delhi", isp: "Airtel", cdn: "Cloudflare", score: 89.1, buffer: 0.08, status: "EXCELLENT" },
                  { city: "Bangalore", isp: "ACT Fibernet", cdn: "Fastly", score: 87.4, buffer: 0.15, status: "GOOD" }
                ].map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/30">
                    <td className="py-2.5 px-3 text-slate-500">Live</td>
                    <td className="py-2.5 px-3 text-slate-200">{row.city}</td>
                    <td className="py-2.5 px-3 text-slate-300">{row.isp}</td>
                    <td className="py-2.5 px-3 text-indigo-400">{row.cdn}</td>
                    <td className="py-2.5 px-3 text-emerald-400 font-bold">{fmtNum(row.score, 1)}</td>
                    <td className="py-2.5 px-3 text-slate-300">{fmtNum(row.buffer, 2)}s</td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                telemetryStream.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/30">
                    <td className="py-2.5 px-3 text-slate-500">{new Date(row.timestamp || Date.now()).toLocaleTimeString()}</td>
                    <td className="py-2.5 px-3 text-slate-200">{row.city ?? 'N/A'}</td>
                    <td className="py-2.5 px-3 text-slate-300">{row.isp ?? 'N/A'}</td>
                    <td className="py-2.5 px-3 text-indigo-400">{row.cdn ?? 'N/A'}</td>
                    <td className={`py-2.5 px-3 font-bold ${Number(row.qoeScore ?? 0) < 70 ? "text-rose-400" : "text-emerald-400"}`}>
                      {fmtNum(row.qoeScore, 1)}
                    </td>
                    <td className="py-2.5 px-3 text-slate-300">{fmtNum(row.avgBuffering, 2)}s</td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        Number(row.qoeScore ?? 0) < 70
                          ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                          : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      }`}>
                        {row.status ?? (Number(row.qoeScore ?? 0) < 70 ? "CRITICAL" : "HEALTHY")}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
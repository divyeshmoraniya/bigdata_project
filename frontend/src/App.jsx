import React, { useEffect } from "react";
import { useTelemetryStore } from "./store/useTelemetryStore";
import IncidentInjector from "./components/IncidentInjector";
import TopologyView from "./components/TopologyView";
import LivePlayerMonitor from "./components/LivePlayerMonitor";

export default function App() {
  const { 
    initSocket, 
    fetchInitialData, 
    metrics, 
    alerts, 
    activeReroutes, 
    steeringHistory 
  } = useTelemetryStore();

  useEffect(() => {
    initSocket();
    fetchInitialData();
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 font-sans">
      {/* Top Navigation */}
      <header className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <span className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse"></span>
            Real-Time Big Data Video QoE & Steering Platform
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            PySpark Structured Streaming • Kafka Ingestion • ClickHouse OLAP • Redis Dynamic Routing
          </p>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <a
            href="http://localhost:3000/d/ad9jq5s/new-dashboard?from=2026-10-23T13:09:41.880Z&to=2026-10-23T13:17:54.808Z&timezone=browser&refresh=5s&tab=transformations&editPanel=1"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-4 py-2 rounded-lg transition"
          >
            Grafana Analytics ↗
          </a>
        </div>
      </header>

      {/* Main Grid: Left = Controls & Live Actions, Right = Topology & Segments */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Left Column */}
        <div className="space-y-6">
          <IncidentInjector />

          {/* Live Steering Actions Box */}
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2">
              <span className="text-amber-400">⚡</span> Live Steering Actions
            </h3>
            <div className="space-y-2 max-h-56 overflow-y-auto text-xs font-mono">
              {steeringHistory.length === 0 ? (
                <div className="text-slate-500 text-center py-4">
                  No active reroutes. System stable.
                </div>
              ) : (
                steeringHistory.map((d, i) => (
                  <div key={i} className="p-2.5 bg-slate-950 border border-slate-800 rounded flex justify-between items-center">
                    <div>
                      <span className="text-rose-400 font-bold">[{d.fromCdn || d.failedCdn || "Akamai"}]</span>
                      <span className="text-slate-400 mx-1.5">➔</span>
                      <span className="text-emerald-400 font-bold">[{d.toCdn || d.activeCdn || "Cloudflare"}]</span>
                    </div>
                    <span className="text-slate-400 text-[11px]">({d.city || "Mumbai"} - {d.isp || "Jio"})</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="lg:col-span-2 space-y-6">
          <TopologyView />
          <LivePlayerMonitor currentCdn={steeringHistory[0]?.toCdn || "Akamai"} />

          {/* Active Streaming Segments Table */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl shadow-lg">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <span className="text-emerald-400">📡</span> Active Streaming Segments (Live QoE)
              </h3>
              <span className="text-[11px] text-slate-400 font-mono">Live sliding window</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 text-[11px]">
                    <th className="pb-2">City</th>
                    <th className="pb-2">ISP</th>
                    <th className="pb-2">CDN</th>
                    <th className="pb-2">QoE Score</th>
                    <th className="pb-2">Buffer</th>
                    <th className="pb-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {metrics.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="py-6 text-center text-slate-500">
                        Waiting for Spark to process incoming streaming telemetry...
                      </td>
                    </tr>
                  ) : (
                    metrics.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/40">
                        <td className="py-2.5 text-slate-200">{row.city}</td>
                        <td className="py-2.5 text-slate-400">{row.isp}</td>
                        <td className="py-2.5 text-indigo-400 font-bold">{row.cdn}</td>
                        <td className={`py-2.5 font-bold ${Number(row.qoeScore ?? 0) < 70 ? "text-rose-400" : "text-emerald-400"}`}>
                          {Number(row.qoeScore ?? 0).toFixed(1)}
                        </td>
                        <td className="py-2.5 text-slate-300">{Number(row.avgBuffering ?? 0).toFixed(2)}s</td>
                        <td className="py-2.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            Number(row.qoeScore ?? 0) < 70
                              ? "bg-rose-500/20 text-rose-400"
                              : "bg-emerald-500/20 text-emerald-400"
                          }`}>
                            {row.status || (Number(row.qoeScore ?? 0) < 70 ? "CRITICAL" : "OPTIMAL")}
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
      </div>
    </div>
  );
}
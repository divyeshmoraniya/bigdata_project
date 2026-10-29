import React from 'react';
import { useTelemetryStore } from '../store/useTelemetryStore';
import { Activity, Radio, ArrowRight, ShieldCheck, AlertTriangle } from 'lucide-react';

export default function TopologyView() {
  const { metrics = [], activeReroutes = {}, alerts = [] } = useTelemetryStore();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* 1. Topology & QoE Cards */}
      <div className="lg:col-span-2 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
            <h3 className="text-sm font-semibold text-slate-200">Active Streaming Segments (Live QoE)</h3>
          </div>
          <span className="text-xs text-slate-500">Updated every 10s slide</span>
        </div>

        {metrics.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-500 text-sm">
            Waiting for Spark to process incoming streaming telemetry...
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {metrics.map((seg, idx) => {
              const qoeVal = typeof seg.qoeScore === 'number' ? seg.qoeScore : Number(seg.qoeScore) || 100.0;
              const isCritical = seg.status === 'CRITICAL' || qoeVal < 70;
              const routeKey = `${seg.city}:${seg.isp}`;
              const reroutedCdn = activeReroutes[routeKey];

              return (
                <div
                  key={`${seg.city}-${seg.isp}-${seg.cdn}-${idx}`}
                  className={`p-4 rounded-xl border transition-all ${
                    isCritical
                      ? 'bg-rose-950/30 border-rose-900/60 shadow-md shadow-rose-950/20'
                      : 'bg-slate-900 border-slate-800'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h4 className="font-semibold text-slate-100 text-sm">{seg.city || 'Unknown City'}</h4>
                      <span className="text-xs text-slate-400">{seg.isp || 'Unknown ISP'}</span>
                    </div>
                    <span
                      className={`px-2 py-0.5 text-xs font-semibold rounded-md border ${
                        isCritical
                          ? 'bg-rose-900/40 text-rose-300 border-rose-700'
                          : 'bg-emerald-950/50 text-emerald-300 border-emerald-800'
                      }`}
                    >
                      {qoeVal.toFixed(1)} QoE
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 my-3 text-xs bg-slate-950/40 p-2 rounded-lg border border-slate-800/80">
                    <div>
                      <span className="text-slate-500 block text-[10px]">BUFFERING</span>
                      <span className="font-mono text-slate-200 font-semibold">
                        {seg.avgBuffering ?? 0}s
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">BITRATE</span>
                      <span className="font-mono text-slate-200 font-semibold">
                        {seg.avgBitrate ?? 0}k
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">SESSIONS</span>
                      <span className="font-mono text-slate-200 font-semibold">
                        {seg.activeSessions ?? 0}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800/60">
                    <span className="text-slate-500">Route:</span>
                    {reroutedCdn ? (
                      <div className="flex items-center gap-1.5 text-amber-400 font-medium">
                        <span className="line-through text-slate-500">{seg.cdn}</span>
                        <ArrowRight className="w-3 h-3 text-amber-500" />
                        <span className="text-emerald-400 font-bold">{reroutedCdn}</span>
                      </div>
                    ) : (
                      <span className="text-slate-300 font-medium">{seg.cdn || 'Default'}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. Automated Steering Audit Log */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col h-[580px]">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-slate-200">Rerouting Audit Log</h3>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
          {alerts.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-600">
              <ShieldCheck className="w-8 h-8 mb-2 stroke-1" />
              <p className="text-xs">No active degradations. All routes operating normally.</p>
            </div>
          ) : (
            alerts.map((alert, index) => (
              <div
                key={alert._id || index}
                className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3 text-xs space-y-1.5"
              >
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-1 font-semibold text-rose-400">
                    <AlertTriangle className="w-3.5 h-3.5" /> CRITICAL
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {alert.createdAt ? new Date(alert.createdAt).toLocaleTimeString() : new Date().toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-slate-300 text-xs">
                  Degradation on <strong className="text-slate-100">{alert.cdn || 'CDN'}</strong> in{' '}
                  <span className="text-slate-200">{alert.city || 'Unknown'}</span> ({alert.isp || 'ISP'})
                </p>
                <div className="flex justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-900">
                  <span>Buffer: <b className="text-slate-300">{alert.avgBuffering ?? 0}s</b></span>
                  <span>QoE: <b className="text-rose-400">{Number(alert.qoeScore || 0).toFixed(1)}</b></span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
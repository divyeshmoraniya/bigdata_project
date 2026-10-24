import React, { useState } from 'react';
import { useTelemetryStore } from '../store/useTelemetryStore';

// Match the exact spelling shown across the dashboard cards
const CITIES = ["Mumbai", "Delhi", "Bengaluru", "Hyderabad", "Chennai", "Kolkata", "Pune"];
const ISPS = ["Jio", "Airtel", "Vodafone Idea", "Tata Play", "ACT Fibernet"];
const CDNS = ["Akamai", "Cloudflare", "AWS CloudFront", "Fastly"];

export default function IncidentInjector() {
  const [city, setCity] = useState("Mumbai");
  const [isp, setIsp] = useState("Jio");
  const [cdn, setCdn] = useState("Akamai");
  const [statusMsg, setStatusMsg] = useState("");

  const { injectIncident, isInjecting } = useTelemetryStore();

  const handleInject = async () => {
    setStatusMsg(`Flooding Kafka with severe lag logs for [${cdn}]...`);

    try {
      await injectIncident({
        city,
        isp,
        cdn,
        type: "buffer_spike",
        events: 2500
      });
      setStatusMsg(`🚨 Outage Injected for [${cdn} - ${city} - ${isp}]!`);
    } catch (err) {
      setStatusMsg(`❌ Failed: ${err.message || "Network error"}`);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl text-xs space-y-4 shadow-lg">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <h3 className="font-bold text-white text-sm flex items-center gap-2">
          <span>⚡</span> Chaos Testing & CDN Failover Control
        </h3>
        <span className="bg-rose-500/20 text-rose-400 px-2 py-0.5 rounded text-[10px] font-mono">
          Kafka Attack Flood
        </span>
      </div>

      <div>
        <label className="text-slate-400 font-semibold block mb-1">Target City</label>
        <select
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="w-full bg-slate-950 border border-slate-700 text-white rounded p-2 focus:outline-none"
        >
          {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div>
        <label className="text-slate-400 font-semibold block mb-1">Target ISP</label>
        <select
          value={isp}
          onChange={(e) => setIsp(e.target.value)}
          className="w-full bg-slate-950 border border-slate-700 text-white rounded p-2 focus:outline-none"
        >
          {ISPS.map((i) => <option key={i} value={i}>{i}</option>)}
        </select>
      </div>

      <div>
        <label className="text-slate-400 font-semibold block mb-1">Target CDN</label>
        <select
          value={cdn}
          onChange={(e) => setCdn(e.target.value)}
          className="w-full bg-slate-950 border border-slate-700 text-white rounded p-2 focus:outline-none"
        >
          {CDNS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <button
        onClick={handleInject}
        disabled={isInjecting}
        className="w-full py-2.5 px-4 rounded bg-rose-600 hover:bg-rose-500 font-bold text-white transition disabled:opacity-50"
      >
        {isInjecting ? "Injecting Attack..." : `🚨 Inject Outage on [${cdn}]`}
      </button>

      {statusMsg && (
        <div className="p-2 bg-slate-950 border border-slate-800 rounded font-mono text-[11px] text-slate-300">
          {statusMsg}
        </div>
      )}
    </div>
  );
}
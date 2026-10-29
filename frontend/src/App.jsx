import React, { useState, useEffect, useMemo } from 'react';
import { useTelemetryStore } from './store/useTelemetryStore';
import IncidentInjector from './components/IncidentInjector';
import LivePlayerMonitor from './components/LivePlayerMonitor';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import {
  Activity,
  ShieldCheck,
  Radio,
  ArrowRight,
  Gauge,
  Wifi,
  Server,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Pin,
  PinOff,
  Maximize2,
  Minimize2,
  TrendingUp,
  TrendingDown,
  Filter,
  BarChart3,
  Layers,
  Sparkles,
  RefreshCw,
  SlidersHorizontal,
  ChevronDown
} from 'lucide-react';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const CDNS = ['Akamai', 'Cloudflare', 'Fastly', 'AWS CloudFront'];
const CDN_THEMES = {
  Akamai: {
    border: '#38bdf8',
    gradientStart: 'rgba(56, 189, 248, 0.28)',
    gradientEnd: 'rgba(56, 189, 248, 0.0)',
    badge: 'bg-sky-500/10 text-sky-400 border-sky-500/20'
  },
  Cloudflare: {
    border: '#fb923c',
    gradientStart: 'rgba(251, 146, 60, 0.28)',
    gradientEnd: 'rgba(251, 146, 60, 0.0)',
    badge: 'bg-orange-500/10 text-orange-400 border-orange-500/20'
  },
  Fastly: {
    border: '#f472b6',
    gradientStart: 'rgba(244, 114, 182, 0.28)',
    gradientEnd: 'rgba(244, 114, 182, 0.0)',
    badge: 'bg-pink-500/10 text-pink-400 border-pink-500/20'
  },
  'AWS CloudFront': {
    border: '#34d399',
    gradientStart: 'rgba(52, 211, 153, 0.28)',
    gradientEnd: 'rgba(52, 211, 153, 0.0)',
    badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
  },
};

export default function App() {
  const { initSocket, fetchInitialData, metrics, steeringHistory, alerts } = useTelemetryStore();
  const [chartHistory, setChartHistory] = useState([]);
  const [pinnedCdns, setPinnedCdns] = useState(['Akamai', 'Cloudflare']);
  const [timeRange, setTimeRange] = useState('1m'); // '30s', '1m', '5m'
  const [selectedMetro, setSelectedMetro] = useState('ALL');
  const [expandedGraph, setExpandedGraph] = useState(false);

  useEffect(() => {
    initSocket();
    fetchInitialData();
  }, []);

  // Sync incoming telemetry micro-batches into rolling chart slices
  useEffect(() => {
    if (!metrics || metrics.length === 0) return;

    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const slice = { time: timestamp };

    CDNS.forEach((c) => {
      const segs = metrics.filter((m) => m.cdn === c);
      if (segs.length > 0) {
        const avgQoE = segs.reduce((acc, curr) => acc + (Number(curr.qoeScore) || 90), 0) / segs.length;
        const avgBuf = segs.reduce((acc, curr) => acc + (Number(curr.avgBuffering) || 0), 0) / segs.length;
        const avgBit = segs.reduce((acc, curr) => acc + (Number(curr.avgBitrate) || 4500), 0) / segs.length;
        slice[`${c}_qoe`] = Math.round(avgQoE * 10) / 10;
        slice[`${c}_buf`] = Math.round(avgBuf * 100) / 100;
        slice[`${c}_bit`] = Math.round(avgBit / 1000 * 10) / 10;
      } else {
        slice[`${c}_qoe`] = 92.0;
        slice[`${c}_buf`] = 0.08;
        slice[`${c}_bit`] = 4.8;
      }
    });

    const maxPoints = timeRange === '30s' ? 15 : timeRange === '1m' ? 30 : 60;
    setChartHistory((prev) => [...prev.slice(-maxPoints), slice]);
  }, [metrics, timeRange]);

  // Aggregate Executive KPIs
  const globalKPIs = useMemo(() => {
    if (!metrics || metrics.length === 0) return { avgQoE: 94.2, avgBuffer: 0.12, sessions: 8420, activeFailovers: 0 };
    const avgQoE = metrics.reduce((acc, m) => acc + (Number(m.qoeScore) || 0), 0) / metrics.length;
    const avgBuffer = metrics.reduce((acc, m) => acc + (Number(m.avgBuffering) || 0), 0) / metrics.length;
    const sessions = metrics.reduce((acc, m) => acc + (Number(m.activeSessions) || 0), 0);
    const activeFailovers = metrics.filter((m) => m.isRerouted || Number(m.qoeScore) < 70).length;
    return {
      avgQoE: avgQoE.toFixed(1),
      avgBuffer: avgBuffer.toFixed(2),
      sessions: sessions.toLocaleString(),
      activeFailovers
    };
  }, [metrics]);

  const togglePin = (cdnName) => {
    setPinnedCdns((prev) =>
      prev.includes(cdnName) ? prev.filter((c) => c !== cdnName) : [...prev, cdnName]
    );
  };

  // Base Chart.js Options
  const baseChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#090d16',
        titleColor: '#f1f5f9',
        bodyColor: '#cbd5e1',
        borderColor: '#1e293b',
        borderWidth: 1,
        padding: 12,
        boxPadding: 6,
        usePointStyle: true,
      },
    },
    scales: {
      x: {
        grid: { color: 'rgba(30, 41, 59, 0.4)' },
        ticks: { color: '#64748b', font: { size: 10, family: 'monospace' } },
      },
      y: {
        grid: { color: 'rgba(30, 41, 59, 0.4)' },
        ticks: { color: '#64748b', font: { size: 10, family: 'monospace' } },
      },
    },
  };

  // Primary Multi-CDN Fleet Line Data
  const fleetQoEChartData = {
    labels: chartHistory.map((h) => h.time),
    datasets: CDNS.map((c) => ({
      label: `${c} ITU-T QoE`,
      data: chartHistory.map((h) => h[`${c}_qoe`]),
      borderColor: CDN_THEMES[c].border,
      backgroundColor: CDN_THEMES[c].gradientStart,
      fill: true,
      tension: 0.38,
      borderWidth: 2.2,
      pointRadius: 0,
      pointHoverRadius: 5,
    })),
  };

  // Buffer Comparison Bar Chart Data
  const bufferBarData = {
    labels: CDNS,
    datasets: [
      {
        label: 'Average Buffering (s)',
        data: CDNS.map((c) => {
          const segs = metrics.filter((m) => m.cdn === c);
          return segs.length > 0 ? (segs.reduce((a, b) => a + Number(b.avgBuffering || 0), 0) / segs.length).toFixed(2) : 0.08;
        }),
        backgroundColor: CDNS.map((c) => CDN_THEMES[c].border),
        borderRadius: 8,
      },
    ],
  };

  // Filtered Regional Segments
  const filteredMetrics = useMemo(() => {
    if (selectedMetro === 'ALL') return metrics;
    return metrics.filter((m) => m.city.toUpperCase() === selectedMetro.toUpperCase());
  }, [metrics, selectedMetro]);

  return (
    <div className="min-h-screen bg-[#06090e] text-slate-100 font-sans selection:bg-blue-500/20 selection:text-blue-300">
      {/* 1. Executive Top Navbar */}
      <header className="border-b border-slate-800/80 bg-[#090d16]/90 backdrop-blur-md sticky top-0 z-50 px-6 py-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Radio className="w-4 h-4 text-white animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-tight text-white flex items-center gap-2">
                Video QoE Telemetry & Multi-CDN Steering Hub
              </h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20 font-semibold">
                Production Core
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Distributed PySpark Micro-Batches • Redis Dynamic Rerouting • Sub-Millisecond Failover Engine
            </p>
          </div>
        </div>

        {/* Global Toolbar Controls */}
        <div className="flex items-center gap-3">
          {/* Time Window Selector (Notion style) */}
          <div className="bg-[#0e1626] border border-slate-800 rounded-lg p-0.5 flex items-center text-xs font-medium">
            {['30s', '1m', '5m'].map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  timeRange === range
                    ? 'bg-blue-600 text-white font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {range}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs font-mono font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            Socket Live (:5000)
          </div>
        </div>
      </header>

      <main className="max-w-[1700px] mx-auto p-6 space-y-6">
        {/* 2. Executive KPI Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-[#090d16] border border-slate-800/80 rounded-xl p-4 shadow-sm hover:border-slate-700 transition-all flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-400">Network Fleet QoE</p>
              <h3 className="text-2xl font-bold text-white mt-1">
                {globalKPIs.avgQoE}
                <span className="text-xs font-normal text-slate-500 ml-1">/ 100 ITU-T</span>
              </h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Gauge className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-[#090d16] border border-slate-800/80 rounded-xl p-4 shadow-sm hover:border-slate-700 transition-all flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-400">Mean Rebuffering Ratio</p>
              <h3 className="text-2xl font-bold text-white mt-1">
                {globalKPIs.avgBuffer}
                <span className="text-xs font-normal text-slate-500 ml-1">sec</span>
              </h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Clock className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-[#090d16] border border-slate-800/80 rounded-xl p-4 shadow-sm hover:border-slate-700 transition-all flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-400">Active Live Sessions</p>
              <h3 className="text-2xl font-bold text-white mt-1">{globalKPIs.sessions}</h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Wifi className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-[#090d16] border border-slate-800/80 rounded-xl p-4 shadow-sm hover:border-slate-700 transition-all flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-400">Active Steering Actions</p>
              <h3 className={`text-2xl font-bold mt-1 ${globalKPIs.activeFailovers > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {globalKPIs.activeFailovers}
              </h3>
            </div>
            <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${
              globalKPIs.activeFailovers > 0
                ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
            }`}>
              {globalKPIs.activeFailovers > 0 ? <AlertTriangle className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
            </div>
          </div>
        </div>

        {/* 3. Primary Multi-CDN Composite Chart */}
        <div className={`bg-[#090d16] border border-slate-800/90 rounded-2xl p-5 shadow-xl transition-all duration-300 ${
          expandedGraph ? 'h-[480px]' : 'h-[360px]'
        } flex flex-col justify-between`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
            <div>
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-400" />
                <h2 className="text-sm font-bold text-white">Multi-CDN Composite Fleet QoE Spectrum</h2>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Continuous real-time sliding window across all active CDN edge delivery nodes
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {CDNS.map((c) => (
                <div key={c} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#0e1626] border border-slate-800 text-xs">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CDN_THEMES[c].border }}></span>
                  <span className="text-slate-300 font-medium">{c}</span>
                </div>
              ))}

              <button
                onClick={() => setExpandedGraph(!expandedGraph)}
                className="p-1.5 rounded-lg bg-[#0e1626] border border-slate-800 text-slate-400 hover:text-white transition-colors"
                title="Toggle Graph Height"
              >
                {expandedGraph ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex-1 w-full pt-4 min-h-0">
            <Line
              data={fleetQoEChartData}
              options={{
                ...baseChartOptions,
                scales: {
                  ...baseChartOptions.scales,
                  y: {
                    ...baseChartOptions.scales.y,
                    min: 0,
                    max: 100,
                    ticks: {
                      ...baseChartOptions.scales.y.ticks,
                      stepSize: 20,
                      callback: (val) => `${val} QoE`,
                    },
                  },
                },
              }}
            />
          </div>
        </div>

        {/* 4. Pinnable CDN Performance Cards (Notion Style Grid) */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-400" />
              Isolated CDN Edge Breakdowns (Pin to analyze)
            </h3>
            <span className="text-xs text-slate-500 font-mono">
              {pinnedCdns.length} pinned to priority monitor
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {CDNS.map((cdnName) => {
              const latestData = chartHistory[chartHistory.length - 1];
              const score = latestData ? latestData[`${cdnName}_qoe`] : 92.0;
              const buffer = latestData ? latestData[`${cdnName}_buf`] : 0.05;
              const bitrate = latestData ? latestData[`${cdnName}_bit`] : 4.8;
              const isFailing = score < 70;
              const isPinned = pinnedCdns.includes(cdnName);

              return (
                <div
                  key={cdnName}
                  className={`bg-[#090d16] border rounded-2xl p-4 flex flex-col justify-between transition-all duration-200 ${
                    isPinned ? 'ring-1 ring-blue-500/30' : ''
                  } ${
                    isFailing
                      ? 'border-rose-500/50 bg-rose-950/10 shadow-lg shadow-rose-950/20'
                      : 'border-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CDN_THEMES[cdnName].border }}></span>
                        <h4 className="font-bold text-sm text-white">{cdnName}</h4>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 text-[11px] font-mono text-slate-400">
                        <span>Buf: <b className={buffer > 1 ? 'text-rose-400' : 'text-slate-200'}>{buffer}s</b></span>
                        <span>Bitrate: <b className="text-slate-200">{bitrate} Mbps</b></span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                          isFailing ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300'
                        }`}
                      >
                        {score} QoE
                      </span>
                      <button
                        onClick={() => togglePin(cdnName)}
                        className={`p-1 rounded hover:bg-slate-800 transition ${isPinned ? 'text-blue-400' : 'text-slate-600'}`}
                        title={isPinned ? 'Unpin Card' : 'Pin Card'}
                      >
                        {isPinned ? <Pin className="w-3.5 h-3.5 fill-current" /> : <PinOff className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Individual Sparkline */}
                  <div className="h-28 w-full mt-4">
                    <Line
                      data={{
                        labels: chartHistory.map((h) => h.time),
                        datasets: [
                          {
                            label: `${cdnName} QoE`,
                            data: chartHistory.map((h) => h[`${cdnName}_qoe`]),
                            borderColor: CDN_THEMES[cdnName].border,
                            backgroundColor: CDN_THEMES[cdnName].gradientStart,
                            fill: true,
                            tension: 0.35,
                            borderWidth: 1.8,
                            pointRadius: 0,
                          },
                        ],
                      }}
                      options={{
                        ...baseChartOptions,
                        scales: {
                          x: { display: false },
                          y: { min: 0, max: 100, display: false },
                        },
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 5. Deep-Dive Metrics: Buffering Stall Distribution */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-[#090d16] border border-slate-800/90 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-amber-400" />
                  Mean Buffer Stall Duration (By CDN)
                </h3>
                <span className="text-[10px] font-mono text-slate-500">Threshold &lt; 0.5s</span>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Comparative stall delay calculated across currently active regional viewer clusters
              </p>
            </div>

            <div className="h-52 w-full mt-4">
              <Bar
                data={bufferBarData}
                options={{
                  ...baseChartOptions,
                  scales: {
                    ...baseChartOptions.scales,
                    y: {
                      ...baseChartOptions.scales.y,
                      ticks: { callback: (v) => `${v}s` },
                    },
                  },
                }}
              />
            </div>
          </div>

          <div className="lg:col-span-2">
            <LivePlayerMonitor />
          </div>
        </div>

        {/* 6. Operations & Chaos Injection Suite */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Chaos Fault Injection & Steering Policies */}
          <div className="lg:col-span-4 space-y-6">
            <IncidentInjector />

            {/* Dynamic Steering Log */}
            <div className="bg-[#090d16] border border-slate-800/90 rounded-2xl p-5 shadow-xl">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  Live Dynamic Steering Policies
                </h3>
                <span className="text-[10px] font-mono text-slate-400">Valkey / Redis</span>
              </div>

              <div className="mt-4 space-y-2.5 max-h-72 overflow-y-auto font-mono text-xs pr-1">
                {steeringHistory.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 text-xs flex flex-col items-center justify-center">
                    <CheckCircle2 className="w-6 h-6 text-slate-600 mb-1 opacity-60" />
                    All edge traffic optimal. No active failover keys.
                  </div>
                ) : (
                  steeringHistory.map((policy, idx) => (
                    <div key={idx} className="p-3 bg-[#0d1322] border border-indigo-500/30 rounded-xl space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className="text-slate-200">{policy.city} ({policy.isp})</span>
                        <span className="text-[10px] text-amber-400 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                          Active Failover
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-rose-400 font-bold line-through">[{policy.fromCdn || policy.failedCdn}]</span>
                        <ArrowRight className="w-3.5 h-3.5 text-indigo-400" />
                        <span className="text-emerald-400 font-bold">[{policy.toCdn || policy.activeCdn}]</span>
                      </div>
                      <p className="text-[11px] text-slate-400 italic font-sans">{policy.reason || 'Autonomous QoE recovery'}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Indian Transit Hub Matrix & Audit Logs */}
          <div className="lg:col-span-8 space-y-6">
            {/* Metro Selector Filter Bar */}
            <div className="bg-[#090d16] border border-slate-800/90 rounded-2xl p-5 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                    Regional Ingestion Topology (Live PySpark Sliding Output)
                  </h3>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs text-slate-500 mr-1 flex items-center gap-1"><Filter className="w-3 h-3" /> Filter:</span>
                  {['ALL', 'MUMBAI', 'DELHI', 'BENGALURU', 'CHENNAI'].map((metro) => (
                    <button
                      key={metro}
                      onClick={() => setSelectedMetro(metro)}
                      className={`text-xs px-2.5 py-1 rounded-md transition font-mono ${
                        selectedMetro === metro
                          ? 'bg-blue-600 text-white font-semibold'
                          : 'bg-[#0e1626] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {metro}
                    </button>
                  ))}
                </div>
              </div>

              {/* Segment Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 mt-4">
                {filteredMetrics.map((seg, i) => {
                  const score = Number(seg.qoeScore) || 90;
                  const isDegraded = score < 70;

                  return (
                    <div
                      key={i}
                      className={`p-3.5 rounded-xl border transition-all ${
                        seg.isRerouted
                          ? 'bg-amber-950/20 border-amber-500/40'
                          : isDegraded
                          ? 'bg-rose-950/30 border-rose-500/50'
                          : 'bg-[#0c1220] border-slate-800/80 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-bold text-sm text-white">{seg.city}</h4>
                          <span className="text-xs text-slate-400">{seg.isp}</span>
                        </div>
                        <span
                          className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${
                            isDegraded
                              ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                              : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          }`}
                        >
                          {score.toFixed(1)} QoE
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 mt-3 text-xs bg-[#070b14] p-2 rounded-lg border border-slate-800/60 font-mono">
                        <div>
                          <span className="text-slate-500 block text-[10px]">BUFFERING</span>
                          <span className={seg.avgBuffering > 1 ? 'text-rose-400 font-bold' : 'text-slate-200'}>
                            {seg.avgBuffering}s
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px]">BITRATE</span>
                          <span className="text-slate-200">{Math.round(seg.avgBitrate / 1000)} Mbps</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs mt-2.5 pt-2 border-t border-slate-800/60">
                        <span className="text-slate-500 text-[11px]">Provider:</span>
                        <span className="font-semibold text-slate-200" style={{ color: CDN_THEMES[seg.cdn]?.border || '#fff' }}>
                          {seg.cdn}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Incident & Recovery Audit Log */}
            <div className="bg-[#090d16] border border-slate-800/90 rounded-2xl p-5 shadow-xl">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-purple-400" />
                Rerouting & Chaos Injection Audit Trail
              </h3>
              <div className="max-h-44 overflow-y-auto space-y-2 pr-1 font-mono text-xs">
                {alerts.length === 0 ? (
                  <div className="text-center py-4 text-slate-500 text-xs">No active alerts recorded.</div>
                ) : (
                  alerts.map((al, idx) => (
                    <div key={idx} className="p-2.5 bg-[#0c1220] border border-slate-800 rounded-lg flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-rose-400 font-bold">[CRITICAL_DEGRADATION]</span>
                        <span className="text-slate-200">{al.cdn} failed in {al.city} ({al.isp})</span>
                      </div>
                      <span className="text-slate-500 text-[11px]">
                        {al.createdAt ? new Date(al.createdAt).toLocaleTimeString() : new Date().toLocaleTimeString()}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
import { create } from 'zustand';
import axios from 'axios';
import { io } from 'socket.io-client';

const BACKEND_BASE = 'http://localhost:5000';
const API_BASE = `${BACKEND_BASE}/api/telemetry`;

export const useTelemetryStore = create((set, get) => ({
  metrics: [],
  alerts: [],
  activeReroutes: {},
  steeringHistory: [],
  loading: false,
  isInjecting: false,
  socket: null,

  // Initialize socket listener for live telemetry, alerts & reroutes
  initSocket: () => {
    if (get().socket) return;

    const socket = io(BACKEND_BASE, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
    });

    // 1. Live micro-batch segments coming every 2s
    socket.on('telemetry_tick', (incomingMetrics) => {
      const dataArray = Array.isArray(incomingMetrics)
        ? incomingMetrics
        : [incomingMetrics];

      set((state) => ({
        metrics: dataArray.length > 0 ? dataArray : state.metrics,
      }));
    });

    // 2. Incident alerts flagged by Spark
    const handleAlert = (newAlert) => {
      if (!newAlert) return;
      set((state) => ({
        alerts: [newAlert, ...state.alerts.slice(0, 19)],
      }));
    };
    socket.on('qoe_alert', handleAlert);
    socket.on('critical_incident', handleAlert);

    // 3. Automated steering decision broadcasted by steeringEngine.js
    const handleReroute = (decision) => {
      if (!decision) return;
      const targetCdn = decision.toCdn || decision.fallbackCdn || decision.activeCdn;
      const key = `${decision.city}:${decision.isp}`;

      set((state) => ({
        activeReroutes: {
          ...state.activeReroutes,
          [key]: targetCdn,
        },
        steeringHistory: [decision, ...state.steeringHistory.slice(0, 9)],
      }));
    };
    socket.on('steering_decision', handleReroute);
    socket.on('traffic_rerouted', handleReroute);

    set({ socket });
  },

  // Fetch initial telemetry and alerts safely
  fetchInitialData: async () => {
    set({ loading: true });
    try {
      const [metricsRes, alertsRes] = await Promise.all([
        axios.get(`${API_BASE}/metrics`).catch(() => ({ data: [] })),
        axios.get(`${API_BASE}/alerts`).catch(() => ({ data: [] })),
      ]);

      const metricsData = Array.isArray(metricsRes.data)
        ? metricsRes.data
        : metricsRes.data?.data || [];

      const alertsData = Array.isArray(alertsRes.data)
        ? alertsRes.data
        : alertsRes.data?.data || [];

      set({
        metrics: metricsData,
        alerts: alertsData,
        loading: false,
      });
    } catch (err) {
      console.error('Failed to load initial data:', err);
      set({ loading: false });
    }
  },

  // Chaos injection handler matching server.js endpoint
  injectIncident: async (payload) => {
    set({ isInjecting: true });
    try {
      // Matches app.post('/api/incident/inject') in server.js
      await axios.post(`${BACKEND_BASE}/api/incident/inject`, {
        city: payload.city || 'Mumbai',
        isp: payload.isp || 'Jio',
        cdn: payload.cdn || 'Akamai',
        type: payload.type || 'buffer_spike',
        events: payload.events || 2500,
      });
      set({ isInjecting: false });
    } catch (err) {
      console.error('Incident injection failed:', err);
      set({ isInjecting: false });
    }
  },
}));
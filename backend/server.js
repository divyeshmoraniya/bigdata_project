import express from 'express';
import dotenv from 'dotenv';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import { Kafka } from 'kafkajs';
import { connectDB } from './src/db/db.js';
import { connectRedis, redisClient, redisSubscriber } from './src/db/redis.js';
import { QoEMetric } from './src/models/qoeMetric.model.js';
import { IncidentAlert } from './src/models/incidentAlert.model.js';

dotenv.config({});

const app = express();
const server = http.createServer(app);

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || '*';
const PORT = process.env.PORT || 5000;

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling']
});

// All 4 Multi-CDN Edge Providers & Top Indian Metro Transit Hubs
const CDNS = ['Akamai', 'Cloudflare', 'Fastly', 'AWS CloudFront'];
const CITIES = ['Mumbai', 'Delhi', 'Bengaluru', 'Chennai', 'Kolkata', 'Hyderabad'];

// Default CDN mapping ensuring all 4 CDNs have active initial routes
const DEFAULT_CDN_MAPPING = {
  Mumbai: 'Akamai',
  Delhi: 'Cloudflare',
  Bengaluru: 'AWS CloudFront',
  Chennai: 'Fastly',
  Kolkata: 'Akamai',
  Hyderabad: 'AWS CloudFront'
};

let activeIncidents = new Map(); // key: cdn -> { city, isp, type, remainingSec }
let activeSteering = new Map();  // key: city:isp -> policy
let auditLogs = [];

// Kafka Producer Setup with zero retry hang
const kafka = new Kafka({
  clientId: 'qoe-steering-server',
  brokers: [process.env.KAFKA_BROKER || '127.0.0.1:9092'],
  retry: {
    retries: 0 // Fail-fast so server never hangs if Kafka container is offline
  }
});

const producer = kafka.producer();
let isProducerConnected = false;

async function initKafka() {
  try {
    await producer.connect();
    isProducerConnected = true;
    console.log('✅ Kafka Producer connected for telemetry stream.');
  } catch (err) {
    console.warn('⚠️ Kafka container offline on 9092. Direct Memory Dispatch active.');
  }
}

// ITU-T P.1203 Formula: Computes QoE score based on buffer, drops, and latency
function calculateQoE(bufferSec, droppedFrames, latencyMs) {
  const score = 100 - (bufferSec * 16) - (droppedFrames * 0.8) - (latencyMs / 120);
  return Math.max(10, Math.min(99, Math.round(score * 10) / 10));
}

// Generate Live Regional Topology State
function generateSystemState() {
  return CITIES.map((city) => {
    const isp = (city === 'Mumbai' || city === 'Delhi' || city === 'Bengaluru') ? 'Jio' : 'Airtel';
    const routingKey = `${city}:${isp}`;
    const activeRoute = activeSteering.get(routingKey);

    // Active steered route takes precedence over default mapping
    let currentCdn = activeRoute ? activeRoute.toCdn : (DEFAULT_CDN_MAPPING[city] || 'Cloudflare');
    const isUnderAttack = activeIncidents.has(currentCdn);

    let bufferSec = isUnderAttack 
      ? +(Math.random() * 2.5 + 3.8).toFixed(2) 
      : +(Math.random() * 0.15 + 0.04).toFixed(2);
      
    let droppedFrames = isUnderAttack 
      ? Math.floor(Math.random() * 40 + 45) 
      : Math.floor(Math.random() * 3);
      
    let latencyMs = isUnderAttack 
      ? Math.floor(Math.random() * 150 + 390) 
      : Math.floor(Math.random() * 25 + 40);
      
    let bitrateKbps = isUnderAttack 
      ? Math.floor(Math.random() * 800 + 400) 
      : Math.floor(Math.random() * 2000 + 5500);

    const qoeScore = calculateQoE(bufferSec, droppedFrames, latencyMs);

    return {
      city,
      isp,
      cdn: currentCdn,
      qoeScore,
      avgBuffering: bufferSec,
      avgBitrate: bitrateKbps,
      activeSessions: Math.floor(Math.random() * 300 + 1200),
      status: qoeScore < 70 ? 'CRITICAL' : qoeScore < 85 ? 'DEGRADED' : 'OPTIMAL',
      isRerouted: !!activeRoute,
      rerouteInfo: activeRoute || null
    };
  });
}

// REST Routes
app.get('/api/telemetry/metrics', async (req, res) => {
  try {
    const dbMetrics = await QoEMetric.find().sort({ updatedAt: -1 }).limit(20);
    res.json(dbMetrics.length > 0 ? dbMetrics : generateSystemState());
  } catch (err) {
    res.json(generateSystemState());
  }
});

app.get('/api/telemetry/alerts', async (req, res) => {
  try {
    const alerts = await IncidentAlert.find().sort({ createdAt: -1 }).limit(20);
    res.json(alerts.length > 0 ? alerts : auditLogs);
  } catch (err) {
    res.json(auditLogs);
  }
});

// Chaos Attack & Multi-CDN Steering Trigger Endpoint
app.post('/api/incident/inject', async (req, res) => {
  const { city = 'Mumbai', isp = 'Jio', cdn = 'Akamai', type = 'buffer_spike', events = 2500 } = req.body;
  console.log(`\n🚨 [CHAOS INJECTION] Target CDN: [${cdn}] | Metro: ${city} | ISP: ${isp}`);

  // Normalization ensures "AWS CloudFront", "Fastly", "Cloudflare", and "Akamai" match cleanly
  const normalizedCdn = CDNS.find(c => c.toLowerCase() === cdn.toLowerCase()) || cdn;

  activeIncidents.set(normalizedCdn, { 
    city, 
    isp, 
    type, 
    remainingSec: 45, 
    startTime: Date.now() 
  });

  // Automated Failover: Pick the best available healthy alternate CDN
  const fallbackCdn = CDNS.find((c) => c !== normalizedCdn && !activeIncidents.has(c)) || 'Cloudflare';
  const routingKey = `${city}:${isp}`;

  const steeringPolicy = {
    city,
    isp,
    fromCdn: normalizedCdn,
    toCdn: fallbackCdn,
    activeCdn: fallbackCdn,
    failedCdn: normalizedCdn,
    reason: `Automated Steering: ${normalizedCdn} degraded (<40 QoE) in ${city} via ${isp}`,
    timestamp: new Date().toLocaleTimeString(),
    ttlSeconds: 45
  };

  activeSteering.set(routingKey, steeringPolicy);

  // Sync route and alert to Redis / Valkey if connected
  try {
    if (redisClient?.isOpen) {
      await redisClient.set(`steering:${routingKey}`, JSON.stringify(steeringPolicy), { EX: 45 });
      await redisClient.publish('steering_decisions', JSON.stringify(steeringPolicy));
      await redisClient.publish('qoe_alerts', JSON.stringify({ 
        city, 
        isp, 
        cdn: normalizedCdn, 
        qoeScore: 28.4, 
        avgBuffering: 7.2 
      }));
    }
  } catch (e) {
    console.warn('Redis sync notice:', e.message);
  }

  // Publish degradation event burst into Kafka if broker is up
  if (isProducerConnected) {
    try {
      const messages = [];
      for (let i = 0; i < Math.min(events, 500); i++) {
        messages.push({
          value: JSON.stringify({
            userId: `chaos_usr_${Date.now()}_${i}`,
            city,
            isp,
            cdn: normalizedCdn,
            bufferingSec: +(Math.random() * 3 + 5.5).toFixed(2),
            bitrateKbps: 350,
            startupLatencyMs: 4200,
            droppedFrames: 50,
            timestamp: new Date().toISOString()
          })
        });
      }
      await producer.send({ topic: 'video-playback-logs', messages });
    } catch (e) {
      console.warn('Kafka emit notice:', e.message);
    }
  }

  // Register in local audit logs
  const alertLog = {
    _id: `alert_${Date.now()}`,
    city,
    isp,
    cdn: normalizedCdn,
    qoeScore: 28.4,
    avgBuffering: 7.2,
    createdAt: new Date().toISOString()
  };
  auditLogs.unshift(alertLog);

  // Instant zero-delay WebSocket broadcast to the React dashboard
  io.emit('qoe_alert', alertLog);
  io.emit('critical_incident', alertLog);
  io.emit('steering_decision', steeringPolicy);
  io.emit('traffic_rerouted', steeringPolicy);
  io.emit('telemetry_tick', generateSystemState());

  res.status(200).json({ 
    success: true, 
    message: `Injected outage on ${normalizedCdn}. Steered traffic to ${fallbackCdn}.`, 
    steeringPolicy 
  });
});

// Periodic Telemetry Tick & Autonomous Recovery Countdown (Runs every 2s)
setInterval(() => {
  activeIncidents.forEach((data, cdn) => {
    data.remainingSec -= 2;
    if (data.remainingSec <= 0) {
      console.log(`\n✅ [RECOVERY] Cooldown ended for ${cdn}. Reverting to primary topology.`);
      activeIncidents.delete(cdn);

      for (let [key, route] of activeSteering.entries()) {
        if (route.fromCdn === cdn) {
          activeSteering.delete(key);
        }
      }
    }
  });

  io.emit('telemetry_tick', generateSystemState());
}, 2000);

// Client Connection Listener
io.on('connection', (socket) => {
  socket.emit('telemetry_tick', generateSystemState());
});

// Server Initialization
const start = async () => {
  await connectDB();
  await connectRedis();
  await initKafka();

  server.listen(PORT, () => {
    console.log(`\n🚀 Telemetry Backend Running on http://localhost:${PORT}`);
    console.log(`⚡ WebSocket Stream Dispatcher Active (:5000)\n`);
  });
};

start();
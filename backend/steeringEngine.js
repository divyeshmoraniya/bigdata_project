import redis from 'redis';
import dotenv from 'dotenv';

dotenv.config({});

const REDIS_URI =
  process.env.REDIS_URI  ;

const subClient = redis.createClient({ url: REDIS_URI });
const kvClient = redis.createClient({ url: REDIS_URI });

// Register error listeners to avoid unhandled socket exceptions
subClient.on('error', (err) => console.error('Redis SubClient Error:', err.message));
kvClient.on('error', (err) => console.error('Redis KVClient Error:', err.message));

const ALL_CDNS = ['Akamai', 'Cloudflare', 'Fastly', 'AWS CloudFront'];

async function startSteeringEngine() {
  try {
    await subClient.connect();
    await kvClient.connect();

    console.log('🛡️ Multi-CDN Traffic Steering Engine Active. Listening on [qoe_alerts]...');

    await subClient.subscribe('qoe_alerts', async (message) => {
      try {
        const incident = JSON.parse(message);
        const { city, isp, cdn, qoeScore, avgBuffering } = incident;

        // Select the optimal fallback CDN (exclude the degraded one)
        const candidates = ALL_CDNS.filter((c) => c !== cdn);
        const fallbackCDN = candidates[Math.floor(Math.random() * candidates.length)] || 'Cloudflare';

        const steeringKey = `steering:${city}:${isp}`;
        const timestamp = new Date().toLocaleTimeString();

        const steeringPolicy = {
          city,
          isp,
          fromCdn: cdn,
          toCdn: fallbackCDN,
          activeCdn: fallbackCDN,
          failedCdn: cdn,
          incidentQoE: qoeScore ?? 0,
          avgBuffering: avgBuffering ?? 0,
          reroutedAt: new Date().toISOString(),
          timestamp,
          ttlSeconds: 300 // Reroute traffic away for 5 minutes
        };

        // 1. Cache active routing policy in Redis with 5-minute TTL
        await kvClient.set(steeringKey, JSON.stringify(steeringPolicy), { EX: 300 });

        // 2. CRITICAL: Publish to 'steering_decisions' channel so Socket.io pushes to UI
        await kvClient.publish('steering_decisions', JSON.stringify(steeringPolicy));

        console.log(`\n🔀 [AUTOMATED TRAFFIC STEERING ACTIVATED]`);
        console.log(`⚠️ Degradation detected on [${cdn}] in ${city} via ${isp} (Buffer: ${avgBuffering}s, QoE: ${qoeScore})`);
        console.log(`🚀 Shifted all client traffic in ${city} (${isp}) ➔ ${fallbackCDN}`);
      } catch (err) {
        console.error('Failed to execute steering logic:', err.message);
      }
    });
  } catch (err) {
    console.error('Fatal initialization error in Steering Engine:', err);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down Steering Engine...');
  await subClient.disconnect();
  await kvClient.disconnect();
  process.exit(0);
});

startSteeringEngine();
import { Kafka } from 'kafkajs';
import { KAFKA_BROKER, TOPIC_NAME } from './config.js';

const kafka = new Kafka({ clientId: 'telemetry-stream-v2', brokers: [KAFKA_BROKER] });
const producer = kafka.producer();

const CITIES = ['Mumbai', 'Delhi', 'Bengaluru', 'Hyderabad', 'Ahmedabad', 'Chennai', 'Pune', 'Kolkata'];
const ISPS = ['Jio', 'Airtel', 'Vodafone Idea', 'Tata Play', 'ACT Fibernet'];
const CDNS = ['Cloudflare', 'Fastly', 'Akamai', 'AWS CloudFront'];
const DEVICES = ['SmartTV', 'Android Mobile', 'iOS Mobile', 'Web Browser'];
const RESOLUTIONS = ['4K', '1080p', '720p', '480p'];
const CONTENT = [
  { id: 'vid_101', title: 'ICC World Cup Live Final' },
  { id: 'vid_102', title: 'Stranger Things S5 Ep1' },
  { id: 'vid_103', title: 'Premier League Live Match' },
  { id: 'vid_104', title: 'Top Gun Maverick' },
  { id: 'vid_105', title: 'Breaking Bad 4K HDR' },
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

async function runGenerator() {
  await producer.connect();
  console.log('🚀 High-Velocity Telemetry Generator V2 Started...');

  let totalEmitted = 0;

  setInterval(async () => {
    const messages = [];

    // Produce batches of 500 records every 250ms (~2,000 events/sec)
    for (let i = 0; i < 500; i++) {
      const video = pick(CONTENT);
      const isMobile = Math.random() > 0.5;

      const payload = {
        userId: `usr_${Math.floor(100000 + Math.random() * 900000)}`,
        videoId: video.id,
        videoTitle: video.title,
        city: pick(CITIES),
        isp: pick(ISPS),
        cdn: pick(CDNS),
        device: pick(DEVICES),
        resolution: pick(RESOLUTIONS),
        bitrateKbps: Math.floor(1800 + Math.random() * 6200),
        bufferingSec: parseFloat((Math.random() > 0.92 ? Math.random() * 1.8 : 0.0).toFixed(2)),
        startupLatencyMs: Math.floor(180 + Math.random() * 600),
        droppedFrames: Math.floor(Math.random() * 15),
        timestamp: new Date().toISOString(),
      };

      messages.push({ value: JSON.stringify(payload) });
    }

    try {
      await producer.send({ topic: TOPIC_NAME, messages });
      totalEmitted += messages.length;
      if (totalEmitted % 5000 === 0) {
        console.log(`📊 Emitted ${totalEmitted.toLocaleString()} rich events into Kafka`);
      }
    } catch (err) {
      console.error('Producer error:', err.message);
    }
  }, 250);
}

runGenerator();
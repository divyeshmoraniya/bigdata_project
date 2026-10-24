import { Kafka } from 'kafkajs';
import { KAFKA_BROKER, TOPIC_NAME } from './config.js';

const kafka = new Kafka({
  clientId: 'telemetry-incident-injector',
  brokers: [KAFKA_BROKER],
});

const producer = kafka.producer();

async function injectIncident() {
  try {
    await producer.connect();
    console.log('🚨 INJECTING OUTAGE: Flooding 2,500 critical lag logs for [Mumbai - Jio - Akamai]...');

    const messages = [];

    // Send 2,500 events with current timestamps and complete payload fields
    for (let i = 0; i < 2500; i++) {
      const payload = {
        userId: `usr_${Math.floor(100000 + Math.random() * 900000)}`,
        videoId: 'vid_99',
        city: 'Dehli',
        isp: 'Airtel',
        cdn: 'Cloudflare', // <-- Critical: Must match your steering target
        bufferingSec: parseFloat((7.0 + Math.random() * 5.0).toFixed(2)),
        bitrateKbps: 320,
        startupLatencyMs: 4500,
        droppedFrames: 50,
        timestamp: new Date().toISOString(), // Fresh timestamp within current watermark
      };

      messages.push({ value: JSON.stringify(payload) });
    }

    // Send in batches of 500
    for (let i = 0; i < messages.length; i += 500) {
      await producer.send({
        topic: TOPIC_NAME,
        messages: messages.slice(i, i + 500),
      });
    }

    console.log('✅ Injected 2,500 severe buffering events into Kafka successfully.');
    await producer.disconnect();
  } catch (err) {
    console.error('❌ Failed to inject incident:', err.message);
  } finally {
    process.exit(0);
  }
}

injectIncident();
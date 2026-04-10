import axios from 'axios';

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3000';
const NATS_MONITOR_URL = process.env.NATS_MONITOR_URL || 'http://localhost:8222';
const MAX_RETRIES = 30;
const RETRY_DELAY_MS = 2000;

async function waitForService(url: string, name: string): Promise<void> {
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      const res = await axios.get(url, { timeout: 3000, validateStatus: () => true });
      if (res.status < 500) {
        console.log(`✅ ${name} is ready (${res.status})`);
        return;
      }
    } catch {
      // not ready yet
    }
    console.log(`⏳ Waiting for ${name}... (${i + 1}/${MAX_RETRIES})`);
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
  }
  throw new Error(`❌ ${name} did not become ready in time`);
}

async function checkNatsJetStream(): Promise<void> {
  try {
    const res = await axios.get(`${NATS_MONITOR_URL}/jsz`, {
      timeout: 3000,
      validateStatus: () => true,
    });
    if (res.status === 200) {
      const streams = res.data?.streams ?? 0;
      const consumers = res.data?.consumers ?? 0;
      console.log(`✅ NATS JetStream active (streams: ${streams}, consumers: ${consumers})`);
    } else if (res.status === 503 || res.status === 404) {
      console.warn(
        `⚠️  NATS JetStream NOT enabled (HTTP ${res.status}).\n` +
        `   Fix: add command: ["-js", "--http_port", "8222"] to the nats service\n` +
        `   in podman-compose.yml and restart the container.`
      );
    }
  } catch {
    console.warn(`⚠️  NATS monitor at ${NATS_MONITOR_URL} not reachable — JetStream check skipped`);
  }
}

export default async function globalSetup(): Promise<void> {
  console.log('\n🚀 Global Setup: Waiting for all services to be ready...\n');

  const services = [
    // FlexGate proxy (primary — port 3000 direct, 8080 via HAProxy)
    { url: `${GATEWAY_URL}/health`, name: 'FlexGate Proxy' },
    // Mock backend services used in tests
    { url: 'http://localhost:3001/health', name: 'api-users' },
    { url: 'http://localhost:3002/health', name: 'api-orders' },
    { url: 'http://localhost:3003/health', name: 'flaky-service' },
    { url: 'http://localhost:3004/health', name: 'slow-service' },
    { url: 'http://localhost:3005/health', name: 'webhook-receiver' },
  ];

  for (const svc of services) {
    await waitForService(svc.url, svc.name);
  }

  // Non-fatal: warn if JetStream is not enabled rather than blocking tests
  await checkNatsJetStream();

  console.log('\n✅ All services ready. Starting tests...\n');
}


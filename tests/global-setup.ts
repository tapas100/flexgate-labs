import axios from 'axios';

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3000';
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

  console.log('\n✅ All services ready. Starting tests...\n');
}

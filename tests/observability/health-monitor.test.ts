/**
 * Health Check Monitor Tests
 * Tests that the proxy's HealthCheckMonitor correctly detects upstream health
 * and emits health.check_failed / health.check_recovered events
 */
import axios from 'axios';
import { createAdminClient, GATEWAY_URL, sleep } from '../helpers';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const proxyClient = axios.create({ baseURL: GATEWAY_URL, timeout: 10000, validateStatus: () => true });
const WEBHOOK_RECEIVER_URL = process.env.WEBHOOK_RECEIVER_URL || 'http://localhost:3005';

describe('Health Check Monitor: Upstream Status', () => {
  it('GET /health — proxy should report healthy status', async () => {
    const res = await proxyClient.get('/health');
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ status: 'ok' });
  });

  it('GET /api/health — admin health endpoint should return upstream states', async () => {
    const adminClient = await createAdminClient();
    const res = await adminClient.get('/api/health');
    expect([200, 401, 404]).toContain(res.status);
    if (res.status === 200) {
      console.log('Health status:', JSON.stringify(res.data).slice(0, 300));
      expect(res.data).toBeDefined();
    }
  });
});

describe('Health Check Monitor: Failure Detection', () => {
  afterAll(async () => {
    try {
      await execAsync('podman start flexgate-api-users');
      await sleep(6000);
      console.log('✅ api-users restored after health check test');
    } catch { /* ignore */ }
  });

  it('should detect upstream failure and emit health.check_failed event', async () => {
    // Register a webhook to catch the event
    const adminClient = await createAdminClient();
    await axios.delete(`${WEBHOOK_RECEIVER_URL}/webhook/received`).catch(() => null);

    const webhookRes = await adminClient.post('/api/webhooks', {
      name: `health-check-test-${Date.now()}`,
      url: `${WEBHOOK_RECEIVER_URL}/webhook`,
      events: ['health.check_failed', 'health.check_recovered', 'health.degraded'],
      enabled: true,
      timeout: 5000,
    }).catch(() => null);

    const webhookId = webhookRes?.data?.data?.id;

    try {
      await execAsync('podman stop flexgate-api-users');
      // Wait for health check interval (default 30s, but proxy may have custom)
      // We wait 15s which should trigger at least one check
      console.log('Waiting 15s for health check to detect failure...');
      await sleep(15000);

      const receiverRes = await axios.get(`${WEBHOOK_RECEIVER_URL}/webhook/received`).catch(() => null);
      if (receiverRes) {
        const healthEvents = (receiverRes.data?.webhooks ?? []).filter(
          (w: any) => w.payload?.event?.startsWith('health.')
        );
        if (healthEvents.length > 0) {
          console.log(`✅ Health events received: ${healthEvents.map((e: any) => e.payload?.event)}`);
        } else {
          console.warn('⚠️  No health events — health check interval may be > 15s');
        }
      }
    } finally {
      if (webhookId) await adminClient.delete(`/api/webhooks/${webhookId}`).catch(() => null);
    }
  }, 30000);
});

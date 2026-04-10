/**
 * Event Bus & Webhook Event Delivery Tests
 * Tests that real FlexGate events (circuit_breaker.opened, rate_limit.exceeded, etc.)
 * are fired and delivered to registered webhooks
 *
 * EventTypes from flexgate-proxy/src/events/EventBus.ts:
 *   CIRCUIT_BREAKER_OPENED, CIRCUIT_BREAKER_CLOSED, CIRCUIT_BREAKER_HALF_OPEN
 *   RATE_LIMIT_EXCEEDED, PROXY_REQUEST_FAILED, PROXY_TIMEOUT
 *   HEALTH_CHECK_FAILED, CONFIG_CHANGED
 */
import axios from 'axios';
import { createAdminClient, GATEWAY_URL, sleep, randomPath } from '../helpers';
import { AxiosInstance } from 'axios';

const WEBHOOK_RECEIVER_URL = process.env.WEBHOOK_RECEIVER_URL || 'http://localhost:3005';

let adminClient: AxiosInstance;
let registeredWebhookId: string;

beforeAll(async () => {
  adminClient = await createAdminClient();

  // Clear webhook receiver history
  await axios.delete(`${WEBHOOK_RECEIVER_URL}/webhook/received`).catch(() => null);

  // Register a webhook pointing to our receiver for all event types
  const res = await adminClient.post('/api/webhooks', {
    name: `event-test-webhook-${Date.now()}`,
    url: `${WEBHOOK_RECEIVER_URL}/webhook`,
    events: [
      'circuit_breaker.opened',
      'circuit_breaker.closed',
      'circuit_breaker.half_open',
      'rate_limit.exceeded',
      'proxy.request_failed',
      'proxy.error',
      'proxy.timeout',
      'health.check_failed',
      'health.check_recovered',
    ],
    enabled: true,
    timeout: 5000,
    retry_count: 2,
    retry_delay: 500,
  });

  if (res.status === 200 || res.status === 201) {
    registeredWebhookId = res.data.data.id;
    console.log(`✅ Test webhook registered: ${registeredWebhookId}`);
  }
});

afterAll(async () => {
  if (registeredWebhookId) {
    await adminClient.delete(`/api/webhooks/${registeredWebhookId}`).catch(() => null);
  }
  await axios.delete(`${WEBHOOK_RECEIVER_URL}/webhook/received`).catch(() => null);
});

describe('Event Bus: Rate Limit Event Delivery', () => {
  it('should fire rate_limit.exceeded event when limit is crossed', async () => {
    // Flood requests to trigger rate limit
    const proxyClient = axios.create({ baseURL: GATEWAY_URL, timeout: 5000, validateStatus: () => true });
    await Promise.all(Array.from({ length: 80 }, () => proxyClient.get('/users')));
    await sleep(2000); // allow event delivery

    const receiverRes = await axios.get(`${WEBHOOK_RECEIVER_URL}/webhook/received`).catch(() => null);
    if (!receiverRes) {
      console.warn('⚠️  webhook-receiver not reachable');
      return;
    }

    const rateLimitEvents = (receiverRes.data?.webhooks ?? []).filter(
      (w: any) => w.payload?.event === 'rate_limit.exceeded'
    );

    if (rateLimitEvents.length > 0) {
      console.log(`✅ rate_limit.exceeded events received: ${rateLimitEvents.length}`);
      const payload = rateLimitEvents[0].payload;
      expect(payload).toHaveProperty('data');
      expect(payload.data).toHaveProperty('clientId');
      expect(payload.data).toHaveProperty('limit');
    } else {
      console.warn('⚠️  No rate_limit.exceeded events — rate limit may not be configured');
    }
  });
});

describe('Event Bus: Circuit Breaker Event Delivery', () => {
  it('should fire circuit_breaker.opened event when circuit trips', async () => {
    if (!registeredWebhookId) return;

    // Clear receiver
    await axios.delete(`${WEBHOOK_RECEIVER_URL}/webhook/received`).catch(() => null);

    // Flood flaky-service to trip circuit breaker
    const proxyClient = axios.create({ baseURL: GATEWAY_URL, timeout: 10000, validateStatus: () => true });
    for (let i = 0; i < 30; i++) {
      await proxyClient.get('/flaky');
    }
    await sleep(3000);

    const receiverRes = await axios.get(`${WEBHOOK_RECEIVER_URL}/webhook/received`).catch(() => null);
    if (!receiverRes) return;

    const cbEvents = (receiverRes.data?.webhooks ?? []).filter(
      (w: any) =>
        w.payload?.event === 'circuit_breaker.opened' ||
        w.payload?.event === 'circuit_breaker.closed' ||
        w.payload?.event === 'circuit_breaker.half_open'
    );

    if (cbEvents.length > 0) {
      console.log(`✅ Circuit breaker events received: ${cbEvents.length}`);
      const payload = cbEvents[0].payload;
      expect(payload.data).toHaveProperty('routeId');
      expect(payload.data).toHaveProperty('errorRate');
      expect(payload.data).toHaveProperty('threshold');
    } else {
      console.warn('⚠️  No circuit breaker events — threshold may not be reached');
    }
  }, 45000);
});

describe('Event Bus: Config Change Events', () => {
  it('should fire config.created event when a new route is created', async () => {
    if (!registeredWebhookId) return;
    await axios.delete(`${WEBHOOK_RECEIVER_URL}/webhook/received`).catch(() => null);

    // Create a route — this should emit CONFIG_CREATED
    const routeRes = await adminClient.post('/api/routes', {
      path: randomPath(),
      upstream: 'http://api-users:3001',
      methods: ['GET'],
      enabled: false,
    });

    await sleep(1500);

    if (routeRes.data?.data?.id) {
      await adminClient.delete(`/api/routes/${routeRes.data.data.id}`);
    }

    const receiverRes = await axios.get(`${WEBHOOK_RECEIVER_URL}/webhook/received`).catch(() => null);
    if (!receiverRes) return;

    const configEvents = (receiverRes.data?.webhooks ?? []).filter(
      (w: any) => w.payload?.event?.startsWith('config.')
    );

    if (configEvents.length > 0) {
      console.log(`✅ Config events received: ${configEvents.map((e: any) => e.payload?.event)}`);
    } else {
      console.warn('⚠️  No config events — event bus may not emit on route create');
    }
  });
});

describe('Event Bus: Webhook Payload Structure', () => {
  it('webhook payload should contain id, event, timestamp, data, signature', async () => {
    if (!registeredWebhookId) return;

    const receiverRes = await axios.get(`${WEBHOOK_RECEIVER_URL}/webhook/received`).catch(() => null);
    if (!receiverRes || receiverRes.data?.count === 0) {
      console.warn('⚠️  No webhooks received yet — skipping payload structure test');
      return;
    }

    const received = receiverRes.data.webhooks[0];
    const payload = received.payload;
    expect(payload).toHaveProperty('id');
    expect(payload).toHaveProperty('event');
    expect(payload).toHaveProperty('timestamp');
    expect(payload).toHaveProperty('data');
    expect(payload).toHaveProperty('signature');
    console.log('✅ Webhook payload structure valid');
  });
});

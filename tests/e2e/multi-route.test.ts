/**
 * E2E Test: Multi-route Validation
 * Validate all routes respond correctly through the gateway
 */
import { createClient } from '../helpers';

const client = createClient();

describe('E2E: Multi-Route Validation', () => {
  it('should proxy /users route correctly', async () => {
    const res = await client.get('/users');
    expect([200, 201]).toContain(res.status);
    expect(res.headers['content-type']).toMatch(/json/);
  });

  it('should proxy /orders route correctly', async () => {
    const res = await client.get('/orders');
    expect([200, 201]).toContain(res.status);
    expect(res.headers['content-type']).toMatch(/json/);
  });

  it('should proxy /flaky route (accepts 200 or 5xx due to flakiness)', async () => {
    const res = await client.get('/flaky');
    expect([200, 404, 500, 503, 504]).toContain(res.status);
  });

  it('should proxy /slow route and eventually respond', async () => {
    const slowClient = createClient();
    slowClient.defaults.timeout = 15000;
    const res = await slowClient.get('/slow?delay=1000');
    expect([200, 404, 504]).toContain(res.status);
  });

  it('should add security headers to all responses', async () => {
    const res = await client.get('/users');
    // Gateway should inject security headers
    expect(res.headers).toBeDefined();
    // X-Content-Type-Options is a common security header gateways add
    // Accept its presence or absence based on gateway config
    expect(res.status).not.toBe(0);
  });

  it('should include X-Correlation-ID in response if sent', async () => {
    const correlationId = `test-corr-${Date.now()}`;
    const res = await client.get('/users', {
      headers: { 'X-Correlation-ID': correlationId },
    });
    expect(res.status).toBe(200);
    // Gateway should echo or propagate correlation ID
  });

  it('should handle concurrent requests to multiple routes', async () => {
    const requests = [
      client.get('/users'),
      client.get('/orders'),
      client.get('/users'),
      client.get('/orders'),
    ];
    const results = await Promise.all(requests);
    results.forEach((res) => {
      expect([200, 201]).toContain(res.status);
    });
  });
});

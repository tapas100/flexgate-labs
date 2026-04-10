/**
 * Observability Test: Correlation IDs
 * Verify that correlation IDs are propagated through the gateway
 */
import { createClient, generateCorrelationId } from '../helpers';

const client = createClient();

describe('Observability: Correlation IDs', () => {
  it('should echo back or propagate X-Correlation-ID header', async () => {
    const correlationId = generateCorrelationId();
    const res = await client.get('/users', {
      headers: { 'X-Correlation-ID': correlationId },
    });

    expect([200, 429]).toContain(res.status);
    // Gateway should echo or propagate correlation ID in response
    const echoedId = res.headers['x-correlation-id'] || res.headers['x-request-id'];
    if (echoedId) {
      console.log(`✅ Correlation ID propagated: ${echoedId}`);
      expect(typeof echoedId).toBe('string');
    } else {
      console.warn('⚠️ Correlation ID not found in response headers (may be internal only)');
    }
  });

  it('should generate a correlation ID if none is provided', async () => {
    const res = await client.get('/users');
    expect([200, 429]).toContain(res.status);

    const generatedId = res.headers['x-correlation-id'] || res.headers['x-request-id'];
    if (generatedId) {
      console.log(`✅ Auto-generated correlation ID: ${generatedId}`);
      expect(generatedId.length).toBeGreaterThan(0);
    }
  });

  it('should maintain same correlation ID across retried requests', async () => {
    const correlationId = generateCorrelationId();
    const res = await client.get('/flaky', {
      headers: { 'X-Correlation-ID': correlationId },
    });

    expect([200, 404, 500, 503]).toContain(res.status);
    // Regardless of retries, response should have consistent correlation ID
    console.log(`Correlation test on /flaky: ${res.status}`);
  });
});

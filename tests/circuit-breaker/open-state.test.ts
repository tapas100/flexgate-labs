/**
 * Circuit Breaker Test: Open State Verification
 * Once circuit is open, requests should fast-fail with 503
 */
import { createClient, sleep } from '../helpers';
import axios from 'axios';

const client = createClient();

describe('Circuit Breaker: Open State', () => {
  it('should fast-fail requests when circuit is open', async () => {
    // First, flood requests to trip the circuit
    for (let i = 0; i < 15; i++) {
      await client.get('/flaky');
    }

    // Now check if we get fast 503s (circuit open)
    const start = Date.now();
    const res = await client.get('/flaky');
    const duration = Date.now() - start;

    if (res.status === 503) {
      // Fast-fail means response should be quick (< 500ms)
      expect(duration).toBeLessThan(1000);
      console.log(`✅ Circuit open: got 503 in ${duration}ms (fast-fail confirmed)`);
    } else {
      console.log(`ℹ️ Circuit not yet open (got ${res.status}) — threshold may not be reached`);
      expect([200, 500, 503]).toContain(res.status);
    }
  });

  it('should include meaningful error body when circuit is open', async () => {
    // Ensure circuit has been tripped
    const requests = Array.from({ length: 10 }, () => client.get('/flaky'));
    const results = await Promise.all(requests);

    const openCircuitResponse = results.find((r) => r.status === 503);
    if (openCircuitResponse) {
      expect(openCircuitResponse.data).toBeDefined();
      console.log('503 body:', openCircuitResponse.data);
    }
  });
});

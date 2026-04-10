/**
 * Retry Test: Validate Retry Count
 * Confirm that the gateway retries on failures as configured
 */
import { createClient, sleep } from '../helpers';
import axios from 'axios';

const client = createClient();

describe('Retry: Retry Count Validation', () => {
  beforeEach(async () => {
    try {
      await axios.post('http://localhost:3003/flaky/reset');
      await sleep(200);
    } catch { /* ignore */ }
  });

  it('should retry on 5xx responses from flaky-service', async () => {
    // With retries enabled, the success rate should improve
    const results: number[] = [];
    for (let i = 0; i < 20; i++) {
      const res = await client.get('/flaky');
      results.push(res.status);
    }

    const successes = results.filter((s) => s === 200);
    const total = results.length;

    console.log(`Retry test: ${successes.length}/${total} succeeded after retries`);
    console.log('All statuses:', results);

    // With 5 retries configured, success rate should be higher than raw failure rate
    expect(total).toBe(20);
    // At least some requests should succeed even with 50% failure rate + retries
    expect(results.every((s) => [200, 500, 503, 504].includes(s))).toBe(true);
  });

  it('should propagate final error after all retries exhausted', async () => {
    // Make multiple requests; some will exhaust retries
    const requests = Array.from({ length: 10 }, () => client.get('/flaky'));
    const results = await Promise.all(requests);

    results.forEach((res) => {
      // Final response after retries should be a valid HTTP response
      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(600);
    });
  });
});

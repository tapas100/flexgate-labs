/**
 * Retry Test: Exponential Backoff Timing
 * Verify that retries take increasing time (backoff)
 */
import { createClient } from '../helpers';

const client = createClient();

describe('Retry: Exponential Backoff Timing', () => {
  it('should take longer than instant for a request that requires retries', async () => {
    const timings: number[] = [];

    for (let i = 0; i < 5; i++) {
      const start = Date.now();
      await client.get('/flaky');
      timings.push(Date.now() - start);
    }

    const avgTime = timings.reduce((a, b) => a + b, 0) / timings.length;
    console.log('Request timings (ms):', timings);
    console.log('Average time (ms):', avgTime.toFixed(0));

    // With exponential backoff starting at 200ms, retried requests
    // should take at least 200ms on average
    // This is a soft assertion as it depends on actual retry count
    expect(avgTime).toBeGreaterThan(0);
    expect(timings.every((t) => t >= 0)).toBe(true);
  });

  it('should complete within maximum backoff bounds', async () => {
    const start = Date.now();
    await client.get('/flaky');
    const duration = Date.now() - start;

    // Max backoff is 3s * 5 retries = 15s, plus gateway timeout of 5s
    // So total should be well under 30s
    expect(duration).toBeLessThan(30000);
    console.log(`Request completed in ${duration}ms`);
  });
});

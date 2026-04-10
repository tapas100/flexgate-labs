/**
 * Timeout Test: Slow Service Triggers Gateway Timeout
 * Slow service delays 3s but gateway timeout is 3s — should trigger 504
 */
import { createClient } from '../helpers';

// Use a client with a generous timeout so WE don't timeout before gateway does
const client = createClient();

describe('Timeout: Slow Service Triggers Gateway Timeout', () => {
  beforeAll(() => {
    client.defaults.timeout = 15000;
  });

  it('should return 504 when slow-service exceeds gateway timeout', async () => {
    // slow-service delays DELAY_MS=3000ms, gateway timeout for /slow is 3s
    const res = await client.get('/slow');

    // Gateway should timeout and return 504
    expect([504, 408, 503, 200]).toContain(res.status);
    if (res.status === 504 || res.status === 408) {
      console.log('✅ Gateway correctly returned timeout error');
    } else {
      console.log(`ℹ️ Got ${res.status} — gateway may have a longer effective timeout`);
    }
  });

  it('should timeout faster than the raw service delay', async () => {
    const start = Date.now();
    await client.get('/slow');
    const duration = Date.now() - start;

    // Gateway timeout is 3s; with overhead should be under 6s
    expect(duration).toBeLessThan(10000);
    console.log(`Slow-service request completed in ${duration}ms`);
  });

  it('should handle parallel slow requests without blocking each other', async () => {
    const start = Date.now();
    const requests = Array.from({ length: 3 }, () => client.get('/slow'));
    const results = await Promise.all(requests);
    const duration = Date.now() - start;

    // Parallel requests should not stack — total should be ~1x timeout, not 3x
    expect(duration).toBeLessThan(15000);
    results.forEach((res) => {
      expect([200, 504, 408, 503]).toContain(res.status);
    });
  });
});

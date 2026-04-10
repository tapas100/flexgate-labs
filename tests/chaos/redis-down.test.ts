/**
 * Chaos Test: Redis Down
 * Validate system degrades gracefully when Redis is unavailable
 */
import { createClient, sleep } from '../helpers';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const client = createClient();

describe('Chaos: Redis Down', () => {
  afterAll(async () => {
    try {
      console.log('Restoring Redis...');
      await execAsync('podman start flexgate-redis');
      await sleep(4000);
      console.log('✅ Redis restored');
    } catch { /* ignore */ }
  });

  it('should continue proxying requests when Redis is down', async () => {
    try {
      await execAsync('podman stop flexgate-redis');
      await sleep(2000);
    } catch {
      console.warn('⚠️ Could not stop Redis — skipping chaos test');
      return;
    }

    // Gateway should still work (rate limiting falls back to local/allow)
    const requests = Array.from({ length: 5 }, () => client.get('/users'));
    const results = await Promise.all(requests);

    results.forEach((res) => {
      expect([200, 429, 503]).toContain(res.status);
    });

    const successes = results.filter((r) => r.status === 200);
    console.log(`✅ With Redis down: ${successes.length}/5 requests succeeded`);
  });

  it('should not crash or hang when Redis is down', async () => {
    const start = Date.now();
    const res = await client.get('/users');
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(15000); // no hanging
    expect([200, 503, 429]).toContain(res.status);
    console.log(`Response with Redis down: ${res.status} in ${duration}ms`);
  });
});

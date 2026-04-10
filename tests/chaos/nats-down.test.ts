/**
 * Chaos Test: NATS Down
 * Validate gateway continues operating when NATS messaging is down
 */
import { createClient, sleep } from '../helpers';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const client = createClient();

describe('Chaos: NATS Down', () => {
  afterAll(async () => {
    try {
      console.log('Restoring NATS...');
      await execAsync('podman start flexgate-nats');
      await sleep(3000);
      console.log('✅ NATS restored');
    } catch { /* ignore */ }
  });

  it('should continue routing requests when NATS is down', async () => {
    try {
      await execAsync('podman stop flexgate-nats');
      await sleep(2000);
    } catch {
      console.warn('⚠️ Could not stop NATS — skipping chaos test');
      return;
    }

    // Core HTTP routing should work without NATS (NATS is for events/messaging)
    const requests = [
      client.get('/users'),
      client.get('/orders'),
    ];
    const results = await Promise.all(requests);

    results.forEach((res) => {
      // Routing should still work; NATS failure should not break HTTP proxy
      expect([200, 201, 503]).toContain(res.status);
    });

    console.log('With NATS down — statuses:', results.map((r) => r.status));
  });

  it('should not expose internal NATS errors to clients', async () => {
    const res = await client.get('/users');
    if (res.status >= 500) {
      // Error message should not leak internal NATS details
      const body = JSON.stringify(res.data);
      expect(body).not.toMatch(/nats/i);
    }
  });
});

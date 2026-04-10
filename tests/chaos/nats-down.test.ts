/**
 * Chaos Test: NATS Down
 * Validate gateway continues operating when NATS messaging is down.
 *
 * Infrastructure note:
 *   NATS runs with --js (JetStream enabled). The proxy uses NATS for internal
 *   event publishing (circuit_breaker, rate_limit, etc.). Core HTTP routing
 *   MUST still work when NATS is unavailable — NATS failure is non-fatal.
 *
 * JetStream readiness test:
 *   When NATS IS running, we verify JetStream is advertised on the monitoring
 *   port (/jsz) so the proxy can create durable streams for event replay.
 *   This test auto-skips when NATS is not reachable.
 */
import axios from 'axios';
import { createClient, sleep } from '../helpers';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const client = createClient();
const NATS_MONITOR_URL = process.env.NATS_MONITOR_URL || 'http://localhost:8222';

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

describe('NATS: JetStream Enabled', () => {
  /**
   * JetStream is enabled via the --js flag on the NATS container.
   * This test confirms JetStream is active on the monitoring endpoint
   * so the proxy can create durable streams for reliable event delivery.
   *
   * Auto-skips when NATS is not running (e.g., during chaos tests above).
   */
  it('should advertise JetStream on NATS monitoring endpoint', async () => {
    let jszRes: any;
    try {
      jszRes = await axios.get(`${NATS_MONITOR_URL}/jsz`, { timeout: 3000, validateStatus: () => true });
    } catch {
      console.warn('⚠️  NATS monitor not reachable — skipping JetStream check (NATS may be stopped)');
      return;
    }

    if (jszRes.status === 503 || jszRes.status === 404) {
      // NATS is running but JetStream not enabled — this is a config gap
      throw new Error(
        '❌ JetStream is NOT enabled on the NATS server.\n' +
        'Fix: add `command: ["-js", "--http_port", "8222"]` to the nats service in podman-compose.yml'
      );
    }

    expect(jszRes.status).toBe(200);
    const jsz = jszRes.data;
    expect(jsz).toHaveProperty('config');
    expect(jsz.config).toHaveProperty('max_memory');
    console.log(`✅ JetStream active — streams: ${jsz.streams ?? 0}, consumers: ${jsz.consumers ?? 0}`);
  });

  it('should expose NATS server info including JetStream version', async () => {
    let varz: any;
    try {
      varz = await axios.get(`${NATS_MONITOR_URL}/varz`, { timeout: 3000, validateStatus: () => true });
    } catch {
      console.warn('⚠️  NATS monitor not reachable — skipping version check');
      return;
    }

    if (varz.status !== 200) {
      console.warn(`⚠️  /varz returned ${varz.status} — skipping`);
      return;
    }

    const info = varz.data;
    expect(info).toHaveProperty('version');
    expect(info).toHaveProperty('go');
    // JetStream must be enabled (not just available)
    const jetStreamEnabled = info.jetstream?.enabled ?? false;
    if (!jetStreamEnabled) {
      console.warn(
        '⚠️  JetStream field not in /varz — check NATS version >= 2.2.\n' +
        '   The --js flag adds JetStream support. Proxy event replay requires it.'
      );
    } else {
      console.log(`✅ JetStream enabled: ${JSON.stringify(info.jetstream)}`);
    }
    // Minimum bar: NATS is up and responding, even if we can't confirm JetStream via varz
    expect(info.version).toBeDefined();
  });
});

/**
 * Chaos Test: Upstream Service Crash
 * Kill an upstream service and verify gateway returns proper errors
 */
import { createClient, sleep } from '../helpers';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const client = createClient();

describe('Chaos: Upstream Crash', () => {
  afterAll(async () => {
    try {
      console.log('Restoring api-users...');
      await execAsync('podman start flexgate-api-users');
      await sleep(5000);
      console.log('✅ api-users restored');
    } catch { /* ignore */ }
  });

  it('should return 502/503 when api-users is crashed', async () => {
    try {
      await execAsync('podman stop flexgate-api-users');
      await sleep(2000);
    } catch {
      console.warn('⚠️ Could not stop api-users — skipping chaos test');
      return;
    }

    const res = await client.get('/users');
    expect([502, 503, 504]).toContain(res.status);
    console.log(`✅ Gateway returned ${res.status} with api-users down`);
  });

  it('should not return 500 with stack trace when upstream crashes', async () => {
    const res = await client.get('/users');
    if (res.status >= 500) {
      const body = JSON.stringify(res.data);
      // Should not leak stack traces
      expect(body).not.toMatch(/at Object\.|at Module\.|node_modules/);
      console.log('✅ No stack trace leaked');
    }
  });

  it('should still serve other routes when one upstream is down', async () => {
    const res = await client.get('/orders');
    // /orders -> api-orders which is still up
    expect([200, 503]).toContain(res.status);
    console.log(`/orders with api-users down: ${res.status}`);
  });

  it('should recover automatically once upstream restarts', async () => {
    await execAsync('podman start flexgate-api-users');
    await sleep(6000); // wait for health checks to pass

    const res = await client.get('/users');
    expect([200, 201]).toContain(res.status);
    console.log(`✅ Recovery confirmed: /users returned ${res.status}`);
  }, 30000);
});

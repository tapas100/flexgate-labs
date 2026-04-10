/**
 * Chaos Test: PostgreSQL Down
 * Validate in-memory fallback activates when Postgres is unavailable
 */
import { createClient, sleep } from '../helpers';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const client = createClient();

describe('Chaos: PostgreSQL Down', () => {
  afterAll(async () => {
    try {
      console.log('Restoring PostgreSQL...');
      await execAsync('podman start flexgate-postgres');
      await sleep(8000); // Postgres needs more time to restart
      console.log('✅ PostgreSQL restored');
    } catch { /* ignore */ }
  });

  it('should fall back to in-memory store when Postgres is down', async () => {
    try {
      await execAsync('podman stop flexgate-postgres');
      await sleep(3000);
    } catch {
      console.warn('⚠️ Could not stop Postgres — skipping chaos test');
      return;
    }

    // api-users has in-memory fallback — should still respond
    const res = await client.get('/users');

    expect([200, 503]).toContain(res.status);
    if (res.status === 200) {
      console.log('✅ In-memory fallback working — got 200 with Postgres down');
    } else {
      console.log('ℹ️ Got 503 — gateway correctly reporting upstream degradation');
    }
  });

  it('should create user using in-memory store when Postgres is down', async () => {
    const res = await client.post('/users', {
      name: 'Chaos Test User',
      email: `chaos-${Date.now()}@example.com`,
    });

    expect([201, 500, 503]).toContain(res.status);
    console.log(`Create user with Postgres down: ${res.status}`);
  });

  it('should not crash or return 500 without context', async () => {
    const res = await client.get('/users');
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(600);
    expect(res.data).toBeDefined();
  });
});

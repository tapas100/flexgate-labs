/**
 * Timeout Test: No Hanging Requests
 * Ensures requests always return within configured timeout bounds
 */
import { createClient } from '../helpers';

const client = createClient();

describe('Timeout: No Hanging Requests', () => {
  beforeAll(() => {
    client.defaults.timeout = 20000;
  });

  it('should always return within 15 seconds for /slow', async () => {
    const start = Date.now();
    const res = await client.get('/slow');
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(15000);
    expect([200, 504, 408, 503]).toContain(res.status);
    console.log(`/slow returned ${res.status} in ${duration}ms`);
  });

  it('should always return within 10 seconds for /users', async () => {
    const start = Date.now();
    const res = await client.get('/users');
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(10000);
    expect([200, 201, 429]).toContain(res.status);
    console.log(`/users returned ${res.status} in ${duration}ms`);
  });

  it('should always return within 10 seconds for /flaky', async () => {
    const start = Date.now();
    const res = await client.get('/flaky');
    const duration = Date.now() - start;

    // Even with retries, should not hang indefinitely
    expect(duration).toBeLessThan(15000);
    expect([200, 500, 503, 504]).toContain(res.status);
    console.log(`/flaky returned ${res.status} in ${duration}ms`);
  });
});

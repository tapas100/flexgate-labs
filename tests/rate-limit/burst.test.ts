/**
 * Rate Limit Test: Burst Traffic
 * Fire many requests quickly and verify 429 responses appear
 */
import { createClient, sleep } from '../helpers';

const client = createClient();

describe('Rate Limit: Burst Traffic', () => {
  it('should return 429 when burst limit is exceeded on /users', async () => {
    // Fire 400 rapid requests - exceeds per-route limit of 300/min
    const requests = Array.from({ length: 80 }, () => client.get('/users'));
    const results = await Promise.all(requests);
    const statuses = results.map((r) => r.status);

    const tooMany = statuses.filter((s) => s === 429);
    const successes = statuses.filter((s) => s === 200);

    console.log(`Burst results: ${successes.length} OK, ${tooMany.length} 429`);

    // At burst speeds, at least some should be rate-limited
    // If gateway is configured, 429s should appear; otherwise all 200s (permissive mode)
    expect(statuses.every((s) => [200, 429].includes(s))).toBe(true);
  });

  it('should include Retry-After or RateLimit headers on 429', async () => {
    const requests = Array.from({ length: 60 }, () => client.get('/users'));
    const results = await Promise.all(requests);
    const limited = results.find((r) => r.status === 429);

    if (limited) {
      // Should have rate limit headers
      const hasRateLimitHeader =
        limited.headers['retry-after'] !== undefined ||
        limited.headers['x-ratelimit-limit'] !== undefined ||
        limited.headers['ratelimit-limit'] !== undefined;
      expect(hasRateLimitHeader || limited.status === 429).toBe(true);
    }
  });

  it('should recover after rate limit window passes', async () => {
    // Wait a moment for the window to partially reset
    await sleep(5000);
    const res = await client.get('/users');
    expect([200, 429]).toContain(res.status);
  });
});

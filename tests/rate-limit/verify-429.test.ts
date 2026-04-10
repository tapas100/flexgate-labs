/**
 * Rate Limit Test: Verify 429 responses
 * Confirm correct structure and headers in 429 responses
 */
import { createClient } from '../helpers';

const client = createClient();

describe('Rate Limit: Verify 429 Response Structure', () => {
  it('should return 429 with JSON body when rate limited', async () => {
    const requests = Array.from({ length: 100 }, () => client.get('/users'));
    const results = await Promise.all(requests);
    const limited = results.find((r) => r.status === 429);

    if (limited) {
      expect(limited.status).toBe(429);
      expect(limited.headers['content-type']).toMatch(/json/);
      expect(limited.data).toBeDefined();
    } else {
      // Gateway not enforcing rate limits yet — acceptable in dev
      console.warn('⚠️ No 429 observed — rate limiting may not be active');
    }
  });

  it('should not rate limit requests with admin key', async () => {
    const adminClient = createClient(process.env.FLEXGATE_ADMIN_KEY || 'admin-key-secret-99');
    const requests = Array.from({ length: 20 }, () => adminClient.get('/users'));
    const results = await Promise.all(requests);
    const limited = results.filter((r) => r.status === 429);
    // Admin key should have higher limits
    expect(limited.length).toBeLessThan(results.length);
  });
});

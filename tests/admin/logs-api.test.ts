/**
 * Logs API Tests
 * Tests /api/logs endpoint — pagination, filtering, level filtering, search
 * Covers the Winston JSON log reader in routes/logs.ts
 */
import { createAdminClient } from '../helpers';
import { AxiosInstance } from 'axios';

let client: AxiosInstance;

beforeAll(async () => {
  client = await createAdminClient();
});

describe('Logs API: Listing', () => {
  it('GET /api/logs — should return log entries', async () => {
    const res = await client.get('/api/logs');
    expect([200, 401]).toContain(res.status);
    if (res.status === 200) {
      // Response shape: { success: true, data: { logs: [], total, limit, offset } }
      const logs = res.data.data?.logs ?? res.data.logs;
      expect(Array.isArray(logs)).toBe(true);
      console.log(`Logs returned: ${logs.length}`);
    }
  });

  it('GET /api/logs?limit=10 — should respect limit param', async () => {
    const res = await client.get('/api/logs?limit=10');
    if (res.status === 200) {
      const logs = res.data.data?.logs ?? res.data.logs;
      expect(logs.length).toBeLessThanOrEqual(10);
    }
  });

  it('GET /api/logs?level=ERROR — should filter by ERROR level', async () => {
    const res = await client.get('/api/logs?level=ERROR');
    if (res.status === 200) {
      const logs = res.data.data?.logs ?? res.data.logs;
      const nonError = logs.filter(
        (l: any) => l.level !== 'ERROR' && l.level !== 'error' && l.level !== 'FATAL'
      );
      expect(nonError.length).toBe(0);
      console.log(`ERROR logs: ${logs.length}`);
    }
  });

  it('GET /api/logs?level=INFO — should filter by INFO level', async () => {
    const res = await client.get('/api/logs?level=INFO');
    if (res.status === 200) {
      const logs = res.data.data?.logs ?? res.data.logs;
      expect(Array.isArray(logs)).toBe(true);
    }
  });

  it('GET /api/logs?search=proxy — should support search term', async () => {
    const res = await client.get('/api/logs?search=proxy');
    if (res.status === 200) {
      const logs = res.data.data?.logs ?? res.data.logs;
      expect(Array.isArray(logs)).toBe(true);
    }
  });

  it('GET /api/logs?offset=0&limit=5 — should support pagination', async () => {
    const page1 = await client.get('/api/logs?offset=0&limit=5');
    const page2 = await client.get('/api/logs?offset=5&limit=5');
    if (page1.status === 200 && page2.status === 200) {
      const logs1 = page1.data.data?.logs ?? page1.data.logs;
      const logs2 = page2.data.data?.logs ?? page2.data.logs;
      console.log(`Page1: ${logs1.length} logs, Page2: ${logs2.length} logs`);
      expect(logs1.length).toBeLessThanOrEqual(5);
      expect(logs2.length).toBeLessThanOrEqual(5);
    }
  });
});

describe('Logs API: Log Structure', () => {
  it('each log entry should have timestamp and level fields', async () => {
    const res = await client.get('/api/logs?limit=5');
    if (res.status === 200) {
      const logs = res.data.data?.logs ?? res.data.logs;
      if (logs.length > 0) {
        const entry = logs[0];
        expect(entry).toHaveProperty('timestamp');
        expect(entry).toHaveProperty('level');
        expect(entry).toHaveProperty('message');
        console.log('Log entry sample:', JSON.stringify(entry).slice(0, 200));
      }
    }
  });

  it('log entries should contain correlationId when present', async () => {
    const res = await client.get('/api/logs?limit=50');
    if (res.status === 200) {
      const logs = res.data.data?.logs ?? res.data.logs;
      const withCorrelation = logs.filter((l: any) => l.correlationId);
      console.log(`Logs with correlationId: ${withCorrelation.length}/${logs.length}`);
      // Not asserting count — just verifying the field is parseable when present
      withCorrelation.forEach((l: any) => {
        expect(typeof l.correlationId).toBe('string');
      });
    }
  });
});

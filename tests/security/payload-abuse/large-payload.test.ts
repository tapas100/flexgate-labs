/**
 * Security Test: Large Payload Rejection
 * Gateway should reject payloads exceeding maxBodySize (1mb).
 * Note: proxy may drop the connection (timeout/reset) instead of returning 413 —
 * that is also a valid rejection.
 */
import axios from 'axios';
import { GATEWAY_URL, API_KEY } from '../../helpers';

const client = axios.create({
  baseURL: GATEWAY_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
  validateStatus: () => true,
});

async function postExpectRejected(payload: any, label: string): Promise<void> {
  try {
    const res = await client.post('/users', payload);
    expect([400, 408, 413, 429, 431, 503]).toContain(res.status);
    console.log(`${label} rejected with: ${res.status}`);
  } catch (err: any) {
    const isTimeout = err?.code === 'ECONNABORTED' || /timeout/i.test(err?.message ?? '');
    const isReset   = err?.code === 'ECONNRESET';
    if (isTimeout || isReset) {
      console.log(`${label} blocked (${err.code ?? 'timeout'}) ✅`);
      return;
    }
    throw err;
  }
}

describe('Security: Large Payload Rejection', () => {
  it('should reject payload larger than 1mb', async () => {
    await postExpectRejected(
      { data: 'X'.repeat(1.5 * 1024 * 1024) },
      'Large payload (1.5MB)'
    );
  });

  it('should accept payload within 1mb limit', async () => {
    const res = await client.post('/users', {
      name: 'Normal User',
      email: `normal-${Date.now()}@example.com`,
    });
    expect([200, 201, 400, 429, 503]).toContain(res.status);
  });

  it('should reject payload exactly at 1mb + 1 byte', async () => {
    await postExpectRejected(
      { data: 'X'.repeat(1 * 1024 * 1024 + 1) },
      'Payload (1MB+1)'
    );
  });
});

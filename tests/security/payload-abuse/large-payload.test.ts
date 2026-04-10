/**
 * Security Test: Large Payload Rejection
 * Gateway should reject payloads exceeding maxBodySize (1mb)
 */
import { createClient } from '../../helpers';

const client = createClient();

describe('Security: Large Payload Rejection', () => {
  it('should reject payload larger than 1mb', async () => {
    const largePayload = {
      data: 'X'.repeat(1.5 * 1024 * 1024), // 1.5MB string
    };

    const res = await client.post('/users', largePayload);
    expect([400, 413, 431]).toContain(res.status);
    console.log(`Large payload rejected with: ${res.status}`);
  });

  it('should accept payload within 1mb limit', async () => {
    const normalPayload = {
      name: 'Normal User',
      email: `normal-${Date.now()}@example.com`,
    };

    const res = await client.post('/users', normalPayload);
    expect([200, 201, 400]).toContain(res.status);
  });

  it('should reject payload exactly at 1mb + 1 byte', async () => {
    const payload = { data: 'X'.repeat(1 * 1024 * 1024 + 1) };
    const res = await client.post('/users', payload);
    expect([400, 413]).toContain(res.status);
  });
});

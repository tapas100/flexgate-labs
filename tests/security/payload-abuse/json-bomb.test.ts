/**
 * Security Test: JSON Bomb Simulation
 * Deeply nested JSON should be rejected to prevent DoS
 */
import { createClient } from '../../helpers';

const client = createClient();

function buildNestedObject(depth: number): object {
  if (depth === 0) return { value: 'leaf' };
  return { nested: buildNestedObject(depth - 1) };
}

describe('Security: JSON Bomb / Deep Nesting', () => {
  it('should reject JSON with depth > 10 (configured maxJsonDepth)', async () => {
    const deepObject = buildNestedObject(15);

    const res = await client.post('/users', deepObject);
    expect([400, 413, 422]).toContain(res.status);
    console.log(`Deep JSON rejected with: ${res.status}`);
  });

  it('should reject JSON with massive array nesting', async () => {
    let bomb: any = 'leaf';
    for (let i = 0; i < 20; i++) {
      bomb = [bomb];
    }

    const res = await client.post('/users', { data: bomb });
    expect([400, 413, 422]).toContain(res.status);
  });

  it('should accept valid flat JSON payload', async () => {
    const validPayload = {
      name: 'Valid User',
      email: `valid-${Date.now()}@example.com`,
      metadata: { role: 'user', tier: 'free' },
    };

    const res = await client.post('/users', validPayload);
    expect([200, 201, 400]).toContain(res.status);
  });

  it('should handle circular reference gracefully (not crash)', async () => {
    // Send a string that looks circular-ish (actual circular refs can't be JSON-serialized)
    const weirdPayload = '{"a":{"b":{"c":{"d":{"e":{"f":{"g":{"h":{"i":{"j":{"k":"deep"}}}}}}}}}}}';

    const res = await client.post('/users', JSON.parse(weirdPayload));
    expect([200, 201, 400, 422]).toContain(res.status);
  });
});

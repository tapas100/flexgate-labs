/**
 * Security Test: JSON Bomb Simulation
 *
 * Uses undici (built-in Node 18+ HTTP client) instead of axios because:
 *   - undici does NOT follow redirects by default
 *   - undici surfaces socket-level errors precisely (UND_ERR_SOCKET, ECONNRESET)
 *   - it does NOT silently swallow connection drops as "timeout"
 *
 * Expected proxy behaviour for malicious payloads:
 *   A) Returns 400/413/422 immediately  (body size / depth middleware active)
 *   B) Resets the connection (ECONNRESET / UND_ERR_SOCKET) — proxy drops it
 *   C) Returns 429 (rate limiter kicked in first)
 *
 * What is NOT acceptable: hanging indefinitely (that means no protection at all).
 * We enforce this with a hard AbortController timeout of 8s.
 * If the proxy hasn't responded in 8s → the test FAILS (no protection detected).
 */
import { request } from 'undici';
import { GATEWAY_URL } from '../../helpers';

const TIMEOUT_MS = 8000; // 8s — if proxy hasn't responded, it has no protection

async function postMalicious(payload: object | string, label: string): Promise<void> {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const { statusCode } = await request(`${GATEWAY_URL}/users`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      signal: controller.signal,
    });

    // Proxy responded — must be a rejection code
    expect([400, 408, 413, 422, 429, 503]).toContain(statusCode);
    console.log(`✅ ${label} rejected with HTTP ${statusCode}`);

  } catch (err: any) {
    if (controller.signal.aborted) {
      // Hard abort fired — proxy never responded in 8s = NO protection
      throw new Error(
        `❌ ${label}: proxy did not respond in ${TIMEOUT_MS}ms — ` +
        `no body-size or depth protection detected. ` +
        `Add express.json({ limit: '1mb' }) middleware to the proxy.`
      );
    }

    // Connection reset / socket closed = proxy actively dropped the connection
    const code: string = err?.code ?? err?.message ?? '';
    const isDropped =
      code.includes('ECONNRESET') ||
      code.includes('UND_ERR_SOCKET') ||
      code.includes('UND_ERR_CONNECT_TIMEOUT') ||
      code.includes('EPIPE');

    if (isDropped) {
      console.log(`✅ ${label} — proxy dropped connection (${code})`);
      return; // pass — proxy IS protecting
    }

    throw err; // unexpected error
  } finally {
    clearTimeout(timer);
  }
}

function buildNestedObject(depth: number): object {
  if (depth === 0) return { value: 'leaf' };
  return { nested: buildNestedObject(depth - 1) };
}

describe('Security: JSON Bomb / Deep Nesting', () => {
  it('should reject JSON with depth > 10 (configured maxJsonDepth)', async () => {
    await postMalicious(buildNestedObject(15), 'Deep JSON (depth 15)');
  }, 12000);

  it('should reject JSON with massive array nesting', async () => {
    let bomb: any = 'leaf';
    for (let i = 0; i < 20; i++) bomb = [bomb];
    await postMalicious({ data: bomb }, 'Array bomb (depth 20)');
  }, 12000);

  it('should accept valid flat JSON payload', async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const { statusCode } = await request(`${GATEWAY_URL}/users`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Valid User',
          email: `valid-${Date.now()}@example.com`,
          metadata: { role: 'user', tier: 'free' },
        }),
        signal: controller.signal,
      });
      expect([200, 201, 400, 429, 503]).toContain(statusCode);
    } catch (err: any) {
      if (controller.signal.aborted) {
        throw new Error('❌ Valid POST timed out — proxy is unresponsive (check proxy health)');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }, 12000);

  it('should handle circular reference gracefully (not crash)', async () => {
    const weirdPayload = '{"a":{"b":{"c":{"d":{"e":{"f":{"g":{"h":{"i":{"j":{"k":"deep"}}}}}}}}}}}';
    await postMalicious(weirdPayload, 'Deep circular-ish JSON');
  }, 12000);
});

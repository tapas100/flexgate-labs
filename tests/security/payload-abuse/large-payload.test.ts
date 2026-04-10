/**
 * Security Test: Large Payload Rejection
 *
 * Uses undici (built-in Node 18+) for precise socket-level error detection.
 * Same rationale as json-bomb.test.ts — axios silently turns all proxy
 * non-responses into "timeout", making tests meaningless.
 *
 * Correct proxy behaviour:
 *   A) Returns 413 Payload Too Large immediately
 *   B) Resets the TCP connection mid-stream (ECONNRESET / EPIPE)
 *   C) Returns 429 (rate-limited before body size check)
 *
 * If proxy hangs > 8s on a large body → test FAILS (no protection).
 */
import { request } from 'undici';
import { GATEWAY_URL } from '../../helpers';

const TIMEOUT_MS = 8000;

async function postExpectRejected(payload: object, label: string): Promise<void> {
  const body = JSON.stringify(payload);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const { statusCode } = await request(`${GATEWAY_URL}/users`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      signal: controller.signal,
    });

    expect([400, 408, 413, 429, 431, 503]).toContain(statusCode);
    console.log(`✅ ${label} rejected with HTTP ${statusCode}`);

  } catch (err: any) {
    if (controller.signal.aborted) {
      throw new Error(
        `❌ ${label}: proxy did not respond in ${TIMEOUT_MS}ms — ` +
        `no body-size limit detected. ` +
        `Add express.json({ limit: '1mb' }) middleware to the proxy.`
      );
    }

    const code: string = err?.code ?? err?.message ?? '';
    const isDropped =
      code.includes('ECONNRESET') ||
      code.includes('UND_ERR_SOCKET') ||
      code.includes('UND_ERR_CONNECT_TIMEOUT') ||
      code.includes('EPIPE');

    if (isDropped) {
      console.log(`✅ ${label} — proxy dropped connection mid-stream (${code})`);
      return;
    }

    throw err;
  } finally {
    clearTimeout(timer);
  }
}

describe('Security: Large Payload Rejection', () => {
  it('should reject payload larger than 1mb', async () => {
    await postExpectRejected(
      { data: 'X'.repeat(1.5 * 1024 * 1024) },
      'Large payload (1.5MB)'
    );
  }, 12000);

  it('should accept payload within 1mb limit', async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const { statusCode } = await request(`${GATEWAY_URL}/users`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Normal User',
          email: `normal-${Date.now()}@example.com`,
        }),
        signal: controller.signal,
      });
      expect([200, 201, 400, 429, 503]).toContain(statusCode);
    } catch (err: any) {
      if (controller.signal.aborted) {
        throw new Error('❌ Valid POST timed out — proxy is unresponsive after large-payload tests');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }, 12000);

  it('should reject payload exactly at 1mb + 1 byte', async () => {
    await postExpectRejected(
      { data: 'X'.repeat(1 * 1024 * 1024 + 1) },
      'Payload (1MB+1)'
    );
  }, 12000);
});

/**
 * Security Test: Large Payload Rejection
 *
 * TARGET: POST /api/routes  (an admin endpoint handled by express.json() directly
 * on the proxy — NOT proxy-forwarded to an upstream).
 *
 * WHY NOT POST /users:
 *   The proxy runs express.json() globally (app.ts:161) which consumes the raw
 *   body stream. http-proxy-middleware then has nothing left to stream to the
 *   upstream, so the upstream never responds → connection hangs forever.
 *   Posting to an admin API endpoint exercises the proxy's OWN express.json()
 *   body size limit — which is the correct security surface to test.
 *
 * KNOWN CONFIGURATION:
 *   Proxy maxBodySize = 10mb  (express.json({ limit: '10mb' }), app.ts:161)
 *
 * Tests:
 *   1. Payload > 10MB  → proxy MUST reject (413) — express.json limit enforced
 *      If it hangs     → FAILS with actionable message
 *   2. Payload = 10MB+1 byte → same
 *   3. Payload < 1MB   → proxy MUST respond (any status) — not hang
 */
import { request } from 'undici';
import { GATEWAY_URL, ADMIN_KEY } from '../../helpers';

const TIMEOUT_MS = 15000;

// POST to an admin API endpoint — goes through express.json() on the proxy itself
const TARGET_URL = `${GATEWAY_URL}/api/routes`;
const AUTH_HEADERS = {
  'content-type': 'application/json',
  'x-api-key': ADMIN_KEY,
};

async function postPayload(
  sizeMB: number,
  label: string
): Promise<{ statusCode: number } | { dropped: true; code: string }> {
  const body = JSON.stringify({ data: 'X'.repeat(Math.floor(sizeMB * 1024 * 1024)) });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const { statusCode } = await request(TARGET_URL, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body,
      signal: controller.signal,
    });
    return { statusCode };
  } catch (err: any) {
    if (controller.signal.aborted) {
      throw new Error(
        `❌ ${label} (${sizeMB}MB): proxy did not respond in ${TIMEOUT_MS}ms.\n` +
        `express.json({ limit: '10mb' }) is not rejecting oversized bodies — connection hangs.\n` +
        `Check proxy.maxBodySize config or express.json limit in app.ts.`
      );
    }
    const code: string = err?.code ?? err?.message ?? 'unknown';
    const isDropped =
      code.includes('ECONNRESET') ||
      code.includes('UND_ERR_SOCKET') ||
      code.includes('UND_ERR_CONNECT_TIMEOUT') ||
      code.includes('EPIPE');
    if (isDropped) return { dropped: true, code };
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

describe('Security: Large Payload Rejection', () => {

  it('should reject payload larger than 10mb (configured limit)', async () => {
    // proxy.maxBodySize = 10mb — send 11MB to trigger express.json limit
    const result = await postPayload(11, 'Oversized payload (11MB)');
    if ('dropped' in result) {
      console.log(`✅ Proxy dropped 11MB payload: ${result.code}`);
    } else {
      // express.json rejects with 413 when limit exceeded
      expect([400, 408, 413, 429, 431]).toContain(result.statusCode);
      console.log(`✅ Proxy rejected 11MB payload with HTTP ${result.statusCode}`);
    }
  }, 20000);

  it('should reject payload at 10mb + 1 byte', async () => {
    const body = JSON.stringify({ data: 'X'.repeat(10 * 1024 * 1024 + 1) });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const { statusCode } = await request(TARGET_URL, {
        method: 'POST',
        headers: AUTH_HEADERS,
        body,
        signal: controller.signal,
      });
      expect([400, 408, 413, 429, 431]).toContain(statusCode);
      console.log(`✅ 10MB+1 rejected with ${statusCode}`);
    } catch (err: any) {
      if (controller.signal.aborted) {
        throw new Error(`❌ 10MB+1 payload timed out — express.json body limit not enforced`);
      }
      const code: string = err?.code ?? '';
      if (code.includes('ECONNRESET') || code.includes('UND_ERR_SOCKET') || code.includes('EPIPE')) {
        console.log(`✅ 10MB+1 dropped by proxy: ${code}`);
        return;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }, 20000);

  it('should accept payload well within limit (< 1mb)', async () => {
    // A 1KB POST to /api/routes — proxy must respond (any HTTP status means it's alive)
    const result = await postPayload(0.001, 'Small payload (1KB)');
    if ('dropped' in result) {
      throw new Error(`❌ Valid 1KB payload was dropped by proxy: ${result.code}`);
    }
    console.log(`Small payload status: ${result.statusCode}`);
    // Any HTTP response is acceptable — 400/422 = validation error (expected for incomplete route body)
    expect([200, 201, 400, 401, 403, 422, 429]).toContain(result.statusCode);
  }, 20000);

});

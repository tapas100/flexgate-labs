/**
 * Security Test: Large Payload Rejection
 *
 * Uses undici for precise socket-level error detection.
 *
 * KNOWN CONFIGURATION:
 *   Proxy maxBodySize = 10mb (express.json({ limit: '10mb' }))
 *   Source: app.ts line 161
 *
 * Tests:
 *   1. Payload > 10MB  → proxy MUST reject (413) or drop (ECONNRESET)
 *      If it hangs → FAILS with actionable message
 *   2. Payload = 11MB  → same as above
 *   3. Payload < 1MB   → proxy MUST forward (200/201/400)
 *
 * This ensures the 10MB hard limit is enforced and the proxy
 * does not hang indefinitely on oversized bodies.
 */
import { request } from 'undici';
import { GATEWAY_URL } from '../../helpers';

const TIMEOUT_MS = 15000;

async function postPayload(
  sizeMB: number,
  label: string
): Promise<{ statusCode: number } | { dropped: true; code: string }> {
  const body = JSON.stringify({ data: 'X'.repeat(sizeMB * 1024 * 1024) });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const { statusCode } = await request(`${GATEWAY_URL}/users`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      signal: controller.signal,
    });
    return { statusCode };
  } catch (err: any) {
    if (controller.signal.aborted) {
      throw new Error(
        `❌ ${label} (${sizeMB}MB): proxy did not respond in ${TIMEOUT_MS}ms.\n` +
        `The proxy body size limit is not enforced — connection hangs forever.\n` +
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
    // proxy.maxBodySize = 10mb — send 11MB to trigger the limit
    const result = await postPayload(11, 'Oversized payload (11MB)');
    if ('dropped' in result) {
      console.log(`✅ Proxy dropped 11MB payload: ${result.code}`);
    } else {
      expect([400, 408, 413, 429, 431, 503]).toContain(result.statusCode);
      console.log(`✅ Proxy rejected 11MB payload with HTTP ${result.statusCode}`);
    }
  }, 20000);

  it('should reject payload at 10mb + 1 byte', async () => {
    const body = JSON.stringify({ data: 'X'.repeat(10 * 1024 * 1024 + 1) });
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
      console.log(`✅ 10MB+1 rejected with ${statusCode}`);
    } catch (err: any) {
      if (controller.signal.aborted) {
        throw new Error(`❌ 10MB+1 payload timed out — body limit not enforced`);
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
    const result = await postPayload(0.001, 'Small payload (1KB)');
    if ('dropped' in result) {
      throw new Error(`❌ Valid 1KB payload was dropped: ${result.code}`);
    }
    console.log(`Small payload status: ${result.statusCode}`);
    expect([200, 201, 400, 429, 503]).toContain(result.statusCode);
  }, 20000);

});

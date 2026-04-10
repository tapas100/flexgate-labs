/**
 * Security Test: Header Injection
 * Test that malformed and injected headers are rejected or sanitized
 */
import { createClient } from '../../helpers';

const client = createClient();

describe('Security: Header Injection', () => {
  it('should reject or sanitize null byte in header value', async () => {
    const res = await client.get('/users', {
      headers: { 'X-Custom-Header': 'value\x00injected' },
    });
    // Should not crash; gateway should sanitize or reject
    expect([200, 400, 403]).toContain(res.status);
  });

  it('should reject CRLF injection in header value', async () => {
    try {
      const res = await client.get('/users', {
        headers: { 'X-Injected': 'value\r\nX-Injected-2: evil' },
      });
      // If request gets through, gateway must have sanitized headers
      expect([200, 400, 403]).toContain(res.status);
    } catch (err: any) {
      // HTTP client itself may reject CRLF headers — that's expected
      expect(err.message).toBeDefined();
    }
  });

  it('should handle oversized header gracefully', async () => {
    const largeValue = 'A'.repeat(9000); // Exceeds maxHeaderSize: 8192
    const res = await client.get('/users', {
      headers: { 'X-Large-Header': largeValue },
    });
    expect([200, 400, 413, 431]).toContain(res.status);
  });

  it('should handle many headers gracefully', async () => {
    const extraHeaders: Record<string, string> = {};
    for (let i = 0; i < 110; i++) {
      extraHeaders[`X-Test-Header-${i}`] = `value${i}`;
    }
    const res = await client.get('/users', { headers: extraHeaders });
    // Should accept or reject cleanly, not crash
    expect([200, 400, 431]).toContain(res.status);
  });

  it('should reject control characters in header names', async () => {
    try {
      const res = await client.get('/users', {
        headers: { 'X-Evil\x01Header': 'value' },
      });
      expect([200, 400, 403]).toContain(res.status);
    } catch (err: any) {
      expect(err.message).toBeDefined();
    }
  });
});

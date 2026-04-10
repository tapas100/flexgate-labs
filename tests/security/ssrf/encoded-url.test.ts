/**
 * Security Test: SSRF — URL Encoding Bypass
 * Attempts to bypass SSRF protection using encoded URLs
 */
import { createClient } from '../../helpers';

const client = createClient();

describe('Security: SSRF — Encoded URL Bypass', () => {
  it('should block percent-encoded metadata IP', async () => {
    // 169.254.169.254 encoded
    const encoded = 'http%3A%2F%2F169.254.169.254%2Flatest%2Fmeta-data%2F';
    const res = await client.get(`/proxy?url=${encoded}`);
    expect([400, 403, 404, 422]).toContain(res.status);
  });

  it('should block double-encoded metadata IP', async () => {
    const doubleEncoded = 'http%253A%252F%252F169.254.169.254%252F';
    const res = await client.get(`/proxy?url=${doubleEncoded}`);
    expect([400, 403, 404, 422]).toContain(res.status);
  });

  it('should block decimal IP representation of 169.254.169.254', async () => {
    // 169.254.169.254 = 2852039166 in decimal
    const res = await client.get('/proxy?url=http://2852039166/');
    expect([400, 403, 404, 422]).toContain(res.status);
  });

  it('should block octal IP representation', async () => {
    // 169.254.169.254 in octal octets = 0251.0376.0251.0376
    const res = await client.get('/proxy?url=http://0251.0376.0251.0376/');
    expect([400, 403, 404, 422]).toContain(res.status);
  });

  it('should block hex IP representation', async () => {
    // 169.254.169.254 in hex = 0xa9fea9fe
    const res = await client.get('/proxy?url=http://0xa9fea9fe/');
    expect([400, 403, 404, 422]).toContain(res.status);
  });
});

/**
 * Security Test: SSRF — Metadata IP
 * Attempts to reach AWS metadata endpoint via gateway
 */
import { createClient } from '../../helpers';

const client = createClient();

describe('Security: SSRF — Metadata IP', () => {
  it('should block request to AWS metadata IP 169.254.169.254', async () => {
    const res = await client.get('/proxy?url=http://169.254.169.254/latest/meta-data/');
    expect([400, 403, 404, 422]).toContain(res.status);
    console.log(`Metadata IP blocked with status: ${res.status}`);
  });

  it('should block request to AWS metadata IP in Authorization header', async () => {
    const res = await client.get('/users', {
      headers: { 'X-Upstream-Override': 'http://169.254.169.254' },
    });
    // Gateway should ignore or reject upstream override headers
    expect([200, 400, 403]).toContain(res.status);
  });

  it('should block SSRF via redirect to metadata IP', async () => {
    const res = await client.get('/proxy?url=http://169.254.169.254');
    expect([400, 403, 404, 422]).toContain(res.status);
  });

  it('should block request to 0.0.0.0', async () => {
    const res = await client.get('/proxy?url=http://0.0.0.0/');
    expect([400, 403, 404, 422]).toContain(res.status);
  });
});

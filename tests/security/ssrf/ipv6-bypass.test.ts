/**
 * Security Test: SSRF — IPv6 Bypass Attempts
 */
import { createClient } from '../../helpers';

const client = createClient();

describe('Security: SSRF — IPv6 Bypass', () => {
  it('should block IPv6 loopback ::1', async () => {
    const res = await client.get('/proxy?url=http://[::1]/admin');
    expect([400, 403, 404, 422]).toContain(res.status);
  });

  it('should block IPv6 link-local fe80::', async () => {
    const res = await client.get('/proxy?url=http://[fe80::1]/');
    expect([400, 403, 404, 422]).toContain(res.status);
  });

  it('should block IPv6 unique-local fc00::', async () => {
    const res = await client.get('/proxy?url=http://[fc00::1]/');
    expect([400, 403, 404, 422]).toContain(res.status);
  });

  it('should block IPv6 AWS metadata fd00:ec2::254', async () => {
    const res = await client.get('/proxy?url=http://[fd00:ec2::254]/latest/meta-data/');
    expect([400, 403, 404, 422]).toContain(res.status);
  });

  it('should block IPv4-mapped IPv6 ::ffff:169.254.169.254', async () => {
    const res = await client.get('/proxy?url=http://[::ffff:169.254.169.254]/');
    expect([400, 403, 404, 422]).toContain(res.status);
  });
});

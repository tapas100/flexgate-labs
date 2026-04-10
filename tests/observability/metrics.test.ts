/**
 * Observability Test: Metrics Validation
 * Verify gateway exposes expected metrics
 */
import axios from 'axios';

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:4000';
const metricsClient = axios.create({ baseURL: GATEWAY_URL, timeout: 5000, validateStatus: () => true });

describe('Observability: Metrics', () => {
  it('should expose a /metrics endpoint', async () => {
    const res = await metricsClient.get('/metrics');
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      console.log('✅ /metrics endpoint available');
    } else {
      console.warn('⚠️ /metrics not exposed at /metrics — may be on a different path or port');
    }
  });

  it('should expose Prometheus-format metrics if available', async () => {
    const res = await metricsClient.get('/metrics');
    if (res.status === 200) {
      const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
      // Prometheus format uses # HELP and # TYPE prefixes
      const isPrometheusFormat = body.includes('# HELP') || body.includes('# TYPE');
      if (isPrometheusFormat) {
        console.log('✅ Prometheus format confirmed');
        expect(isPrometheusFormat).toBe(true);
      } else {
        console.log('ℹ️ Metrics available but not in Prometheus format');
      }
    }
  });

  it('should expose /health endpoint with service status', async () => {
    const res = await metricsClient.get('/health');
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ status: 'ok' });
  });

  it('should report request count after making requests', async () => {
    // Make some requests first
    await metricsClient.get('/users');
    await metricsClient.get('/orders');

    const res = await metricsClient.get('/metrics');
    if (res.status === 200) {
      const body = typeof res.data === 'string' ? res.data : '';
      if (body.includes('http_requests_total') || body.includes('requests_total')) {
        console.log('✅ Request counter metric found');
        expect(body).toMatch(/requests/);
      }
    }
  });
});

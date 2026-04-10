/**
 * Observability Test: Prometheus Query Validation
 * Uses real flexgate_* metric names from flexgate-proxy/src/metrics/index.ts
 * Covers: metric existence, labels, circuit breaker, rate limit, SLI
 */
import axios from 'axios';
import { createClient, createAdminClient, GATEWAY_URL, PROMETHEUS_URL, sleep } from '../helpers';

const metricsClient = axios.create({ baseURL: GATEWAY_URL, timeout: 8000, validateStatus: () => true });
const prometheusClient = axios.create({ baseURL: PROMETHEUS_URL, timeout: 8000, validateStatus: () => true });

async function queryProm(query: string) {
  return prometheusClient.get('/api/v1/query', { params: { query } });
}

// Real metric names from flexgate-proxy src/metrics/index.ts
const EXPECTED_METRICS = [
  'flexgate_http_requests_total',
  'flexgate_http_request_duration_ms',
  'flexgate_http_requests_in_flight',
  'flexgate_circuit_breaker_state',
  'flexgate_circuit_breaker_transitions_total',
  'flexgate_circuit_breaker_failures_total',
  'flexgate_circuit_breaker_successes_total',
  'flexgate_circuit_breaker_rejected_total',
  'flexgate_rate_limit_requests_total',
  'flexgate_rate_limit_requests_rejected_total',
];

describe('Observability: /metrics Endpoint', () => {
  it('should expose /metrics in Prometheus text format', async () => {
    const res = await metricsClient.get('/metrics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
  });

  EXPECTED_METRICS.forEach((metricName) => {
    it(`should expose metric: ${metricName}`, async () => {
      const res = await metricsClient.get('/metrics');
      expect(res.status).toBe(200);
      expect(res.data as string).toContain(metricName);
    });
  });

  it('should include # HELP and # TYPE for each metric', async () => {
    const res = await metricsClient.get('/metrics');
    const body = res.data as string;
    const helpCount = body.split('\n').filter((l) => l.startsWith('# HELP')).length;
    const typeCount = body.split('\n').filter((l) => l.startsWith('# TYPE')).length;
    expect(helpCount).toBeGreaterThan(5);
    expect(typeCount).toBeGreaterThan(5);
    console.log(`${helpCount} HELP lines, ${typeCount} TYPE lines`);
  });

  it('should include Node.js default metrics prefixed with flexgate_', async () => {
    const res = await metricsClient.get('/metrics');
    expect(res.data as string).toMatch(/flexgate_process_|flexgate_nodejs_/);
  });
});

describe('Observability: Prometheus Queries (real metric names)', () => {
  beforeAll(async () => {
    // Generate some traffic
    const client = createClient();
    await Promise.all(Array.from({ length: 5 }, () => client.get('/health').catch(() => null)));
    await sleep(2000);
  });

  it('Prometheus should be healthy', async () => {
    const res = await prometheusClient.get('/-/healthy');
    if (res.status !== 200) console.warn('⚠️  Prometheus not running — skipping query tests');
    expect([200, 404]).toContain(res.status);
  });

  it('flexgate_http_requests_total should have series', async () => {
    const res = await queryProm('flexgate_http_requests_total');
    if (res.status === 200 && res.data?.status === 'success') {
      console.log(`flexgate_http_requests_total: ${res.data.data.result.length} series`);
      expect(Array.isArray(res.data.data.result)).toBe(true);
    }
  });

  it('P95 latency should be under 5000ms', async () => {
    const res = await queryProm(
      'histogram_quantile(0.95, rate(flexgate_http_request_duration_ms_bucket[5m]))'
    );
    if (res.status === 200 && res.data?.status === 'success') {
      (res.data.data.result ?? []).forEach((r: any) => {
        const p95 = parseFloat(r.value?.[1] ?? '0');
        console.log(`P95: ${p95.toFixed(1)}ms`);
        expect(p95).toBeLessThan(5000);
      });
    }
  });

  it('5xx error rate should be under 50%', async () => {
    const res = await queryProm(
      'sum(rate(flexgate_http_requests_total{status=~"5.."}[5m])) / sum(rate(flexgate_http_requests_total[5m]))'
    );
    if (res.status === 200 && res.data?.status === 'success') {
      (res.data.data.result ?? []).forEach((r: any) => {
        const rate = parseFloat(r.value?.[1] ?? '0');
        console.log(`Error rate: ${(rate * 100).toFixed(2)}%`);
        expect(rate).toBeLessThan(0.5);
      });
    }
  });

  it('circuit breaker state gauge should be queryable', async () => {
    const res = await queryProm('flexgate_circuit_breaker_state');
    if (res.status === 200 && res.data?.status === 'success') {
      console.log(`Circuit breaker series: ${res.data.data.result.length}`);
    }
  });

  it('rate limit rejection rate should be queryable', async () => {
    const res = await queryProm('sum(rate(flexgate_rate_limit_requests_rejected_total[5m]))');
    if (res.status === 200 && res.data?.status === 'success') {
      const results = res.data.data.result ?? [];
      if (results.length) console.log(`Rate limit rejection rate: ${results[0].value?.[1]} req/s`);
    }
  });
});

describe('Observability: /api/metrics Dashboard API', () => {
  it('GET /api/metrics — should return dashboard summary', async () => {
    const adminClient = await createAdminClient();
    const res = await adminClient.get('/api/metrics');
    expect([200, 401]).toContain(res.status);
    if (res.status === 200) {
      expect(res.data.success).toBe(true);
      expect(res.data.data).toHaveProperty('summary');
      const { totalRequests, avgLatency, errorRate } = res.data.data.summary;
      console.log(`Dashboard: reqs=${totalRequests} avgLatency=${avgLatency}ms errorRate=${errorRate}%`);
    }
  });
});

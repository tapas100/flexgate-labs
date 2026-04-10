/**
 * k6 Load Test: Soak — Long Running (6-12 hours simulation)
 * Detects memory leaks, connection pool exhaustion, gradual degradation
 *
 * Usage:
 *   k6 run --duration 6h load/soak.js
 *   k6 run --duration 12h --env SOAK_VUS=20 load/soak.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';

const errorRate = new Rate('soak_errors');
const soakLatency = new Trend('soak_latency', true);
const requestsPerMinute = new Counter('soak_requests');
const degradationGauge = new Gauge('soak_degradation_score');

const GATEWAY_URL = __ENV.GATEWAY_URL || 'http://localhost:4000';
const API_KEY = __ENV.API_KEY || 'test-api-key-12345';
const SOAK_VUS = parseInt(__ENV.SOAK_VUS || '10');
const SOAK_DURATION = __ENV.SOAK_DURATION || '6h';

export const options = {
  vus: SOAK_VUS,
  duration: SOAK_DURATION,
  thresholds: {
    http_req_duration: ['p(95)<3000'],   // P95 must stay under 3s throughout
    http_req_failed: ['rate<0.05'],      // < 5% errors throughout
    soak_errors: ['rate<0.05'],
    soak_latency: ['p(99)<5000'],        // P99 < 5s
  },
  summaryTrendStats: ['min', 'med', 'avg', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

const headers = {
  'Content-Type': 'application/json',
  'X-API-Key': API_KEY,
};

// Memory monitoring: track latency drift over time
let requestCount = 0;
const SAMPLE_INTERVAL = 100;

export default function () {
  requestCount++;
  requestsPerMinute.add(1);

  const iteration = __ITER;
  const timeElapsed = Date.now();

  // Rotate through all routes to exercise all code paths
  const routeIndex = iteration % 4;
  let res;

  switch (routeIndex) {
    case 0:
      res = http.get(`${GATEWAY_URL}/users`, { headers });
      break;
    case 1:
      res = http.get(`${GATEWAY_URL}/orders`, { headers });
      break;
    case 2:
      res = http.get(`${GATEWAY_URL}/flaky`, { headers });
      break;
    case 3:
      res = http.post(
        `${GATEWAY_URL}/users`,
        JSON.stringify({
          name: `Soak User ${iteration}`,
          email: `soak-${iteration}@test.com`,
        }),
        { headers }
      );
      break;
    default:
      res = http.get(`${GATEWAY_URL}/users`, { headers });
  }

  soakLatency.add(res.timings.duration);

  const ok = check(res, {
    'status not 500': (r) => r.status !== 500,
    'status not 502': (r) => r.status !== 502,
    'response time < 5s': (r) => r.timings.duration < 5000,
    'body defined': (r) => r.body !== null,
  });

  errorRate.add(!ok);

  // Log degradation hints every SAMPLE_INTERVAL requests
  if (iteration % SAMPLE_INTERVAL === 0) {
    const score = res.timings.duration > 2000 ? 1 : 0;
    degradationGauge.add(score);
    console.log(
      `[Soak] iter=${iteration} route=${routeIndex} status=${res.status} ` +
      `duration=${res.timings.duration}ms`
    );
  }

  // Soak test uses gentle pacing
  sleep(1 + Math.random());
}

export function handleSummary(data) {
  const p95 = data.metrics?.http_req_duration?.values?.['p(95)'];
  const errorRateVal = data.metrics?.http_req_failed?.values?.rate;
  const totalRequests = data.metrics?.http_reqs?.values?.count;

  return {
    'reports/soak-summary.json': JSON.stringify({
      testType: 'soak',
      duration: SOAK_DURATION,
      vus: SOAK_VUS,
      totalRequests,
      p95LatencyMs: p95,
      errorRate: errorRateVal,
      passed: p95 < 3000 && errorRateVal < 0.05,
      timestamp: new Date().toISOString(),
    }, null, 2),
    stdout: `
╔══════════════════════════════════════╗
║         SOAK TEST SUMMARY            ║
╠══════════════════════════════════════╣
║ Duration:      ${SOAK_DURATION.padEnd(21)}║
║ VUs:           ${String(SOAK_VUS).padEnd(21)}║
║ Total Requests: ${String(totalRequests).padEnd(20)}║
║ P95 Latency:   ${String(p95?.toFixed(0) + 'ms').padEnd(21)}║
║ Error Rate:    ${String((errorRateVal * 100).toFixed(2) + '%').padEnd(21)}║
╚══════════════════════════════════════╝\n`,
  };
}

/**
 * k6 Load Test: Stress — Maximum Capacity
 * Push the gateway beyond normal limits to find breaking point
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

const errorRate = new Rate('errors');
const stressLatency = new Trend('stress_latency', true);
const requestsTotal = new Counter('requests_total_custom');

const GATEWAY_URL = __ENV.GATEWAY_URL || 'http://localhost:4000';
const API_KEY = __ENV.API_KEY || 'test-api-key-12345';

export const options = {
  stages: [
    { duration: '2m', target: 50 },    // ramp up
    { duration: '5m', target: 100 },   // medium stress
    { duration: '5m', target: 200 },   // high stress
    { duration: '2m', target: 300 },   // max stress
    { duration: '2m', target: 0 },     // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<8000'],   // P95 < 8s under stress
    http_req_failed: ['rate<0.2'],       // < 20% errors under stress
    errors: ['rate<0.2'],
  },
};

const headers = {
  'Content-Type': 'application/json',
  'X-API-Key': API_KEY,
};

export default function () {
  requestsTotal.add(1);

  // Mix of routes to stress all upstreams
  const route = Math.random();
  let res;

  if (route < 0.4) {
    res = http.get(`${GATEWAY_URL}/users`, { headers });
  } else if (route < 0.7) {
    res = http.get(`${GATEWAY_URL}/orders`, { headers });
  } else if (route < 0.85) {
    res = http.get(`${GATEWAY_URL}/flaky`, { headers });
  } else {
    res = http.post(
      `${GATEWAY_URL}/users`,
      JSON.stringify({ name: 'Stress User', email: `stress-${Date.now()}@test.com` }),
      { headers }
    );
  }

  stressLatency.add(res.timings.duration);

  const ok = check(res, {
    'not server error (5xx without 503)': (r) => r.status !== 500 && r.status !== 502,
    'response received': (r) => r.status > 0,
  });
  errorRate.add(!ok);

  sleep(0.05);
}

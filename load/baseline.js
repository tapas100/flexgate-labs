/**
 * k6 Load Test: Baseline — Steady Traffic
 * Simulates normal production traffic to establish baseline metrics
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const usersLatency = new Trend('users_latency', true);
const ordersLatency = new Trend('orders_latency', true);

const GATEWAY_URL = __ENV.GATEWAY_URL || 'http://localhost:4000';
const API_KEY = __ENV.API_KEY || 'test-api-key-12345';

export const options = {
  stages: [
    { duration: '1m', target: 10 },   // ramp up to 10 VUs
    { duration: '3m', target: 10 },   // hold steady
    { duration: '1m', target: 0 },    // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],  // P95 < 2s
    http_req_failed: ['rate<0.05'],     // < 5% error rate
    errors: ['rate<0.05'],
    users_latency: ['p(95)<2000'],
    orders_latency: ['p(95)<2000'],
  },
};

const headers = {
  'Content-Type': 'application/json',
  'X-API-Key': API_KEY,
  'X-Correlation-ID': `k6-baseline-${Date.now()}`,
};

export default function () {
  // GET /users
  const usersRes = http.get(`${GATEWAY_URL}/users`, { headers });
  usersLatency.add(usersRes.timings.duration);
  const usersOk = check(usersRes, {
    'GET /users status 200': (r) => r.status === 200,
    'GET /users response time < 2s': (r) => r.timings.duration < 2000,
  });
  errorRate.add(!usersOk);

  sleep(0.5);

  // GET /orders
  const ordersRes = http.get(`${GATEWAY_URL}/orders`, { headers });
  ordersLatency.add(ordersRes.timings.duration);
  const ordersOk = check(ordersRes, {
    'GET /orders status 200': (r) => r.status === 200,
    'GET /orders response time < 2s': (r) => r.timings.duration < 2000,
  });
  errorRate.add(!ordersOk);

  sleep(0.5);

  // POST /users (10% of the time)
  if (Math.random() < 0.1) {
    const createRes = http.post(
      `${GATEWAY_URL}/users`,
      JSON.stringify({ name: 'k6 User', email: `k6-${Date.now()}@test.com` }),
      { headers }
    );
    check(createRes, {
      'POST /users status 201': (r) => r.status === 201,
    });
  }

  sleep(1);
}

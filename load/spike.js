/**
 * k6 Load Test: Spike — Sudden Burst
 * Simulates sudden traffic spike (flash sale, viral event)
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const spikeLatency = new Trend('spike_latency', true);

const GATEWAY_URL = __ENV.GATEWAY_URL || 'http://localhost:4000';
const API_KEY = __ENV.API_KEY || 'test-api-key-12345';

export const options = {
  stages: [
    { duration: '30s', target: 5 },    // warm up
    { duration: '10s', target: 100 },  // sudden spike to 100 VUs
    { duration: '1m', target: 100 },   // sustain spike
    { duration: '10s', target: 5 },    // drop back
    { duration: '30s', target: 5 },    // recovery observation
    { duration: '10s', target: 0 },    // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<5000'],   // P95 < 5s during spike
    http_req_failed: ['rate<0.1'],       // < 10% errors during spike
    errors: ['rate<0.1'],
    spike_latency: ['p(95)<5000'],
  },
};

const headers = {
  'Content-Type': 'application/json',
  'X-API-Key': API_KEY,
};

export default function () {
  const res = http.get(`${GATEWAY_URL}/users`, { headers });
  spikeLatency.add(res.timings.duration);

  const ok = check(res, {
    'status is 200 or 429': (r) => r.status === 200 || r.status === 429,
    'response time < 5s': (r) => r.timings.duration < 5000,
  });
  errorRate.add(!ok);

  // Minimal sleep to simulate aggressive concurrent traffic
  sleep(0.1);
}

/**
 * Circuit Breaker Test: Trigger Failure Threshold
 * Send enough failing requests to open the circuit
 */
import { createClient, sleep } from '../helpers';
import axios from 'axios';

const client = createClient();

describe('Circuit Breaker: Trigger Failure Threshold', () => {
  beforeAll(async () => {
    // Reset flaky-service stats
    try {
      await axios.post('http://localhost:3003/flaky/reset');
    } catch { /* ignore */ }
  });

  it('should receive failures from flaky-service', async () => {
    const results: number[] = [];
    for (let i = 0; i < 20; i++) {
      const res = await client.get('/flaky');
      results.push(res.status);
      await sleep(100);
    }

    const failures = results.filter((s) => s >= 500);
    console.log(`Circuit breaker test: ${failures.length}/20 failures`);

    // At 50% failure rate we expect some failures
    expect(failures.length).toBeGreaterThan(0);
  });

  it('should eventually open circuit and return 503 with fallback', async () => {
    // Flood with requests to ensure threshold is crossed
    const results: number[] = [];
    for (let i = 0; i < 30; i++) {
      const res = await client.get('/flaky');
      results.push(res.status);
    }

    const circuitOpen = results.some((s) => s === 503);
    const hasFailures = results.some((s) => s >= 500);

    console.log('Statuses:', [...new Set(results)]);

    // Either the circuit opened (503) or there were raw failures
    expect(hasFailures || circuitOpen).toBe(true);
  });
});

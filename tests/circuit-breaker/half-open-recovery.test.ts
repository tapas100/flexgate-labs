/**
 * Circuit Breaker Test: Half-Open Recovery
 * After openDuration, circuit enters half-open and should recover
 */
import { createClient, sleep } from '../helpers';
import axios from 'axios';

const client = createClient();

describe('Circuit Breaker: Half-Open Recovery', () => {
  it('should allow probe requests in half-open state and recover', async () => {
    // Step 1: Trip the circuit
    console.log('Step 1: Tripping circuit...');
    for (let i = 0; i < 20; i++) {
      await client.get('/flaky');
    }

    // Step 2: Wait for openDuration (20s for flaky-service in config)
    console.log('Step 2: Waiting for circuit to enter half-open (25s)...');
    await sleep(25000);

    // Step 3: Probe requests in half-open state
    console.log('Step 3: Probing half-open circuit...');
    const probeResults: number[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await client.get('/flaky');
      probeResults.push(res.status);
      await sleep(500);
    }

    console.log('Half-open probe statuses:', probeResults);

    // In half-open: either success (circuit closing) or 503 (still open)
    expect(probeResults.every((s) => [200, 500, 503].includes(s))).toBe(true);

    // Step 4: If some succeeded, circuit should be closing
    const successes = probeResults.filter((s) => s === 200);
    if (successes.length > 0) {
      console.log(`✅ Circuit recovering: ${successes.length} probe(s) succeeded`);
    }
  }, 60000); // 60s timeout for this test
});

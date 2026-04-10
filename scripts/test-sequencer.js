/**
 * Custom Jest test sequencer for flexgate-labs.
 *
 * WHY THIS EXISTS:
 *   Redis-based rate-limit tests require Redis to be running.
 *   chaos/redis-down.test.ts stops Redis during its run and restores it
 *   in afterAll — but if another redis-stopping test runs concurrently or
 *   immediately before rate-limit tests, the Redis counter state is gone.
 *
 * ORDER ENFORCED:
 *   1. admin/          — auth + management API (needs no infra chaos)
 *   2. e2e/            — core routing journeys (baseline, everything healthy)
 *   3. security/       — header/payload attacks (no infra side-effects)
 *   4. observability/  — metrics, SSE, event bus (read-only infra)
 *   5. circuit-breaker/ — trips circuit breakers (flaky-service state changes)
 *   6. retry/          — depends on circuit state from above
 *   7. timeout/        — slow-service (no Redis dependency)
 *   8. rate-limit/     — MUST run with Redis UP; redis-down.test.ts is last in group
 *   9. chaos/          — kills infra; runs last so nothing else breaks
 */

const Sequencer = require('@jest/test-sequencer').default;

const ORDER = [
  'admin',
  'e2e',
  'security',
  'observability',
  'circuit-breaker',
  'retry',
  'timeout',
  'rate-limit',
  'chaos',
];

/**
 * Within the rate-limit group, redis-down must be last so the other
 * rate-limit tests run with Redis fully operational.
 */
function rateLimit429Sorter(a, b) {
  const aIsRedisDown = a.path.includes('redis-down');
  const bIsRedisDown = b.path.includes('redis-down');
  if (aIsRedisDown && !bIsRedisDown) return 1;
  if (!aIsRedisDown && bIsRedisDown) return -1;
  return a.path.localeCompare(b.path);
}

class FlexgateSequencer extends Sequencer {
  sort(tests) {
    return [...tests].sort((a, b) => {
      const aGroup = ORDER.findIndex((g) => a.path.includes(`/tests/${g}/`) || a.path.includes(`\\tests\\${g}\\`));
      const bGroup = ORDER.findIndex((g) => b.path.includes(`/tests/${g}/`) || b.path.includes(`\\tests\\${g}\\`));

      const aIdx = aGroup === -1 ? ORDER.length : aGroup;
      const bIdx = bGroup === -1 ? ORDER.length : bGroup;

      if (aIdx !== bIdx) return aIdx - bIdx;

      // Within rate-limit group: redis-down runs last
      if (aIdx === ORDER.indexOf('rate-limit')) {
        return rateLimit429Sorter(a, b);
      }

      return a.path.localeCompare(b.path);
    });
  }
}

module.exports = FlexgateSequencer;

# FlexGate Labs 🧪

Production-grade testing and validation suite for **[FlexGate Proxy](https://github.com/tapas100/flexgate-proxy)**.

---

## Prerequisites

| Tool | Version |
|---|---|
| Node.js | 20+ |
| Podman + podman-compose | latest |
| k6 | latest (load tests only) |

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start all services (mock backends + flexgate proxy)
npm run infra:up

# 3. Seed routes & test data into the proxy
npm run seed

# 4. Run the full test suite
bash scripts/run-all-tests.sh
```

---

## Environment Configuration

Copy `.env` and fill in your proxy's `DEMO_PASSWORD`:

```bash
# .env
GATEWAY_URL=http://localhost:3000      # FlexGate proxy port
DEMO_EMAIL=admin@flexgate.dev
DEMO_PASSWORD=<your-demo-password>     # Must match DEMO_PASSWORD on proxy
WEBHOOK_RECEIVER_URL=http://localhost:3005
PROMETHEUS_URL=http://localhost:9090
```

> **Note:** Set `DEMO_MODE=true` and `DEMO_PASSWORD=<password>` on the FlexGate proxy to enable API auth in tests.

---

## Test Suites

| Command | Tests |
|---|---|
| `npm run test:e2e` | Full user journey, multi-route, invalid routes |
| `npm run test:admin` | Routes API, Webhooks API, Auth, Logs API |
| `npm run test:rate-limit` | Burst, 429 validation, Redis-down fallback, admin rate limiting |
| `npm run test:circuit-breaker` | Threshold trigger, open state, half-open recovery |
| `npm run test:retry` | Retry count, exponential backoff |
| `npm run test:timeout` | Slow-service timeout, no-hang |
| `npm run test:security` | SSRF, header injection, payload abuse |
| `npm run test:chaos` | Redis/Postgres/NATS down, upstream crash |
| `npm run test:observability` | Prometheus metrics, correlation IDs, event bus, SSE, health monitor |

### Run Everything

```bash
# Full suite (skips chaos by default)
bash scripts/run-all-tests.sh

# Include chaos tests
RUN_CHAOS=true bash scripts/run-all-tests.sh

# Skip load tests (if k6 not installed)
SKIP_LOAD=true bash scripts/run-all-tests.sh
```

---

## Load Tests (k6)

```bash
k6 run --env GATEWAY_URL=http://localhost:3000 load/baseline.js
k6 run --env GATEWAY_URL=http://localhost:3000 load/spike.js
k6 run --env GATEWAY_URL=http://localhost:3000 load/stress.js
k6 run --duration 1h load/soak.js   # soak test
```

---

## Chaos Engineering

```bash
# Kill individual services to test resilience
bash scripts/chaos/kill-redis.sh
bash scripts/chaos/kill-postgres.sh
bash scripts/chaos/kill-nats.sh
bash scripts/chaos/kill-upstream.sh users   # or orders, flaky, slow, webhook

# Restore
podman start flexgate-redis
```

---

## Reports

After running `bash scripts/run-all-tests.sh`, reports are in `reports/`:

```
reports/
├── full-report.json         ← consolidated pass/fail summary
├── e2e-results.json
├── security-results.json
├── ...
└── run-<timestamp>.log      ← full execution log
```

---

## What's Being Tested

| Feature | Source in flexgate-proxy |
|---|---|
| Proxy routing | `routes/routes.ts` |
| Circuit breaker | `src/circuitBreaker.ts` |
| Rate limiting (Redis) | `src/rateLimiter.ts` |
| Admin rate limiting | `src/middleware/rateLimiting.ts` |
| Webhook delivery + HMAC | `src/webhooks/WebhookManager.ts` |
| Event bus | `src/events/EventBus.ts` |
| Prometheus metrics | `src/metrics/index.ts` (prefix: `flexgate_`) |
| Auth / SSO | `src/auth/middleware.ts` |
| Health check monitor | `src/healthcheck/monitor.ts` |
| SSE streaming | `src/routes/stream.js` |
| Logs API | `routes/logs.ts` |

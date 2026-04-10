#!/usr/bin/env bash
# =============================================================================
# FlexGate Labs — Master Test Orchestration Script
# Runs the full production-grade test suite end-to-end
# =============================================================================
set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
REPORTS_DIR="$ROOT_DIR/reports"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
LOG_FILE="$REPORTS_DIR/run-$TIMESTAMP.log"
REPORT_FILE="$REPORTS_DIR/summary-$TIMESTAMP.json"

GATEWAY_URL="${GATEWAY_URL:-http://localhost:3000}"
SKIP_INFRA="${SKIP_INFRA:-false}"
SKIP_LOAD="${SKIP_LOAD:-false}"
RUN_CHAOS="${RUN_CHAOS:-false}"

# ── Colour helpers ────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${BLUE}[INFO]${RESET}  $*" | tee -a "$LOG_FILE"; }
success() { echo -e "${GREEN}[PASS]${RESET}  $*" | tee -a "$LOG_FILE"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*" | tee -a "$LOG_FILE"; }
error()   { echo -e "${RED}[FAIL]${RESET}  $*" | tee -a "$LOG_FILE"; }
header()  { echo -e "\n${BOLD}${BLUE}═══ $* ═══${RESET}" | tee -a "$LOG_FILE"; }

# ── State tracking ────────────────────────────────────────────────────────────
declare -A RESULTS
TOTAL_PASS=0
TOTAL_FAIL=0
START_TIME=$(date +%s)

run_step() {
  local name="$1"
  local label="$2"
  shift 2
  info "Running: $label"
  if "$@" >> "$LOG_FILE" 2>&1; then
    success "$label"
    RESULTS["$name"]="PASS"
    TOTAL_PASS=$((TOTAL_PASS + 1))
    return 0
  else
    error "$label"
    RESULTS["$name"]="FAIL"
    TOTAL_FAIL=$((TOTAL_FAIL + 1))
    return 1
  fi
}

# ── Setup ─────────────────────────────────────────────────────────────────────
mkdir -p "$REPORTS_DIR"
cd "$ROOT_DIR"

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║     FlexGate Labs — Full Test Orchestration      ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════════╝${RESET}"
echo -e "  Timestamp : $TIMESTAMP"
echo -e "  Gateway   : $GATEWAY_URL"
echo -e "  Log       : $LOG_FILE"
echo ""

# ── Step 1: Start Infrastructure ─────────────────────────────────────────────
header "STEP 1: Infrastructure"

if [ "$SKIP_INFRA" = "false" ]; then
  run_step "infra_up" "Start services (podman-compose)" \
    podman-compose -f podman-compose.yml up -d --build || true
else
  warn "SKIP_INFRA=true — skipping infrastructure start"
  RESULTS["infra_up"]="SKIP"
fi

# ── Step 2: Wait for readiness ────────────────────────────────────────────────
header "STEP 2: Service Readiness"
run_step "readiness" "Wait for all services to be healthy" \
  bash "$SCRIPT_DIR/wait-for-ready.sh"

# ── Step 3: E2E Tests ─────────────────────────────────────────────────────────
header "STEP 3: E2E Tests"
run_step "e2e" "E2E test suite" \
  npx jest --testPathPattern="tests/e2e" --runInBand --forceExit \
    --json --outputFile="$REPORTS_DIR/e2e-results.json" || true

# ── Step 3b: Admin API Tests ─────────────────────────────────────────────────
header "STEP 3b: Admin API Tests"
run_step "admin" "Admin API tests (routes, webhooks, auth, logs)" \
  npx jest --testPathPattern="tests/admin" --runInBand --forceExit \
    --json --outputFile="$REPORTS_DIR/admin-results.json" || true

# ── Step 4: Security Tests ────────────────────────────────────────────────────
header "STEP 4: Security Tests"
run_step "security" "Security test suite (SSRF, headers, payload)" \
  npx jest --testPathPattern="tests/security" --runInBand --forceExit \
    --json --outputFile="$REPORTS_DIR/security-results.json" || true

# ── Step 5: Observability Tests ───────────────────────────────────────────────
# NOTE: Must run BEFORE chaos — chaos tests kill containers that observability needs
header "STEP 5: Observability Tests"
run_step "observability" "Observability validation" \
  npx jest --testPathPattern="tests/observability" --runInBand --forceExit \
    --json --outputFile="$REPORTS_DIR/observability-results.json" || true

# ── Step 6: Circuit Breaker Tests ────────────────────────────────────────────
header "STEP 6: Circuit Breaker Tests"
run_step "circuit_breaker" "Circuit breaker tests" \
  npx jest --testPathPattern="tests/circuit-breaker" --runInBand --forceExit \
    --json --outputFile="$REPORTS_DIR/circuit-breaker-results.json" || true

# ── Step 7: Retry & Timeout Tests ────────────────────────────────────────────
header "STEP 7: Retry & Timeout Tests"
run_step "retry_timeout" "Retry and timeout tests" \
  npx jest --testPathPattern="tests/(retry|timeout)" --runInBand --forceExit \
    --json --outputFile="$REPORTS_DIR/retry-timeout-results.json" || true

# ── Step 8: Rate Limit Tests ──────────────────────────────────────────────────
# NOTE: Must run BEFORE chaos/redis-down — redis-down.test.ts stops Redis
#       which would corrupt rate-limit counter state if run out of order.
#       Within rate-limit tests, redis-down runs last (see scripts/test-sequencer.js).
header "STEP 8: Rate Limit Tests"
run_step "rate_limit" "Rate limiting tests" \
  npx jest --testPathPattern="tests/rate-limit" --runInBand --forceExit \
    --testSequencer=./scripts/test-sequencer.js \
    --json --outputFile="$REPORTS_DIR/rate-limit-results.json" || true

# ── Step 9: Chaos Tests ───────────────────────────────────────────────────────
# Runs LAST — kills infra containers (restored in afterAll + global-teardown)
header "STEP 9: Chaos Tests"
if [ "$RUN_CHAOS" = "true" ]; then
  run_step "chaos" "Chaos engineering tests" \
    npx jest --testPathPattern="tests/chaos" --runInBand --forceExit \
      --json --outputFile="$REPORTS_DIR/chaos-results.json" || true
else
  warn "RUN_CHAOS=false — skipping chaos tests (set RUN_CHAOS=true to enable)"
  RESULTS["chaos"]="SKIP"
fi

# ── Step 10: Load Tests ───────────────────────────────────────────────────────
header "STEP 10: Load Tests"
if [ "$SKIP_LOAD" = "false" ] && command -v k6 &>/dev/null; then
  run_step "load_baseline" "k6 baseline load test" \
    k6 run --summary-export="$REPORTS_DIR/k6-baseline.json" \
      --env GATEWAY_URL="$GATEWAY_URL" \
      --env API_KEY="${FLEXGATE_API_KEY:-test-api-key-12345}" \
      load/baseline.js || true
else
  warn "Skipping load tests (k6 not installed or SKIP_LOAD=true)"
  RESULTS["load_baseline"]="SKIP"
fi

# ── Final Report ──────────────────────────────────────────────────────────────
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

header "TEST SUMMARY"

echo ""
printf "%-30s %s\n" "Test Suite" "Result"
printf "%-30s %s\n" "──────────────────────────────" "──────"

for key in infra_up readiness e2e admin security observability circuit_breaker retry_timeout rate_limit chaos load_baseline; do
  status="${RESULTS[$key]:-SKIP}"
  if [ "$status" = "PASS" ]; then
    printf "%-30s ${GREEN}✅ PASS${RESET}\n" "$key"
  elif [ "$status" = "FAIL" ]; then
    printf "%-30s ${RED}❌ FAIL${RESET}\n" "$key"
  else
    printf "%-30s ${YELLOW}⏭  SKIP${RESET}\n" "$key"
  fi
done | tee -a "$LOG_FILE"

echo ""
echo -e "  Total Passed : ${GREEN}${TOTAL_PASS}${RESET}"
echo -e "  Total Failed : ${RED}${TOTAL_FAIL}${RESET}"
echo -e "  Duration     : ${DURATION}s"
echo ""

# Write JSON report
cat > "$REPORT_FILE" <<EOF
{
  "timestamp": "$TIMESTAMP",
  "duration_seconds": $DURATION,
  "gateway_url": "$GATEWAY_URL",
  "total_pass": $TOTAL_PASS,
  "total_fail": $TOTAL_FAIL,
  "passed": $([ $TOTAL_FAIL -eq 0 ] && echo "true" || echo "false"),
  "results": {
$(for key in infra_up readiness e2e admin security observability circuit_breaker retry_timeout rate_limit chaos load_baseline; do
  status="${RESULTS[$key]:-SKIP}"
  echo "    \"$key\": \"$status\","
done | sed '$ s/,$//')
  }
}
EOF

info "JSON report written to: $REPORT_FILE"
info "Full log at: $LOG_FILE"

if [ $TOTAL_FAIL -gt 0 ]; then
  echo -e "\n${RED}${BOLD}❌ TEST RUN FAILED — $TOTAL_FAIL suite(s) failed${RESET}\n"
  exit 1
else
  echo -e "\n${GREEN}${BOLD}✅ ALL TESTS PASSED${RESET}\n"
  exit 0
fi

#!/usr/bin/env bash
# Wait for all services to be healthy before running tests
set -euo pipefail

GATEWAY_URL="${GATEWAY_URL:-http://localhost:4000}"
MAX_RETRIES="${MAX_RETRIES:-30}"
RETRY_DELAY="${RETRY_DELAY:-3}"

check_service() {
  local url="$1"
  local name="$2"
  local attempt=0

  echo "⏳ Waiting for $name at $url..."
  while [ $attempt -lt "$MAX_RETRIES" ]; do
    if curl -sf --max-time 3 "$url" > /dev/null 2>&1; then
      echo "  ✅ $name is ready"
      return 0
    fi
    attempt=$((attempt + 1))
    echo "  [$attempt/$MAX_RETRIES] $name not ready, retrying in ${RETRY_DELAY}s..."
    sleep "$RETRY_DELAY"
  done

  echo "  ❌ $name failed to become ready after $((MAX_RETRIES * RETRY_DELAY))s"
  return 1
}

echo ""
echo "🚀 Waiting for FlexGate services to be ready..."
echo "========================================"

check_service "http://localhost:3001/health" "api-users"
check_service "http://localhost:3002/health" "api-orders"
check_service "http://localhost:3003/health" "flaky-service"
check_service "http://localhost:3004/health" "slow-service"
check_service "http://localhost:3005/health" "webhook-receiver"
check_service "${GATEWAY_URL}/health"        "flexgate-proxy"

echo ""
echo "✅ All services are ready!"
echo ""

#!/usr/bin/env bash
# Kill an upstream service container to simulate upstream crash
# Usage: ./kill-upstream.sh [users|orders|flaky|slow|webhook]
set -euo pipefail

SERVICE="${1:-users}"

case "$SERVICE" in
  users)   CONTAINER="flexgate-api-users" ;;
  orders)  CONTAINER="flexgate-api-orders" ;;
  flaky)   CONTAINER="flexgate-flaky" ;;
  slow)    CONTAINER="flexgate-slow" ;;
  webhook) CONTAINER="flexgate-webhook" ;;
  *)
    echo "❌ Unknown service: $SERVICE"
    echo "Usage: $0 [users|orders|flaky|slow|webhook]"
    exit 1
    ;;
esac

echo "🔴 Stopping upstream service: $CONTAINER..."
podman stop "$CONTAINER" 2>/dev/null || true
echo "✅ $CONTAINER stopped"
echo ""
echo "💡 To restore: podman start $CONTAINER"

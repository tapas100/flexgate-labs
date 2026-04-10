#!/usr/bin/env bash
# Kill Redis container to simulate Redis outage
set -euo pipefail

echo "🔴 Stopping Redis..."
podman stop flexgate-redis 2>/dev/null || true
echo "✅ Redis stopped"
echo ""
echo "💡 To restore: podman start flexgate-redis"

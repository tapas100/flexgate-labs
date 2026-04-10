#!/usr/bin/env bash
# Kill NATS container to simulate messaging outage
set -euo pipefail

echo "🔴 Stopping NATS..."
podman stop flexgate-nats 2>/dev/null || true
echo "✅ NATS stopped"
echo ""
echo "💡 To restore: podman start flexgate-nats"

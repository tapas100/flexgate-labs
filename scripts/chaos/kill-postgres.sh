#!/usr/bin/env bash
# Kill PostgreSQL container to simulate DB outage
set -euo pipefail

echo "🔴 Stopping PostgreSQL..."
podman stop flexgate-postgres 2>/dev/null || true
echo "✅ PostgreSQL stopped"
echo ""
echo "💡 To restore: podman start flexgate-postgres"

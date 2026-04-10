#!/usr/bin/env bash
# Seed local routes into the FlexGate proxy for testing

TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@flexgate.dev","password":"FlexGate2026!SecureDemo"}' \
  | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "ERROR: Could not get auth token (proxy rate-limited or not running?)"
  exit 1
fi
echo "Got token: ${TOKEN:0:30}..."

create_route() {
  local path="$1" upstream="$2" methods="$3"
  local result
  result=$(curl -s -X POST http://localhost:3000/api/routes \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"path\":\"$path\",\"upstream\":\"$upstream\",\"methods\":$methods}")
  if echo "$result" | grep -q '"success":true'; then
    echo "✅ Created route: $path → $upstream"
  else
    echo "⚠️  Route $path: $(echo "$result" | grep -o '"message":"[^"]*"' | head -1)"
  fi
}

create_route "/users"    "http://localhost:3001" '["GET","POST","PUT","DELETE"]'
create_route "/users/*"  "http://localhost:3001" '["GET","POST","PUT","DELETE"]'
create_route "/orders"   "http://localhost:3002" '["GET","POST","PUT","DELETE"]'
create_route "/orders/*" "http://localhost:3002" '["GET","POST","PUT","DELETE"]'
create_route "/flaky"    "http://localhost:3003" '["GET","POST"]'
create_route "/flaky/*"  "http://localhost:3003" '["GET","POST"]'
create_route "/slow"     "http://localhost:3004" '["GET","POST"]'
create_route "/slow/*"   "http://localhost:3004" '["GET","POST"]'
# webhook-receiver route — also declared in flexgate/config/base.yml (tests this config-file path)
create_route "/webhook"  "http://localhost:3005" '["GET","POST"]'
create_route "/webhook/*" "http://localhost:3005" '["GET","POST"]'

echo ""
echo "Done! Routes active:"
curl -s http://localhost:3000/api/routes \
  -H "Authorization: Bearer $TOKEN" | grep -o '"path":"[^"]*"'

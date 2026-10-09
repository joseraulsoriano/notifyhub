#!/usr/bin/env bash
# Prueba de humo contra Postgres y Redis reales: levanta la API, crea una notificación y la consulta.
set -euo pipefail

API=${API:-http://localhost:3000}
KEY=${DEV_API_KEY:-nh_dev_local_key}

node --enable-source-maps apps/api/dist/main.js &
API_PID=$!
trap 'kill $API_PID 2>/dev/null || true' EXIT

for _ in $(seq 1 30); do
  curl -sf "$API/health" >/dev/null && break
  sleep 1
done

BODY='{"sender":{"name":"CI"},"recipient":{"email":"ci@example.com"},"message":{"body":"hola"},"priority":"alta","preferredChannel":"EMAIL"}'

created=$(curl -sf -X POST "$API/v1/notifications" -H "X-API-Key: $KEY" -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: smoke-test-0001' -d "$BODY")
echo "POST → $created"
id=$(echo "$created" | node -e 'process.stdin.on("data", d => console.log(JSON.parse(d).id))')

replay_status=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/v1/notifications" -H "X-API-Key: $KEY" \
  -H 'Content-Type: application/json' -H 'Idempotency-Key: smoke-test-0001' -d "$BODY")
[ "$replay_status" = "202" ] || { echo "El reintento idempotente respondió $replay_status"; exit 1; }

detail=$(curl -sf "$API/v1/notifications/$id" -H "X-API-Key: $KEY")
echo "GET → $detail"
echo "$detail" | grep -q '"status":"QUEUED"' || { echo "La notificación no quedó en QUEUED"; exit 1; }

unauthorized=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/v1/notifications" -d "$BODY")
[ "$unauthorized" = "401" ] || { echo "Sin API key respondió $unauthorized"; exit 1; }

echo "Prueba de humo OK"

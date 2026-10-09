#!/usr/bin/env bash
# Prueba de humo contra Postgres real: levanta el Worker con `wrangler dev`, crea una notificación y la consulta.
# Queues y el Durable Object de rate limit los simula wrangler en local.
set -euo pipefail

API=${API:-http://127.0.0.1:8787}
KEY=${DEV_API_KEY:-nh_dev_local_key}
LOG=${SMOKE_LOG:-$(mktemp)}

pnpm --filter @notifyhub/api exec wrangler dev --ip 127.0.0.1 --port 8787 >"$LOG" 2>&1 &
API_PID=$!
trap 'kill $API_PID 2>/dev/null || true; pkill -P $API_PID 2>/dev/null || true' EXIT

for _ in $(seq 1 60); do
  curl -sf "$API/health" >/dev/null && break
  sleep 1
done
curl -sf "$API/health" >/dev/null || { echo "wrangler dev no arrancó:"; tail -40 "$LOG"; exit 1; }

BODY='{"sender":{"name":"CI"},"recipient":{"email":"ci@example.com"},"message":{"body":"hola"},"priority":"alta","preferredChannel":"EMAIL"}'
IDEMPOTENCY_KEY="smoke-test-$(date +%s)"

created=$(curl -sf -X POST "$API/v1/notifications" -H "X-API-Key: $KEY" -H 'Content-Type: application/json' \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" -d "$BODY") || { echo "POST falló:"; tail -40 "$LOG"; exit 1; }
echo "POST → $created"
id=$(echo "$created" | node -e 'process.stdin.on("data", d => console.log(JSON.parse(d).id))')

replay=$(curl -s -D - -o /dev/null -X POST "$API/v1/notifications" -H "X-API-Key: $KEY" \
  -H 'Content-Type: application/json' -H "Idempotency-Key: $IDEMPOTENCY_KEY" -d "$BODY")
echo "$replay" | grep -q '^HTTP/1.1 202' || { echo "El reintento idempotente no respondió 202"; exit 1; }
echo "$replay" | grep -qi '^idempotent-replayed: true' || { echo "El reintento no se marcó como replay"; exit 1; }

detail=$(curl -sf "$API/v1/notifications/$id" -H "X-API-Key: $KEY")
echo "GET → $detail"
echo "$detail" | grep -q '"status":"QUEUED"' || { echo "La notificación no quedó en QUEUED"; exit 1; }
echo "$detail" | grep -q '"from":"RECEIVED","to":"QUEUED"' || { echo "Falta RECEIVED → QUEUED en la bitácora"; exit 1; }

unauthorized=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/v1/notifications" -d "$BODY")
[ "$unauthorized" = "401" ] || { echo "Sin API key respondió $unauthorized"; exit 1; }

echo "Prueba de humo OK"

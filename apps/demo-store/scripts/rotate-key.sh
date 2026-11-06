#!/usr/bin/env bash
# Rota la API key de la tienda en NotifyHub (producción) y en Vercel, y la imprime para pegarla en la consola.
# Uso, desde la raíz del repo: bash apps/demo-store/scripts/rotate-key.sh
set -euo pipefail

NEON_PROJECT=dry-hat-07081567
NEON_ORG=org-jolly-morning-25273939
API=https://notifyhub-api.sc202357155.workers.dev
VERCEL_DIR="$(cd "$(dirname "$0")/../vercel" && pwd)"

KEY="nh_store_$(openssl rand -hex 24)"
HASH=$(printf %s "$KEY" | shasum -a 256 | cut -d' ' -f1)
CS=$(neonctl connection-string --project-id "$NEON_PROJECT" --org-id "$NEON_ORG")

echo "1/3 Actualizando la llave del cliente 'Tienda Demo (Vercel)' en Neon..."
psql "$CS" -X -q -v ON_ERROR_STOP=1 \
  -c "update client_app set api_key_hash = '$HASH' where name = 'Tienda Demo (Vercel)'"

echo "2/3 Guardando la llave en Vercel y publicando..."
printf %s "$KEY" | vercel env add NOTIFYHUB_API_KEY production --sensitive --force --cwd "$VERCEL_DIR" >/dev/null
vercel deploy --prod --yes --cwd "$VERCEL_DIR" >/dev/null

echo "3/3 Comprobando la llave contra la API..."
code=$(curl -s -o /dev/null -w '%{http_code}' -H "X-API-Key: $KEY" "$API/v1/notifications?limit=1")
[ "$code" = 200 ] || { echo "La API respondió $code"; exit 1; }

echo
echo "Listo. En la consola usa «Conectar» con:"
echo "  URL: $API"
echo "  API key: $KEY"

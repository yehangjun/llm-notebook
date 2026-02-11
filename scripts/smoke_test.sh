#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8000}"
PHONE="${PHONE:-13800138000}"

echo '1) health check'
curl -sS "$BASE_URL/health" | tee /tmp/mvp-health.json

echo '2) login'
TOKEN=$(curl -sS -X POST "$BASE_URL/auth/dev-login" \
  -H 'Content-Type: application/json' \
  -d "{\"phone\":\"$PHONE\"}" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')

if [ -z "$TOKEN" ]; then
  echo 'failed: token is empty'
  exit 1
fi

echo '3) feed'
ARTICLE_ID=$(curl -sS "$BASE_URL/feed?limit=1" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
if [ -z "$ARTICLE_ID" ]; then
  echo 'failed: article id is empty'
  exit 1
fi

echo "article_id=$ARTICLE_ID"

echo '4) bookmark'
curl -sS -o /dev/null -w '%{http_code}\n' -X POST "$BASE_URL/bookmarks/$ARTICLE_ID" \
  -H "Authorization: Bearer $TOKEN"

echo '5) create note'
curl -sS -X POST "$BASE_URL/notes" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"article_id\":\"$ARTICLE_ID\",\"title\":\"First note\",\"content\":\"MVP validation note\",\"is_public\":true,\"tags\":[\"mvp\",\"ai\"]}"

echo
echo 'smoke test passed'

#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8000}"
EMAIL="${EMAIL:-demo@example.com}"

echo '1) health check'
curl -sS "$BASE_URL/health" | tee /tmp/mvp-health.json

echo '2) send email code'
CODE=$(curl -sS -X POST "$BASE_URL/auth/email/send-code" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\"}" | sed -n 's/.*"debug_code":"\([^"]*\)".*/\1/p')

if [ -z "$CODE" ]; then
  echo 'failed: code is empty (debug_code missing)'
  exit 1
fi

echo "debug_code=$CODE"

echo '3) verify email code login'
TOKEN=$(curl -sS -X POST "$BASE_URL/auth/email/verify-code" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"code\":\"$CODE\"}" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')

if [ -z "$TOKEN" ]; then
  echo 'failed: token is empty'
  exit 1
fi

echo '4) feed'
ARTICLE_ID=$(curl -sS "$BASE_URL/feed?limit=1" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
if [ -z "$ARTICLE_ID" ]; then
  echo 'failed: article id is empty'
  exit 1
fi

echo "article_id=$ARTICLE_ID"

echo '5) bookmark'
curl -sS -o /dev/null -w '%{http_code}\n' -X POST "$BASE_URL/bookmarks/$ARTICLE_ID" \
  -H "Authorization: Bearer $TOKEN"

echo '6) create note'
curl -sS -X POST "$BASE_URL/notes" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"article_id\":\"$ARTICLE_ID\",\"title\":\"First note\",\"content\":\"MVP validation note\",\"is_public\":true,\"tags\":[\"mvp\",\"ai\"]}"

echo
echo 'smoke test passed'

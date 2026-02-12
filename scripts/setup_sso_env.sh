#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://localhost:8000}"
ENV_FILE="${ENV_FILE:-.env}"

if [ ! -f "$ENV_FILE" ]; then
  cp .env.example "$ENV_FILE"
fi

HOST=$(echo "$BASE_URL" | sed -E 's#^https?://([^/:]+).*$#\1#')

upsert() {
  local key="$1"
  local value="$2"
  if grep -qE "^${key}=" "$ENV_FILE"; then
    sed -i.bak "s#^${key}=.*#${key}=${value}#" "$ENV_FILE"
  else
    echo "${key}=${value}" >> "$ENV_FILE"
  fi
}

upsert "SSO_SUCCESS_REDIRECT_URL" "${BASE_URL}/"
upsert "SSO_ALLOWED_REDIRECT_HOSTS" "${HOST},localhost,127.0.0.1"
upsert "GMAIL_OAUTH_REDIRECT_URI" "${BASE_URL}/auth/sso/gmail/callback"
upsert "WECHAT_OAUTH_REDIRECT_URI" "${BASE_URL}/auth/sso/wechat/callback"

rm -f "${ENV_FILE}.bak"

echo "Updated ${ENV_FILE} for BASE_URL=${BASE_URL}"
echo "Next: fill credentials: GMAIL_OAUTH_CLIENT_ID/SECRET, WECHAT_OAUTH_APP_ID/SECRET, SMTP_*"

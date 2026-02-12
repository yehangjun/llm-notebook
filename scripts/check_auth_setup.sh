#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${ENV_FILE:-.env}"
BASE_URL="${BASE_URL:-http://localhost:8000}"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: ${ENV_FILE} not found"
  exit 1
fi

load_var() {
  local key="$1"
  awk -F= -v k="$key" '$1==k {sub(/^[^=]*=/, ""); print; exit}' "$ENV_FILE"
}

is_set() {
  local val="$1"
  [ -n "$val" ] && [ "$val" != "smtp.example.com" ] && [ "$val" != "your_smtp_user" ] && [ "$val" != "your_smtp_password" ]
}

SMTP_HOST=$(load_var SMTP_HOST || true)
SMTP_USERNAME=$(load_var SMTP_USERNAME || true)
SMTP_PASSWORD=$(load_var SMTP_PASSWORD || true)
GMAIL_ID=$(load_var GMAIL_OAUTH_CLIENT_ID || true)
GMAIL_SECRET=$(load_var GMAIL_OAUTH_CLIENT_SECRET || true)
WECHAT_ID=$(load_var WECHAT_OAUTH_APP_ID || true)
WECHAT_SECRET=$(load_var WECHAT_OAUTH_APP_SECRET || true)

echo "== Auth Setup Check =="

if is_set "$SMTP_HOST" && is_set "$SMTP_USERNAME" && is_set "$SMTP_PASSWORD"; then
  echo "SMTP: OK"
else
  echo "SMTP: MISSING"
fi

if [ -n "$GMAIL_ID" ] && [ -n "$GMAIL_SECRET" ]; then
  echo "Gmail OAuth: OK"
else
  echo "Gmail OAuth: MISSING"
fi

if [ -n "$WECHAT_ID" ] && [ -n "$WECHAT_SECRET" ]; then
  echo "WeChat OAuth: OK"
else
  echo "WeChat OAuth: MISSING"
fi

if command -v curl >/dev/null 2>&1; then
  echo "Providers endpoint:"
  curl -sS "${BASE_URL}/auth/sso/providers" || true
  echo
fi

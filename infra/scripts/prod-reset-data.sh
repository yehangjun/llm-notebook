#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/infra/docker-compose.prod.yml"
ENV_FILE="${ROOT_DIR}/.env"
DEFAULT_PROJECT_NAME="$(basename "$(dirname "${COMPOSE_FILE}")")"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-${DEFAULT_PROJECT_NAME}}"
RESET_CERTS="${RESET_CERTS:-0}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}."
  echo "Create it first: cp .env.example .env"
  exit 1
fi

if [[ "${1:-}" != "--yes" ]]; then
  echo "This will DELETE postgres and redis data volumes for project '${PROJECT_NAME}'."
  echo "Run with confirmation: ./infra/scripts/prod-reset-data.sh --yes"
  echo "Optional: RESET_CERTS=1 to also delete Caddy cert data and re-issue TLS certs."
  exit 1
fi

cd "${ROOT_DIR}"

echo "[1/5] Stop prod stack..."
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" down --remove-orphans

echo "[2/5] Remove data volumes (db/redis)..."
docker volume rm "${PROJECT_NAME}_db_data" "${PROJECT_NAME}_redis_data" >/dev/null 2>&1 || true

if [[ "${RESET_CERTS}" == "1" ]]; then
  echo "[3/5] Remove Caddy certificate volumes..."
  docker volume rm "${PROJECT_NAME}_caddy_data" "${PROJECT_NAME}_caddy_config" >/dev/null 2>&1 || true
else
  echo "[3/5] Keep Caddy certificate volumes (RESET_CERTS=1 to remove)."
fi

echo "[4/5] Rebuild and restart prod stack..."
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" up -d --build --remove-orphans

echo "[5/5] Current stack status:"
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" ps

echo "Reset complete. API startup runs alembic upgrade and bootstrap initialization."

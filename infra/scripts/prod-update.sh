#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/infra/docker-compose.prod.yml"
ENV_FILE="${ROOT_DIR}/.env"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}."
  echo "Create it first: cp .env.example .env"
  exit 1
fi

cd "${ROOT_DIR}"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree has local changes. Commit/stash before deploy update."
  exit 1
fi

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "${CURRENT_BRANCH}" == "HEAD" ]]; then
  echo "Detached HEAD detected. Pass branch explicitly: ./infra/scripts/prod-update.sh <branch>"
  exit 1
fi
BRANCH="${1:-${CURRENT_BRANCH}}"

echo "[1/5] Fetch latest from origin..."
git fetch --prune origin

echo "[2/5] Checkout branch ${BRANCH}..."
git checkout "${BRANCH}"

echo "[3/5] Fast-forward pull..."
git pull --ff-only origin "${BRANCH}"

echo "[4/5] Rebuild and restart prod stack..."
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" up -d --build --remove-orphans

echo "[5/5] Current stack status:"
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" ps

echo "Update complete. Alembic migration runs on API container startup."

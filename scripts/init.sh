#!/usr/bin/env bash
set -euo pipefail

if [ ! -f .env ]; then
  cp .env.example .env
  echo '.env created from .env.example'
else
  echo '.env already exists, skip'
fi

docker compose up -d --build

echo 'Applying migrations...'
for i in {1..10}; do
  if ./scripts/migrate.sh; then
    break
  fi
  if [ "$i" -eq 10 ]; then
    echo 'failed: migration did not succeed after retries'
    exit 1
  fi
  sleep 2
done

echo 'Services started:'
docker compose ps

#!/usr/bin/env bash
set -euo pipefail

if [ ! -f .env ]; then
  cp .env.example .env
  echo '.env created from .env.example'
else
  echo '.env already exists, skip'
fi

docker compose up -d --build

echo 'Services started:'
docker compose ps

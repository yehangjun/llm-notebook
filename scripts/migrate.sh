#!/usr/bin/env bash
set -euo pipefail

for f in deploy/postgres/migrations/*.sql; do
  echo "applying $f"
  docker-compose exec -T db psql -U mvp -d mvp < "$f"
done

echo 'migrations applied'

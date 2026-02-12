#!/usr/bin/env bash
set -euo pipefail

docker-compose exec -T db psql -U mvp -d mvp < deploy/postgres/migrations/001_auth_email_sso.sql

echo 'migrations applied'

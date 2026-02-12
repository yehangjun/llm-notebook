#!/usr/bin/env bash
set -euo pipefail

docker-compose down -v --remove-orphans
echo "Docker services, networks, and volumes have been cleaned."

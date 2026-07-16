#!/usr/bin/env bash
set -Eeuo pipefail

exec /usr/bin/docker compose \
  --env-file /opt/vatrushka/.env \
  -f /opt/vatrushka/infra/livekit/docker-compose.self-hosted.yml \
  restart livekit

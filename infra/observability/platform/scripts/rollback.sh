#!/usr/bin/env sh
set -eu

BASE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ENV_FILE=${OBSERVABILITY_ENV_FILE:-"$BASE_DIR/.env.observability"}
DRY_RUN=false

if [ "${1:-}" = "--dry-run" ]; then
  DRY_RUN=true
fi

if [ "$DRY_RUN" = true ]; then
  echo "Would stop the new observability stack without deleting volumes or S3 data"
  echo "Grafana DNS must be returned to the legacy endpoint manually"
  exit 0
fi

docker compose --env-file "$ENV_FILE" -f "$BASE_DIR/docker-compose.yml" down
echo "New observability stack stopped; volumes and S3 data were preserved"

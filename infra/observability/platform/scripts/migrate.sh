#!/usr/bin/env sh
set -eu

BASE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ENV_FILE=${OBSERVABILITY_ENV_FILE:-"$BASE_DIR/.env.observability"}
PHASE=${1:-validate}

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing observability env file: $ENV_FILE" >&2
  exit 1
fi

compose() {
  docker compose --env-file "$ENV_FILE" -f "$BASE_DIR/docker-compose.yml" "$@"
}

case "$PHASE" in
  validate)
    compose config -q
    echo "Compose configuration is valid"
    ;;
  deploy)
    compose config -q
    compose pull
    compose up -d
    "$BASE_DIR/scripts/healthcheck.sh"
    ;;
  cutover)
    echo "Cutover is intentionally manual: verify 72-hour parallel operation, then change Grafana DNS"
    echo "This script does not stop the legacy production monitoring stack"
    ;;
  *)
    echo "Usage: migrate.sh [validate|deploy|cutover]" >&2
    exit 2
    ;;
esac

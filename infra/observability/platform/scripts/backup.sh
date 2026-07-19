#!/usr/bin/env sh
set -eu

BASE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ENV_FILE=${OBSERVABILITY_ENV_FILE:-"$BASE_DIR/.env.observability"}
BACKUP_DIR=${OBSERVABILITY_BACKUP_DIR:-"$BASE_DIR/backups"}
DRY_RUN=false

if [ "${1:-}" = "--dry-run" ]; then
  DRY_RUN=true
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing observability env file: $ENV_FILE" >&2
  exit 1
fi

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
target="$BACKUP_DIR/$timestamp"

if [ "$DRY_RUN" = true ]; then
  echo "Would create configuration and Grafana backups in $target"
  echo "Prometheus TSDB, Loki S3 data and runtime secrets are intentionally excluded"
  exit 0
fi

mkdir -p "$target"
chmod 700 "$BACKUP_DIR" "$target"

tar \
  --exclude='./backups' \
  --exclude='./secrets' \
  --exclude='./.env.observability' \
  -czf "$target/configuration.tar.gz" \
  -C "$BASE_DIR" .

compose() {
  docker compose --env-file "$ENV_FILE" -f "$BASE_DIR/docker-compose.yml" "$@"
}

container=$(compose ps -q grafana)
if [ -z "$container" ]; then
  echo "Grafana container is not running" >&2
  exit 1
fi

volume=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/var/lib/grafana"}}{{.Name}}{{end}}{{end}}' "$container")
if [ -z "$volume" ]; then
  echo "Grafana volume was not found" >&2
  exit 1
fi

restart_grafana() {
  compose start grafana >/dev/null 2>&1 || true
}
trap restart_grafana EXIT INT TERM

compose stop grafana >/dev/null
docker run --rm \
  -v "$volume:/source:ro" \
  -v "$target:/backup" \
  alpine:3.22.1 \
  tar -czf /backup/grafana-volume.tar.gz -C /source .
compose start grafana >/dev/null
trap - EXIT INT TERM

sha256sum "$target/configuration.tar.gz" "$target/grafana-volume.tar.gz" > "$target/SHA256SUMS.txt"
echo "Backup created: $target"

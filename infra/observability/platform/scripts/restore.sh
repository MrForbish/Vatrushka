#!/usr/bin/env sh
set -eu

BASE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ENV_FILE=${OBSERVABILITY_ENV_FILE:-"$BASE_DIR/.env.observability"}
ARCHIVE=""
DRY_RUN=false

while [ "$#" -gt 0 ]; do
  case "$1" in
    --grafana-archive) ARCHIVE=${2:?archive path is required}; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [ -z "$ARCHIVE" ]; then
  echo "Usage: restore.sh --grafana-archive <path> [--dry-run]" >&2
  exit 2
fi

if [ ! -f "$ARCHIVE" ]; then
  echo "Grafana archive does not exist: $ARCHIVE" >&2
  exit 1
fi

if [ "$DRY_RUN" = true ]; then
  echo "Would restore Grafana from $ARCHIVE; Prometheus and Loki data are not modified"
  exit 0
fi

compose() {
  docker compose --env-file "$ENV_FILE" -f "$BASE_DIR/docker-compose.yml" "$@"
}

container=$(compose ps -q grafana)
volume=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/var/lib/grafana"}}{{.Name}}{{end}}{{end}}' "$container")
archive_dir=$(CDPATH= cd -- "$(dirname -- "$ARCHIVE")" && pwd)
archive_name=$(basename -- "$ARCHIVE")

restart_grafana() {
  compose start grafana >/dev/null 2>&1 || true
}
trap restart_grafana EXIT INT TERM

compose stop grafana >/dev/null
docker run --rm \
  -v "$volume:/target" \
  -v "$archive_dir:/backup:ro" \
  alpine:3.22.1 \
  sh -eu -c 'find /target -mindepth 1 -maxdepth 1 -exec rm -rf {} +; tar -xzf "/backup/$1" -C /target' sh "$archive_name"
compose start grafana >/dev/null
trap - EXIT INT TERM

echo "Grafana restore completed"

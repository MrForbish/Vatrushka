#!/usr/bin/env sh
set -eu

BASE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ENV_FILE=${OBSERVABILITY_ENV_FILE:-"$BASE_DIR/.env.observability"}

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing observability env file: $ENV_FILE" >&2
  exit 1
fi

set -a
. "$ENV_FILE"
set +a

compose() {
  docker compose --env-file "$ENV_FILE" -f "$BASE_DIR/docker-compose.yml" "$@"
}

expected="alertmanager alloy blackbox-exporter caddy grafana loki node-exporter prometheus"
running=$(compose ps --status running --services | sort | tr '\n' ' ')

for service in $expected; do
  echo "$running" | grep -q "${service} " || {
    echo "Service is not running: $service" >&2
    exit 1
  }
done

curl -fsS "http://${OBSERVABILITY_PRIVATE_BIND_IP}:9090/-/ready" >/dev/null
curl -fsS "http://${OBSERVABILITY_PRIVATE_BIND_IP}:3100/ready" >/dev/null
curl -fsS "https://${GRAFANA_DOMAIN}/api/health" >/dev/null

targets=$(curl -fsS "http://${OBSERVABILITY_PRIVATE_BIND_IP}:9090/api/v1/targets?state=active")
printf '%s' "$targets" | grep -q '"health":"up"' || {
  echo "Prometheus has no healthy active targets" >&2
  exit 1
}

echo "Observability healthcheck passed"

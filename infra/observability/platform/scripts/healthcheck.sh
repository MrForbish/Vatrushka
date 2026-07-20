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

HEALTHCHECK_ATTEMPTS=${OBSERVABILITY_HEALTHCHECK_ATTEMPTS:-30}
HEALTHCHECK_INTERVAL_SECONDS=${OBSERVABILITY_HEALTHCHECK_INTERVAL_SECONDS:-2}

wait_for_url() {
  name=$1
  url=$2
  attempt=1
  while ! curl -fsS "$url" >/dev/null 2>&1; do
    if [ "$attempt" -ge "$HEALTHCHECK_ATTEMPTS" ]; then
      echo "Timed out waiting for $name: $url" >&2
      return 1
    fi
    attempt=$((attempt + 1))
    sleep "$HEALTHCHECK_INTERVAL_SECONDS"
  done
}

wait_for_healthy_targets() {
  url="http://${OBSERVABILITY_PRIVATE_BIND_IP}:9090/api/v1/targets?state=active"
  attempt=1
  while ! healthy_targets "$url"; do
    if [ "$attempt" -ge "$HEALTHCHECK_ATTEMPTS" ]; then
      echo "Prometheus has no healthy active targets" >&2
      return 1
    fi
    attempt=$((attempt + 1))
    sleep "$HEALTHCHECK_INTERVAL_SECONDS"
  done
}

wait_for_probe_series() {
  name=$1
  job=$2
  url="http://${OBSERVABILITY_PRIVATE_BIND_IP}:9090/api/v1/query"
  attempt=1
  while ! probe_series_exists "$url" "$job"; do
    if [ "$attempt" -ge "$HEALTHCHECK_ATTEMPTS" ]; then
      echo "Prometheus has no probe series for $name ($job)" >&2
      return 1
    fi
    attempt=$((attempt + 1))
    sleep "$HEALTHCHECK_INTERVAL_SECONDS"
  done
}

healthy_targets() {
  targets=$(curl -fsS "$1" 2>/dev/null) || return 1
  printf '%s' "$targets" | grep -q '"health":"up"'
}

probe_series_exists() {
  response=$(curl -fsS --get "$1" --data-urlencode "query=probe_success{job=\"$2\"}" 2>/dev/null) || return 1
  printf '%s' "$response" | grep -q '"result":\[{' || return 1
}

expected="alertmanager alloy blackbox-exporter caddy grafana loki node-exporter prometheus"
running=$(compose ps --status running --services | sort | tr '\n' ' ')

for service in $expected; do
  echo "$running" | grep -q "${service} " || {
    echo "Service is not running: $service" >&2
    exit 1
  }
done

wait_for_url "Prometheus" "http://${OBSERVABILITY_PRIVATE_BIND_IP}:9090/-/ready"
wait_for_url "Loki" "http://${OBSERVABILITY_PRIVATE_BIND_IP}:3100/ready"
wait_for_url "Grafana" "https://${GRAFANA_DOMAIN}/api/health"
wait_for_healthy_targets
wait_for_probe_series "LiveKit" "blackbox-livekit"
wait_for_probe_series "TURN TLS" "blackbox-turn"

echo "Observability healthcheck passed"

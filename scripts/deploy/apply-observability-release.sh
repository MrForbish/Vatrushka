#!/usr/bin/env sh
set -eu

# Runs on the monitoring VPS through the production bastion. Secrets and local
# compose overrides are ignored files and survive the archive extraction.
ARCHIVE=${1:?release archive path is required}
VERSION=${2:?release version is required}
APP_DIR=${VATRUSHKA_OBSERVABILITY_DIR:-/opt/vatrushka}

test -f "$ARCHIVE"
test -f "$APP_DIR/infra/observability/platform/.env.observability"

tar -xzf "$ARCHIVE" -C "$APP_DIR"
rm -f "$ARCHIVE"

cd "$APP_DIR/infra/observability/platform"
set -- --env-file .env.observability -f docker-compose.yml
if [ -f docker-compose.local.yml ]; then
  set -- "$@" -f docker-compose.local.yml
fi
docker compose "$@" config -q
# Compose does not recreate a container merely because a bind-mounted config
# file changed. Recreate the platform so Prometheus rules, Grafana dashboards,
# Alloy, Loki and alerting configuration from this release are actually loaded.
docker compose "$@" up -d --force-recreate
./scripts/healthcheck.sh
printf 'Observability runtime is ready: version=%s\n' "$VERSION"

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
docker compose "$@" up -d
./scripts/healthcheck.sh
printf 'Observability runtime is ready: version=%s\n' "$VERSION"

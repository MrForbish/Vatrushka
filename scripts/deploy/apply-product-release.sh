#!/usr/bin/env sh
set -eu

# Runs on the production VPS.  The CI job transfers an immutable git archive;
# secrets and update artifacts deliberately remain outside the archive.
ARCHIVE=${1:?release archive path is required}
VERSION=${2:?release version is required}
COMMIT=${3:?commit is required}
UPDATE_PATH=${4:?update feed path is required}

case "$VERSION" in *[!0-9.]*|*..*|'') exit 2 ;; esac
case "$UPDATE_PATH" in /*) ;; *) exit 2 ;; esac

# Prefer the declared canonical root.  Looking up a currently running
# container here used to keep deployments pinned to a historical release
# directory, while operators quite reasonably updated /opt/vatrushka/.env.
# Fall back only for an older installation that has not yet created the
# canonical root; its next successful deployment can then be migrated by the
# operator without a forced data move.
APP_DIR=${VATRUSHKA_APP_DIR:-/opt/vatrushka}
if [ ! -f "$APP_DIR/.env" ]; then
  compose_dir=$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}' vatrushka-api-1 2>/dev/null || true)
  if [ -n "$compose_dir" ] && [ -f "$compose_dir/../../.env" ]; then
    APP_DIR=$(CDPATH= cd -- "$compose_dir/../.." && pwd)
  fi
fi

test -f "$ARCHIVE"
test -f "$APP_DIR/.env"
mkdir -p "$UPDATE_PATH"

# tar overwrites tracked runtime files in place but preserves .env, named
# volumes, update artifacts and any operator-owned ignored configuration.
tar -xzf "$ARCHIVE" -C "$APP_DIR"
rm -f "$ARCHIVE"

if ! grep -q '^UPDATE_FEED_PATH=' "$APP_DIR/.env"; then
  printf 'UPDATE_FEED_PATH=%s\n' "$UPDATE_PATH" >> "$APP_DIR/.env"
fi

cd "$APP_DIR"
export BUILD_COMMIT="$COMMIT"
docker compose --env-file .env -f infra/docker/docker-compose.yml config -q
docker compose --env-file .env -f infra/docker/docker-compose.yml up -d --build postgres redis api caddy

attempt=0
until curl -fsS http://127.0.0.1:3001/health/ready >/dev/null; do
  attempt=$((attempt + 1))
  test "$attempt" -lt 30 || { docker compose --env-file .env -f infra/docker/docker-compose.yml ps; exit 1; }
  sleep 2
done

# Do not report a successful release when the operator enabled Hawk in this
# runtime's .env but that configuration did not reach the API container.
if grep -qx 'HAWK_ENABLED=true' "$APP_DIR/.env"; then
  curl -fsS http://127.0.0.1:3001/metrics | grep -Eq '^hawk_reporter_enabled(\{[^}]*\})? 1$' || {
    printf '%s\n' 'Hawk is enabled in the runtime .env but the API reporter is not active' >&2
    exit 1
  }
fi

# Keep the production telemetry agent on the same immutable source revision as
# the API. Its operator-owned .env.agent contains only endpoint and secret
# values and is deliberately preserved outside the release archive.
AGENT_DIR="$APP_DIR/infra/observability/agents"
if [ -f "$AGENT_DIR/.env.agent" ]; then
  cd "$AGENT_DIR"
  docker compose --env-file "$APP_DIR/.env" --env-file .env.agent -f docker-compose.yml --profile product --profile docker config -q
  docker compose --env-file "$APP_DIR/.env" --env-file .env.agent -f docker-compose.yml --profile product --profile docker up -d --force-recreate
else
  printf '%s\n' 'Observability agent was not deployed: missing infra/observability/agents/.env.agent' >&2
fi

printf 'Product runtime is ready: version=%s commit=%s\n' "$VERSION" "$COMMIT"

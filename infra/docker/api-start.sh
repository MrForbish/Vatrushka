#!/bin/sh
set -eu

# Do not compose connection strings from raw secrets in docker-compose.yml.
# The Node helper uses URL setters, which percent-encode reserved characters.
export DATABASE_URL="$(node infra/docker/runtime-connection-urls.mjs postgres)"
export REDIS_URL="$(node infra/docker/runtime-connection-urls.mjs redis)"

npm run db:migrate:prod -w @vatrushka/api
exec node apps/api/dist/index.js

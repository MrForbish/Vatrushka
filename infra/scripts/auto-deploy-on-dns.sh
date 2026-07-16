#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

ROOT="/opt/vatrushka"
STATE_FILE="/home/codex/vatrushka-auto-deploy.state"
LOCK_FILE="/home/codex/vatrushka-auto-deploy.lock"
EXPECTED_IP="213.171.7.154"
EMAIL="vatrushka-notify@yandex.ru"
TURN_DOMAIN="turn.myvatrushka.ru"
DOMAINS=("api.myvatrushka.ru" "livekit.myvatrushka.ru" "turn.myvatrushka.ru")
RESOLVERS=("1.1.1.1" "8.8.8.8")
MAIN_COMPOSE=(docker compose --env-file .env -f infra/docker/docker-compose.yml)
LIVEKIT_COMPOSE=(docker compose --env-file .env -f infra/livekit/docker-compose.self-hosted.yml)

write_state() {
  printf '%s %s\n' "$(date --iso-8601=seconds)" "$*" >"${STATE_FILE}.tmp"
  mv "${STATE_FILE}.tmp" "$STATE_FILE"
}

log() {
  printf '%s %s\n' "$(date --iso-8601=seconds)" "$*"
}

on_error() {
  local exit_code=$?
  local line="${BASH_LINENO[0]:-unknown}"
  write_state "FAILED exit=${exit_code} line=${line}"
  log "Deployment failed with exit ${exit_code} at line ${line}."
  exit "$exit_code"
}

trap on_error ERR

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  log "Another auto-deploy process is already running."
  exit 0
fi

cd "$ROOT"
write_state "WAITING_DNS"
log "Waiting for public DNS to resolve all Vatrushka domains to ${EXPECTED_IP}."

attempt=0
while true; do
  ready=true
  for resolver in "${RESOLVERS[@]}"; do
    for domain in "${DOMAINS[@]}"; do
      if ! dig +time=3 +tries=1 +short A "$domain" "@${resolver}" | grep -Fxq "$EXPECTED_IP"; then
        ready=false
      fi
    done
  done

  if "$ready"; then
    break
  fi

  attempt=$((attempt + 1))
  if (( attempt == 1 || attempt % 10 == 0 )); then
    log "DNS is not public yet; check ${attempt}. Next check in 60 seconds."
  fi
  sleep 60
done

log "DNS is visible through both public resolvers. Confirming stability."
sleep 30
for resolver in "${RESOLVERS[@]}"; do
  for domain in "${DOMAINS[@]}"; do
    dig +time=3 +tries=1 +short A "$domain" "@${resolver}" | grep -Fxq "$EXPECTED_IP"
  done
done

write_state "ISSUING_TURN_CERTIFICATE"
TURN_CERT="/etc/letsencrypt/live/${TURN_DOMAIN}/fullchain.pem"
if [[ ! -L "$TURN_CERT" && ! -f "$TURN_CERT" ]]; then
  if ss -ltnH '( sport = :80 )' | grep -q .; then
    caddy_id="$("${MAIN_COMPOSE[@]}" ps -q caddy 2>/dev/null || true)"
    if [[ -n "$caddy_id" ]]; then
      log "Stopping Vatrushka Caddy temporarily for ACME standalone validation."
      "${MAIN_COMPOSE[@]}" stop caddy
    else
      log "Port 80 is occupied by an unrelated process; refusing to stop it."
      exit 20
    fi
  fi

  log "Pulling the official Certbot image."
  docker pull certbot/certbot:latest
  log "Requesting TURN certificate."
  docker run --rm --network host \
    -v /etc/letsencrypt:/etc/letsencrypt \
    -v /var/lib/letsencrypt:/var/lib/letsencrypt \
    -v /var/log/letsencrypt:/var/log/letsencrypt \
    certbot/certbot:latest certonly \
    --standalone \
    --preferred-challenges http \
    --non-interactive \
    --agree-tos \
    --no-eff-email \
    --email "$EMAIL" \
    -d "$TURN_DOMAIN"
else
  log "TURN certificate already exists; issuance skipped."
fi

write_state "BUILDING"
log "Validating Compose configurations."
"${MAIN_COMPOSE[@]}" config --quiet
"${LIVEKIT_COMPOSE[@]}" config --quiet

log "Building the API image."
"${MAIN_COMPOSE[@]}" build --pull api

write_state "STARTING_CORE"
log "Starting PostgreSQL, API and Caddy."
"${MAIN_COMPOSE[@]}" up -d postgres api caddy

wait_for_url() {
  local url="$1"
  local marker="$2"
  local attempts="$3"
  local body
  local current
  for ((current = 1; current <= attempts; current++)); do
    body="$(curl --silent --show-error --fail --max-time 10 "$url" 2>/dev/null || true)"
    if [[ "$body" == *"$marker"* ]]; then
      return 0
    fi
    sleep 5
  done
  log "Timed out waiting for ${url}."
  return 1
}

log "Waiting for public API liveness."
wait_for_url "https://api.myvatrushka.ru/health/live" '"status":"ok"' 90

write_state "STARTING_LIVEKIT"
log "Starting LiveKit."
"${LIVEKIT_COMPOSE[@]}" up -d

write_state "VERIFYING"
log "Waiting for API readiness, including PostgreSQL and LiveKit."
wait_for_url "https://api.myvatrushka.ru/health/ready" '"status":"ready"' 90

log "Checking TURN/TLS certificate and listener."
tls_output="$(timeout 20 openssl s_client \
  -connect "${TURN_DOMAIN}:5349" \
  -servername "$TURN_DOMAIN" \
  -verify_return_error </dev/null 2>&1)"
printf '%s\n' "$tls_output" | grep -Fq 'Verify return code: 0 (ok)'

log "Deployment containers:"
"${MAIN_COMPOSE[@]}" ps
"${LIVEKIT_COMPOSE[@]}" ps

write_state "COMPLETE"
trap - ERR
log "Vatrushka server deployment completed successfully."

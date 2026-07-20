# Production observability

Канонический production-контур работает на отдельной monitoring VPS: Prometheus,
Grafana, Loki с S3 storage, Alloy, Alertmanager, Blackbox и exporters. Grafana
доступна только через `https://grafana.myvatrushka.ru`; Prometheus, Loki и
exporters принимают ingestion на private bind address. Публичный `/metrics` API
route закрыт.

Операционные действия описаны в [runbook](observability-runbook.md), backup и
восстановление — в [disaster recovery](observability-disaster-recovery.md).
Dashboard/provisioning и alert rules находятся в `infra/observability/platform`.

## Components and data

- API `/metrics`: bounded route templates, method/status class, request histogram, readiness, Node.js memory/CPU/event-loop lag, messaging/WebSocket/outbox counters;
- `node_exporter`: host CPU, memory, disks, network and systemd;
- cAdvisor: per-container CPU, memory, filesystem and network;
- PostgreSQL/Redis exporters: connection, lock, transaction, memory, client, command and eviction signals;
- blackbox exporter: public API/update-feed and LiveKit HTTPS probes, plus a TURN TLS probe;
- Prometheus: 15-second scrape/evaluation, 15-day/5-GB default retention and provisioned alert rules;
- Grafana: provisioned Prometheus datasource and `Vatrushka Production Overview` dashboard.

Metrics must not contain email, user/server/channel IDs, message text, filenames, invite tokens or arbitrary URLs. HTTP `route` is the Fastify route template, not the requested path, so UUIDs cannot create unbounded series.

## First deployment

Run from the canonical `/opt/vatrushka` checkout after the ordinary PR has reached production:

```bash
cd /opt/vatrushka/infra/observability
umask 077
cp .env.observability.example .env.observability
openssl rand -base64 36
# Put the generated value in GRAFANA_ADMIN_PASSWORD without committing it.

docker compose \
  --env-file ../../.env \
  --env-file .env.observability \
  -f docker-compose.yml config -q

docker compose \
  --env-file ../../.env \
  --env-file .env.observability \
  -f docker-compose.yml up -d
```

The production `.env` supplies existing PostgreSQL and Redis credentials only to their exporters. The Grafana password remains in the ignored `infra/observability/.env.observability` with mode `600`. Never paste rendered Compose output into logs because it contains interpolated secrets.

## Private access

Keep this tunnel open on the workstation:

```powershell
ssh -i C:\Users\Admin\.ssh\id_ed25519_vatrushka_server `
  -N `
  -L 13002:127.0.0.1:3002 `
  -L 19090:127.0.0.1:9090 `
  codex@213.171.7.154
```

Open `http://127.0.0.1:13002` for Grafana. Prometheus is available at `http://127.0.0.1:19090` only for diagnostics. Do not open ports `3002`, `9090`, `9100`, `8080`, `9187`, `9121` or `9115` in UFW/Timeweb firewall.

## Verification

```bash
curl -fsS http://127.0.0.1:9090/-/ready
curl -fsS http://127.0.0.1:3002/api/health
curl -fsS http://127.0.0.1:9100/metrics >/dev/null
curl -fsS http://127.0.0.1:9187/metrics >/dev/null
curl -fsS http://127.0.0.1:9121/metrics >/dev/null
curl -fsS https://api.myvatrushka.ru/metrics -o /dev/null -w '%{http_code}\n' # must be 404
```

In Prometheus, `up` must be `1` for all local jobs and `probe_success` must be `1` for HTTP, LiveKit and TURN probes. The deployment healthcheck requires the LiveKit and TURN probe series to exist, so a dashboard cannot silently degrade to `Нет метрик` because a blackbox module or target disappeared. The initial 0.6.3 capacity baseline recorded API/WebSocket/Redis/S3/LiveKit p95 comfortably inside budget; PostgreSQL p95 was `99.8 ms` against the initial `100 ms` budget, so connection/query/disk panels need particular attention.

## Alerts and delivery

Rules cover readiness, API 5xx/p95, outbox failure/age, Redis evictions/memory, PostgreSQL connection saturation, host disk and TLS expiry. They are visible immediately in Prometheus/Grafana. External notification delivery is intentionally not configured until a technical destination (SMTP, Telegram or another on-call channel) is selected; absence of a delivery receiver is shown in the roadmap and must not be confused with absence of alert evaluation.

Thresholds are conservative initial values. Review one week of production data before tightening them. Never hide a noisy alert without recording the measured baseline and the replacement threshold.

## Backup, retention and rollback

Prometheus retention is capped by both time and disk size. Grafana dashboards and datasource provisioning are versioned in the repository; only users/preferences live in `grafana_data`. Back up that named volume with the regular VPS backup cycle if UI-created preferences become important.

Rollback does not touch application data:

```bash
docker compose --env-file ../../.env --env-file .env.observability -f docker-compose.yml down
```

Named metric volumes remain unless explicitly removed. Never use `down -v` during a normal rollback.

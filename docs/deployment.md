# Deployment runbook

## LiveKit Cloud mode

1. Ubuntu 22.04/24.04, Docker Engine, Compose v2, public IPv4.
2. DNS A/AAAA для `DOMAIN`; 80/443 разрешены в provider firewall и UFW.
3. Скопировать `.env.example` в `.env`, установить `NODE_ENV=production`, HTTPS URLs и случайные secrets (минимум 32 bytes).
4. `docker compose --env-file .env -f infra/docker/docker-compose.yml config`.
5. `docker compose ... build --pull api`.
6. `docker compose ... up -d postgres api caddy`.
7. Проверить `https://$DOMAIN/health/live` и `/health/ready`.

## Operations

```bash
docker compose --env-file .env -f infra/docker/docker-compose.yml ps
docker compose --env-file .env -f infra/docker/docker-compose.yml logs -f --tail=200 api
docker compose --env-file .env -f infra/docker/docker-compose.yml exec postgres pg_isready
docker compose --env-file .env -f infra/docker/docker-compose.yml pull caddy postgres
docker compose --env-file .env -f infra/docker/docker-compose.yml build --pull api
docker compose --env-file .env -f infra/docker/docker-compose.yml up -d
```

Backup PostgreSQL выполняйте до обновления schema/image. Rollback приложения: checkout предыдущего tag, rebuild `api`, `up -d`; миграции в MVP additive, destructive rollback автоматически не выполняется.

API не имеет host `ports`, Swagger отключён production config, Caddy получает TLS автоматически. Не копируйте `.env` в image; Compose передаёт его runtime.

## Сборка клиента для production API

Desktop-клиент использует публичный адрес API во время сборки. На Windows-машине сборщика:

```powershell
Copy-Item apps/desktop/.env.production.example apps/desktop/.env.production
# замените api.example.com на свой HTTPS-домен
npm ci
npm run package:win
```

Раздавайте `apps/desktop/release/Vatrushka-Setup-<version>-x64.exe`. После изменения домена API клиент нужно пересобрать. `LIVEKIT_API_SECRET`, SMTP credentials и остальные server secrets в desktop env добавлять нельзя.

## Что именно хостится

- `api` — HTTPS API, auth, комнаты и выдача краткоживущих LiveKit participant tokens;
- `postgres` — пользователи, сессии, комнаты и screen-share leases;
- `caddy` — TLS и reverse proxy;
- LiveKit — отдельный Cloud-проект либо отдельный self-hosted media server;
- Windows-клиент не запускается на VPS: это устанавливаемый артефакт для компьютеров пользователей.

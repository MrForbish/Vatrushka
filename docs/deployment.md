# Deployment runbook

## LiveKit Cloud mode

1. Ubuntu 22.04/24.04, Docker Engine, Compose v2, public IPv4.
2. DNS A/AAAA для `DOMAIN` и `INVITE_DOMAIN`; 80/443 разрешены в provider firewall и UFW.
3. Скопировать `.env.example` в `.env`, установить `NODE_ENV=production`, `PUBLIC_API_URL`, `PUBLIC_INVITE_URL` и случайные secrets (минимум 32 bytes).
4. Создать `updates/` рядом с `.env`, затем выполнить `docker compose --env-file .env -f infra/docker/docker-compose.yml config`.
5. `docker compose ... build --pull api`.
6. `docker compose ... up -d postgres api caddy`.
7. Проверить `https://$DOMAIN/health/live`, `/health/ready` и redirect `https://$INVITE_DOMAIN/i/<token>`.

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

## Короткие приглашения

API включает в данные сервера только HTTPS-ссылку `PUBLIC_INVITE_URL/i/<opaque-token>`. Caddy обслуживает её на `INVITE_DOMAIN` и переводит в `vatrushka://invite/<opaque-token>`. Desktop валидирует token, сохраняет его до окончания авторизации/заполнения профиля, затем атомарно принимает приглашение и открывает сервер. Старые `/servers/join` и ручной ввод invite-кода отсутствуют.

## Публикация desktop-обновления

NSIS-клиент читает generic feed `https://api.myvatrushka.ru/updates`. Caddy раздаёт bind-mounted каталог `updates/` только на чтение. После `npm run package:win` публикуйте файлы атомарно: сначала `Vatrushka-Setup-<version>-x64.exe` и `.blockmap`, затем последним `latest.yml`. Это не позволяет клиенту увидеть metadata до появления артефакта.

```bash
mkdir -p /opt/vatrushka/updates
# скопируйте setup и blockmap
# скопируйте latest.yml во временное имя и затем mv в latest.yml
curl -fsS https://api.myvatrushka.ru/updates/latest.yml
```

Клиент проверяет обновления после запуска, затем раз в четыре часа. UI ничего не показывает во время проверки, при актуальной версии, ошибке feed или unsupported-режиме. Уведомление появляется только после `update-available`, во время загрузки или после `update-downloaded`; пользователь может его скрыть. Скачанное обновление устанавливается только после нажатия «Перезапустить» либо при штатном выходе. Автообновление работает для установленного NSIS-варианта. Переход с 0.3.0 на 0.4.0 требует одной ручной установки, поскольку в 0.3.0 updater ещё отсутствовал.

## Сборка клиента для production API

Desktop-клиент использует публичный адрес API во время сборки. На Windows-машине сборщика:

```powershell
Copy-Item apps/desktop/.env.production.example apps/desktop/.env.production
# замените api.example.com на свой HTTPS-домен
npm ci
npm run package:win
```

Раздавайте `apps/desktop/release/Vatrushka-Setup-<version>-x64.exe`; именно установленная версия поддерживает дальнейшие обновления без переустановки. После изменения домена API или update feed клиент нужно пересобрать. `LIVEKIT_API_SECRET`, SMTP credentials и остальные server secrets в desktop env добавлять нельзя.

## Что именно хостится

- `api` — HTTPS API, auth, серверы/каналы и выдача краткоживущих LiveKit participant tokens;
- `postgres` — пользователи, сессии, серверы, сообщения, permissions и channel screen-share leases;
- `caddy` — TLS, reverse proxy и статический desktop update feed;
- LiveKit — отдельный Cloud-проект либо отдельный self-hosted media server;
- Windows-клиент не запускается на VPS: это устанавливаемый артефакт для компьютеров пользователей.

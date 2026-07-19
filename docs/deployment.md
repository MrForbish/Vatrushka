# Deployment runbook

## Каноническая рабочая копия

Production Compose запускается из `/opt/vatrushka`: именно этот путь указан в labels активных контейнеров, принадлежит пользователю `codex` и используется для deploy. Вторую копию `/root/Vatrushka` нельзя обновлять или использовать параллельно. Перед её удалением root должен проверить `git status --short` и последний commit; уникальные изменения необходимо сохранить отдельной веткой либо patch-файлом.

## LiveKit Cloud mode

1. Ubuntu 22.04/24.04, Docker Engine, Compose v2, public IPv4.
2. DNS A/AAAA для `DOMAIN` и `INVITE_DOMAIN`; 80/443 разрешены в provider firewall и UFW.
3. Скопировать `.env.example` в `.env`, установить `NODE_ENV=production`, `PUBLIC_API_URL`, `PUBLIC_INVITE_URL`, `PRESENCE_STORAGE_DRIVER=redis`, случайный `REDIS_PASSWORD` и остальные secrets (минимум 32 bytes). Для официального публичного сервера укажите его UUID в `FEATURED_SERVER_ID`; это server-only значение не попадает в desktop.
4. Создать `updates/` рядом с `.env`, затем выполнить `docker compose --env-file .env -f infra/docker/docker-compose.yml config`.
5. `docker compose ... build --pull api`.
6. `docker compose ... up -d postgres redis api caddy`.
7. Проверить `https://$DOMAIN/health/live`, `/health/ready` и redirect `https://$INVITE_DOMAIN/i/<token>`.

## Operations

```bash
docker compose --env-file .env -f infra/docker/docker-compose.yml ps
docker compose --env-file .env -f infra/docker/docker-compose.yml logs -f --tail=200 api
docker compose --env-file .env -f infra/docker/docker-compose.yml exec postgres pg_isready
docker compose --env-file .env -f infra/docker/docker-compose.yml exec redis sh -c 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli ping'
docker compose --env-file .env -f infra/docker/docker-compose.yml pull caddy postgres redis
docker compose --env-file .env -f infra/docker/docker-compose.yml build --pull api
docker compose --env-file .env -f infra/docker/docker-compose.yml up -d
```

Backup PostgreSQL выполняйте до обновления schema/image. Миграция `0012_remove_legacy_rooms_contract` намеренно удаляет только уже выведенные из эксплуатации `rooms`, `guest_sessions` и старую `screen_share_leases`; постоянные server channels и `channel_screen_share_leases` она не затрагивает. Следующая `0013_home_activity` добавляет историю для Home. После применения contract-миграции простой rollback image не восстановит удалённые legacy-таблицы, поэтому перед первым обновлением на эту версию обязателен backup.

`0016_nasty_malcolm_colcord` additive-миграция добавляет `message_mentions` и индексы для message/user lookup. Она не переписывает старые сообщения: их `mentions` после rollout останутся пустыми, потому что backend не восстанавливает entities ненадёжным regex-парсингом. `0023_attachment_cleanup_trigger` добавляет database-trigger, который гарантированно ставит S3 object и preview в очередь удаления даже при cascade-delete.

## Redis для presence

Compose запускает `redis:8-alpine` с паролем и публикует его только на `127.0.0.1:6379`. Не открывайте этот порт в UFW/provider firewall. Heartbeat является ephemeral-состоянием, поэтому RDB/AOF намеренно отключены; выбранный статус, custom status и privacy находятся в PostgreSQL и входят в обычный backup.

Для production оставьте `PRESENCE_STORAGE_DRIVER=redis`, задайте отдельный длинный `REDIS_PASSWORD`, а `REDIS_URL` вручную менять не требуется: Compose формирует внутренний URL для API. После rollout проверьте `PING` командой выше и `https://$DOMAIN/health/ready`. После рестарта Redis активный desktop восстановит online не позднее следующего heartbeat; до этого fail-closed статус будет offline.

## Приватный S3 для вложений

Production использует приватный бакет Timeweb Cloud `media-vatrushka`. Заполните server-only переменные из `.env.example`, установите `MEDIA_STORAGE_DRIVER=s3` и не копируйте credentials в desktop env. До сборки production image проверьте `.env` без вывода секретов:

```bash
cd /opt/vatrushka
grep -E '^(MEDIA_STORAGE_DRIVER|S3_ENDPOINT|S3_REGION|S3_BUCKET|S3_FORCE_PATH_STYLE|S3_KEY_PREFIX)=' .env
```

Порядок первого rollout:

```bash
cd /opt/vatrushka
docker compose --env-file .env -f infra/docker/docker-compose.yml build --pull api
docker compose --env-file .env -f infra/docker/docker-compose.yml run --rm --no-deps api \
  npm run media:verify:s3:prod -w @vatrushka/api
docker compose --env-file .env -f infra/docker/docker-compose.yml up -d postgres api
curl -fsS https://api.myvatrushka.ru/health/ready
docker compose --env-file .env -f infra/docker/docker-compose.yml run --rm api \
  npm run media:migrate:s3:prod -w @vatrushka/api
docker compose --env-file .env -f infra/docker/docker-compose.yml up -d caddy
```

Миграция `0014_simple_molly_hayes` additive; backfill повторяемый. `0022_square_luminals` добавляет durable очередь удаления S3-объектов, а `0023_attachment_cleanup_trigger` покрывает каскадные удаления вложений. На expand-фазе API оставляет копию legacy content в PostgreSQL, поэтому rollback выполняется возвратом предыдущего образа и `MEDIA_STORAGE_DRIVER=database`. Перед rollout проверьте `MEDIA_CLEANUP_UNFINISHED_HOURS` и `MEDIA_CLEANUP_INTERVAL_SECONDS`. Детали, object key layout и ручная проверка: [object storage](object-storage.md).

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

Клиент проверяет обновления сразу после запуска, затем каждые 15 минут, при возврате фокуса в приложение и после выхода Windows из сна. Проверка ограничена 30-секундным timeout; после ошибки выполняется фоновая повторная попытка через минуту, поэтому недоступный feed не блокирует запуск. Доступное обновление загружается автоматически, обязательную плашку нельзя закрыть, а установка запускается единственной кнопкой «Перезапустить и обновить». Во время активного голосового соединения restart заблокирован до выхода из звонка. NSIS собирается в `oneClick`-режиме, main вызывает `quitAndInstall(true, true)`, поэтому штатный upgrade не показывает мастер с кнопкой «Далее». Portable-вариант явно помечается как не поддерживающий автоустановку.

## Metrics

API отдаёт технические Prometheus-метрики на `GET /metrics`. Разрешите scrape только доверенному Prometheus либо ограничьте route на уровне Caddy/firewall. Минимальные alerts: `chat_outbox_failed_total > 0`, рост `chat_outbox_oldest_age_seconds`, `chat_redis_publish_errors_total`, длительное падение `chat_ws_connections_active` и рост `chat_message_create_errors_total`.

Production stack, приватный SSH-доступ, retention, dashboards, exporters и rollback описаны в [observability.md](observability.md). Публичный Caddy route `/metrics` обязан отвечать `404`; Prometheus обращается напрямую к `127.0.0.1:3001` на VPS.

## Сборка клиента для production API

Desktop-клиент использует публичный адрес API во время сборки. На Windows-машине сборщика:

```powershell
Copy-Item apps/desktop/.env.production.example apps/desktop/.env.production
# замените api.example.com на свой HTTPS-домен
npm ci
npm run package:win
```

Раздавайте `apps/desktop/release/Vatrushka-Setup-<version>-x64.exe`; именно установленная версия поддерживает дальнейшие обновления без переустановки. После изменения домена API или update feed клиент нужно пересобрать. `LIVEKIT_API_SECRET`, SMTP credentials и остальные server secrets в desktop env добавлять нельзя.

## Доступ к production PostgreSQL из VS Code

PostgreSQL не публикуется в интернет и слушает только `127.0.0.1:5433` на VPS. Откройте отдельный терминал на рабочем компьютере и оставьте SSH-туннель активным:

```powershell
ssh -i C:\Users\Admin\.ssh\id_ed25519_vatrushka_server -N -L 15433:127.0.0.1:5433 codex@213.171.7.154
```

В расширении PostgreSQL для VS Code используйте host `127.0.0.1`, port `15433`, значения database/user/password из production `.env` и отключённый SSL. Порт `5433` в firewall открывать нельзя. При ротации `POSTGRES_PASSWORD` одновременно обновите `DATABASE_URL` и перезапустите API/PostgreSQL штатным deployment flow.

## Что именно хостится

- `api` — HTTPS API, auth, серверы/каналы и выдача краткоживущих LiveKit participant tokens;
- `postgres` — пользователи, сессии, серверы, сообщения, permissions и channel screen-share leases;
- приватный S3 — содержимое вложений каналов и личных сообщений; metadata и права остаются в PostgreSQL/API;
- `caddy` — TLS, reverse proxy и статический desktop update feed;
- LiveKit — отдельный Cloud-проект либо отдельный self-hosted media server;
- Windows-клиент не запускается на VPS: это устанавливаемый артефакт для компьютеров пользователей.
# Voice presence rollout

For the current self-hosted LiveKit deployment use:

```env
VOICE_MOVE_STRATEGY=controlled-reconnect
VOICE_MOVE_TIMEOUT_SECONDS=15
VOICE_RECONCILE_INTERVAL_SECONDS=45
VOICE_DND_ENABLED=true
VOICE_MODERATOR_MOVE_ENABLED=true
```

Configure LiveKit to send signed webhooks to `https://api.myvatrushka.ru/api/v1/integrations/livekit/webhook`. Keep the previous `/api/v1/webhooks/livekit` target only during a rolling migration; both paths validate the raw body with the LiveKit server SDK.

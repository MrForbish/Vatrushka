# Ватрушка

«Ватрушка» — рабочий MVP настольного приложения для временных голосовых комнат на Windows 10/11 x64. Пользователь входит по одноразовому email-коду, создаёт комнату до пяти человек, приглашает зарегистрированных пользователей или гостей, разговаривает через LiveKit и может показать монитор либо отдельное окно. Камеры, чат, запись, файлы и постоянные каналы намеренно отсутствуют.

## Архитектура

```text
┌──────────────────────── Electron desktop ────────────────────────┐
│ React renderer ── allowlisted preload IPC ── Electron main       │
│ API client       LiveKit client             safeStorage/DPAPI    │
│ UI + media       microphone/screen          desktopCapturer      │
└──────────── HTTPS/JWT ───────────┬──────── WSS/WebRTC ────────────┘
                                   │
                         ┌─────────▼─────────┐      ┌───────────────┐
                         │ Caddy → Fastify   │─────▶│ LiveKit Cloud │
                         │        API        │      │ or one VM     │
                         └─────────┬─────────┘      └───────────────┘
                                   │
                              PostgreSQL
```

- npm workspaces: `apps/desktop`, `apps/api`, `packages/shared`, `packages/config`.
- Desktop: Electron 43, React 19, electron-vite, LiveKit JS SDK, Zod.
- API: Node.js, Fastify 5, PostgreSQL, Drizzle ORM, Nodemailer, LiveKit Server SDK.
- Авторизация: access JWT на 15 минут; opaque refresh token на 30 дней с rotation/reuse detection.
- Медиа: LiveKit Cloud по умолчанию; self-hosted меняется только значениями `LIVEKIT_*`.
- Единственная демонстрация обеспечивается транзакционной lease в PostgreSQL, а не только UI.

Подробности: [архитектура](docs/architecture.md), [аутентификация](docs/auth.md), [медиа](docs/media.md), [безопасность](docs/security.md).

## Структура

```text
apps/
  api/                 Fastify API, Drizzle schema, migration, tests
  desktop/             Electron main/preload/React, tests, packaging
packages/
  shared/              Zod contracts, domain helpers, shared tests
  config/              shared TypeScript configuration package
infra/
  docker/              API Dockerfile and main Compose
  caddy/               TLS reverse proxy
  livekit/             optional single-node self-hosted LiveKit
  scripts/             UFW and Windows icon scripts
docs/                   operating and design documentation
```

## Требования

- Node.js 24 LTS (минимум 22.12) и npm 10+;
- Windows 10/11 x64 для запуска Electron media-функций и создания NSIS;
- PostgreSQL 15+ для запуска API без Docker;
- Docker Engine + Compose v2 для локальной инфраструктуры/production;
- проект LiveKit Cloud либо self-hosted LiveKit;
- SMTP; для разработки подходят Mailpit или фиксированный OTP.

Текущая машина может использовать Node 25 для проверок, но CI и Docker зафиксированы на Node 24 LTS.

## Как попробовать на своём Windows-ПК

Клиенту нужен работающий API и LiveKit: один установленный `.exe` без backend сможет показать форму входа, но не создаст голосовую комнату.

### Вариант 1: запуск из исходников

1. Установите зависимости и создайте env:

   ```powershell
   npm ci
   Copy-Item .env.example .env
   Copy-Item apps/desktop/.env.example apps/desktop/.env
   ```

2. Укажите настоящие `LIVEKIT_URL`, `LIVEKIT_HTTP_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`. Для LiveKit Cloud оба URL обычно относятся к одному проекту, первый использует `wss://`, второй `https://`.

3. Запустите PostgreSQL и Mailpit:

   ```powershell
   docker compose --env-file .env -f infra/docker/docker-compose.yml --profile development up -d postgres mailpit
   ```

   Mailpit UI: `http://localhost:8025`. В `.env.example` уже стоят SMTP `localhost:1025` и development-код `123456`. Чтобы проверять реальные письма Mailpit, очистите `DEV_FIXED_OTP`.

4. Выполните миграцию и запустите API вместе с desktop-клиентом:

   ```powershell
   npm run db:migrate
   npm run dev
   ```

   API: `http://localhost:3000`; Swagger: `http://localhost:3000/docs` (только не-production).

5. Введите любой email. В development используется код `123456`; письмо также появится в Mailpit на `http://localhost:8025`.

Без Docker можно запустить PostgreSQL любым способом и поменять `DATABASE_URL`. Production flow не содержит in-memory заглушек; `MemoryStore`, `FakeMailer` и `FakeMediaService` импортируются только тестами.

### Вариант 2: установить собранный клиент

1. Сначала оставьте локальный API запущенным командой `npm run dev:api` либо разверните API на сервере по инструкции ниже.
2. Для локального API выполните `npm run package:win`. Для серверного API сначала создайте `apps/desktop/.env.production`:

   ```powershell
   Set-Content apps/desktop/.env.production 'VITE_PUBLIC_API_BASE_URL=https://api.example.com'
   npm run package:win
   ```

3. Запустите `apps/desktop/release/Vatrushka-Setup-0.1.0-x64.exe`. Он установит «Ватрушку» в профиль текущего пользователя и добавит ярлыки. `Vatrushka-Portable-0.1.0-x64.exe` запускается без установки.

Сборки MVP не подписаны code-signing сертификатом. Windows SmartScreen может показать предупреждение; подписывать публичные релизы нужно до распространения среди пользователей.

## Отдельные команды

```powershell
npm run dev:api
npm run dev:desktop
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
npm run package:win
npm run db:generate
npm run db:migrate
npm run db:studio
```

`npm run package:win` генерирует иконку и собирает `Vatrushka-Setup-<version>-x64.exe` и `Vatrushka-Portable-<version>-x64.exe` в `apps/desktop/release/`.

### Deep link в development

После запуска `npm run dev:desktop` протокол регистрируется для текущего пользователя. Проверка из PowerShell:

```powershell
Start-Process 'vatrushka://join/ABC234'
```

Приложение использует single-instance lock, валидирует protocol/host/code и передаёт только нормализованный код существующему окну.

## LiveKit Cloud

1. Создайте проект в LiveKit Cloud.
2. Скопируйте WebSocket URL, API key и API secret только в backend `.env`.
3. Настройте webhook на `https://<DOMAIN>/api/v1/webhooks/livekit` с тем же API key.
4. Никогда не добавляйте API secret в `apps/desktop/.env`: renderer получает лишь краткоживущий participant token от API.

Self-hosted режим описан в [docs/self-hosted-livekit.md](docs/self-hosted-livekit.md).

## Как развернуть на своём сервере

На сервере хостятся API, PostgreSQL и TLS reverse proxy. Electron-клиент не превращается в веб-сайт: его нужно собрать с адресом API и раздать пользователям как `.exe`. Для первого production-развёртывания проще использовать LiveKit Cloud, а на своём VPS держать только API и PostgreSQL.

Понадобятся Ubuntu 22.04/24.04, Docker Engine с Compose v2, домен вроде `api.example.com`, SMTP и проект LiveKit Cloud.

На Ubuntu VM:

```bash
git clone <repository> /opt/vatrushka
cd /opt/vatrushka
cp .env.example .env
# направить DNS api.example.com на IP сервера и заполнить .env
# NODE_ENV=production, DOMAIN=api.example.com, PUBLIC_API_URL=https://api.example.com
# удалить DEV_FIXED_OTP, указать SMTP_* и LIVEKIT_*
# сгенерировать ACCESS_TOKEN_SECRET и OTP_PEPPER: openssl rand -hex 32
docker compose --env-file .env -f infra/docker/docker-compose.yml config
docker compose --env-file .env -f infra/docker/docker-compose.yml build --pull api
docker compose --env-file .env -f infra/docker/docker-compose.yml up -d postgres api caddy
docker compose --env-file .env -f infra/docker/docker-compose.yml ps
curl https://api.example.com/health/ready
```

Откройте входящие 80/TCP и 443/TCP+UDP. Caddy автоматически запросит TLS-сертификат после правильной настройки DNS. Затем добавьте в LiveKit webhook `https://api.example.com/api/v1/webhooks/livekit`, соберите Windows-клиент с `VITE_PUBLIC_API_BASE_URL=https://api.example.com` и раздайте NSIS-файл пользователям.

API наружу не публикуется напрямую; доступен только через Caddy. Миграции выполняются при старте API. PostgreSQL и Caddy используют named volumes, сервисы имеют healthchecks, restart policy и log rotation. Полный runbook: [docs/deployment.md](docs/deployment.md).

Если LiveKit тоже должен находиться на вашем сервере, используйте [self-hosted runbook](docs/self-hosted-livekit.md). Для production предпочтителен официальный VM generator LiveKit: WebRTC требует отдельного DNS, trusted TLS и открытых 7881/TCP, 3478/UDP и 50000–60000/UDP.

## Переменные окружения

| Группа | Переменные |
|---|---|
| Process | `NODE_ENV`, `HOST`, `PORT`, `LOG_LEVEL`, `PUBLIC_API_URL` |
| Product | `APP_NAME`, `APP_PROTOCOL` |
| Database | `DATABASE_URL`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` |
| Tokens | `ACCESS_TOKEN_SECRET`, `ACCESS_TOKEN_TTL_SECONDS`, `REFRESH_TOKEN_TTL_DAYS` |
| OTP | `OTP_PEPPER`, `OTP_TTL_SECONDS`, `OTP_RESEND_SECONDS`, `DEV_FIXED_OTP` |
| SMTP | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME` |
| LiveKit | `LIVEKIT_URL`, `LIVEKIT_HTTP_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` |
| Rooms | `ROOM_MAX_PARTICIPANTS`, `ROOM_TTL_HOURS`, `SCREEN_SHARE_LEASE_SECONDS`, `SCREEN_SHARE_HEARTBEAT_SECONDS` |
| Network | `CORS_ALLOWED_ORIGINS`, `DOMAIN`, `LIVEKIT_DOMAIN`, `TURN_DOMAIN` |
| Desktop public | `VITE_PUBLIC_API_BASE_URL` |

Production API отклоняет development secrets и `DEV_FIXED_OTP`; обязательные настройки валидируются Zod до открытия порта. `ROOM_MAX_PARTICIPANTS` должен быть ровно `5`.

## Диагностика desktop media

### Микрофон

- Windows → Параметры → Конфиденциальность и безопасность → Микрофон: разрешите доступ desktop apps.
- Закройте программы, эксклюзивно удерживающие устройство.
- Выберите «Системное устройство», затем переключите устройство повторно.
- Логи: `%APPDATA%\Ватрушка\logs\main.log`; токены и OTP туда не пишутся.

### Screen share

- Источник должен оставаться открытым после показа picker.
- Если демонстрация занята, дождитесь остановки/30-секундного expiry lease.
- При потере heartbeat локальная публикация принудительно останавливается.
- Renderer не имеет доступа к `desktopCapturer`; источник выбирается одноразовым allowlist в main process.

### Системный звук

- В MVP loopback capture включается только на Windows и только если отмечен checkbox.
- Некоторые защищённые приложения и DRM-контент не отдают изображение/звук.
- Если источник не поддерживает аудио, показ видео продолжится без системного звука.

## Существенные допущения и ограничения

- LiveKit Cloud — основной production режим. Self-hosted single-node рассчитан только на несколько малых комнат.
- Истечение 12-часовой комнаты проверяется при каждом API-доступе; LiveKit дополнительно закрывает пустые комнаты. Отдельный scheduler для массовой уборки не нужен при MVP-нагрузке.
- Исключение удаляет текущего LiveKit participant. Постоянного ban list в требованиях нет.
- Уровень громкости зарезервирован в local settings schema, но отдельный UI slider не обязателен.
- Реальные SMTP delivery, LiveKit Cloud/WebRTC через NAT, Windows microphone/loopback/display capture требуют внешних credentials и устройств и не заменяются unit-тестами.
- E2E не захватывает реальный микрофон/экран. Оно проверяет Electron shell, sandbox/preload allowlist и deep link.
- Нет code signing, auto-update, E2EE, recording, telemetry и tray mode.

## Документация

- [Architecture](docs/architecture.md)
- [Auth](docs/auth.md)
- [Media](docs/media.md)
- [Deployment](docs/deployment.md)
- [Self-hosted LiveKit](docs/self-hosted-livekit.md)
- [Security](docs/security.md)
- [Testing](docs/testing.md)

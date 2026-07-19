# Ватрушка

«Ватрушка» — настольное приложение для общения на Windows 10/11 x64. Основная модель — постоянные серверы с текстовыми и голосовыми каналами, историей сообщений, ролями и правами. Новый аккаунт создаётся с паролем и подтверждением email; каждый вход требует пароль и второй фактор email/TOTP/recovery. В голосе доступны выбор аудиоустройств, подключение по двойному щелчку, звуки входа/выхода и демонстрация монитора либо окна с управляемым системным звуком.

Состав серверов и фактическое присутствие в голосовых каналах обновляются автоматически. Участники видны под названием голосового канала; роль с `MOVE_MEMBERS` может перетащить участника между каналами или направить ещё не подключённого участника в голосовой канал. В текстовом чате доступны attachment-only сообщения, inline-превью изображений, расширенный набор реакций, `@user`/`@role`/`@everyone`, личные сообщения со статусами доставки/прочтения и раздельные настройки уведомлений пользователя, сервера и канала.

После входа открывается персональная главная: быстрый возврат в недавний канал или активный звонок, до четырёх активных пространств, недавняя активность, проверка реальных Windows-аудиоустройств и onboarding нового пользователя. Данные загружаются через `GET /api/v1/home`, кэшируются для offline-состояния и инвалидируются при изменении голосового присутствия. Ручного присоединения по коду и отдельных временных комнат в приложении нет; сервер принимается только по короткой HTTPS-ссылке/deep link.

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
                         └──────┬──┴──────┬──┘      └───────────────┘
                                │         │
                         PostgreSQL   private S3
                                │
                              Redis
```

- npm workspaces: `apps/desktop`, `apps/api`, `packages/shared`, `packages/config`.
- Desktop: Electron 43, React 19, TanStack Query, electron-vite, LiveKit JS SDK, Zod.
- API: Node.js, Fastify 5, PostgreSQL, Drizzle ORM, Nodemailer, LiveKit Server SDK.
- Авторизация: scrypt-пароль, email/TOTP/recovery 2FA, управление устройствами, access JWT на 15 минут; opaque refresh token на 30 дней с rotation/reuse detection и хранением только в Electron main/safeStorage.
- Медиа: LiveKit Cloud по умолчанию; self-hosted меняется только значениями `LIVEKIT_*`.
- Сообщения: PostgreSQL — единственный durable source of truth; transactional outbox публикует realtime-события через Redis Pub/Sub в authenticated WebSocket gateway, а HTTP reconciliation восстанавливает пропущенные события.
- Вложения: приватный S3-compatible bucket в production; Fastify владеет credentials и выдаёт короткоживущие presigned URL только после auth/permission checks.
- Единственная демонстрация обеспечивается транзакционной lease в PostgreSQL, а не только UI.
- Серверы хранят постоянное членство, каналы, сообщения, иерархию ролей, channel overrides и audit log; права `SPEAK`, `STREAM_SCREEN` и `STREAM_APPLICATION_AUDIO` ограничиваются также grant-ами LiveKit-токена.

Каноническая документация начинается с [единого индекса](docs/README.md): [бизнес-спецификация](docs/product-specification.md), [техническая спецификация](docs/technical-specification.md) и [roadmap](docs/vnext-roadmap.md). Детальные ADR, runbook и release notes остаются поддерживающими документами.

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
.gitlab/                CODEOWNERS and Merge Request templates
.gitlab-ci.yml          GitLab quality, RC and production pipeline
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

Клиенту нужен работающий API и LiveKit: один установленный `.exe` без backend сможет показать форму входа, но не подключится к серверным голосовым каналам.

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

5. Зарегистрируйте аккаунт с паролем. Вход без пароля удалён; после проверки пароля всегда требуется email-код, TOTP или recovery-код. В development используется код `123456`; письмо также появится в Mailpit на `http://localhost:8025`.

Без Docker можно запустить PostgreSQL любым способом и поменять `DATABASE_URL`. Production flow не содержит in-memory заглушек; `MemoryStore`, `FakeMailer` и `FakeMediaService` импортируются только тестами.

### Вариант 2: установить собранный клиент

1. Сначала оставьте локальный API запущенным командой `npm run dev:api` либо разверните API на сервере по инструкции ниже.
2. Для локального API выполните `npm run package:win`. Для серверного API сначала создайте `apps/desktop/.env.production`:

   ```powershell
   Set-Content apps/desktop/.env.production 'VITE_PUBLIC_API_BASE_URL=https://api.example.com'
   npm run package:win
   ```

3. Запустите `apps/desktop/release/Vatrushka-Setup-<version>-x64.exe`. Он установит «Ватрушку» в профиль текущего пользователя, добавит ярлыки и сможет получать последующие обновления без переустановки. `Vatrushka-Portable-<version>-x64.exe` запускается без установки, но автообновление в portable-режиме отключено.

Сборки MVP не подписаны code-signing сертификатом. Windows SmartScreen может показать предупреждение; подписывать публичные релизы нужно до распространения среди пользователей.

## Отдельные команды

```powershell
npm run dev:api
npm run dev:desktop
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:storybook
npm run test:e2e
npm run test:visual
npm run db:check
npm run perf:bundle
npm run package:win
npm run db:generate
npm run db:migrate
npm run db:studio
```

`npm run package:win` генерирует иконку и собирает `Vatrushka-Setup-<version>-x64.exe`, его `.blockmap`, `latest.yml` для автообновления и `Vatrushka-Portable-<version>-x64.exe` в `apps/desktop/release/`.

### Deep link в development

После запуска `npm run dev:desktop` протокол регистрируется для текущего пользователя. Кнопка приглашения показывает только короткую HTTPS-ссылку вида `https://myvatrushka.ru/i/<token>`; ручного ввода кода нет. Для прямой проверки зарегистрированного протокола используйте токен из ссылки созданного сервера:

```powershell
Start-Process 'vatrushka://invite/ABCD2345test'
```

Приложение использует single-instance lock, валидирует protocol/host/token и передаёт только непрозрачный invite token существующему окну. После авторизации ссылка автоматически добавляет и открывает сервер; для уже состоящего участника она просто открывает его повторно.

## LiveKit Cloud

1. Создайте проект в LiveKit Cloud.
2. Скопируйте WebSocket URL, API key и API secret только в backend `.env`.
3. Настройте webhook на `https://<DOMAIN>/api/v1/webhooks/livekit` с тем же API key.
4. Никогда не добавляйте API secret в `apps/desktop/.env`: renderer получает лишь краткоживущий participant token от API.

Self-hosted режим описан в [docs/self-hosted-livekit.md](docs/self-hosted-livekit.md).

## Как развернуть на своём сервере

На сервере хостятся API, PostgreSQL и TLS reverse proxy. Electron-клиент не превращается в веб-сайт: его нужно собрать с адресом API и раздать пользователям как `.exe`. LiveKit можно держать на том же VPS по self-hosted runbook либо использовать облачный проект.

Понадобятся Ubuntu 22.04/24.04, Docker Engine с Compose v2, домены API/LiveKit/TURN, SMTP и self-hosted LiveKit либо облачный проект.

На Ubuntu VM:

```bash
git clone <repository> /opt/vatrushka
cd /opt/vatrushka
cp .env.example .env
# направить DNS example.com и api.example.com на IP сервера и заполнить .env
# NODE_ENV=production, DOMAIN=api.example.com, INVITE_DOMAIN=example.com
# PUBLIC_API_URL=https://api.example.com, PUBLIC_INVITE_URL=https://example.com
# удалить DEV_FIXED_OTP, указать SMTP_*, LIVEKIT_*, приватный S3 и случайный REDIS_PASSWORD
# сгенерировать ACCESS_TOKEN_SECRET и OTP_PEPPER: openssl rand -hex 32
mkdir -p updates
docker compose --env-file .env -f infra/docker/docker-compose.yml config
docker compose --env-file .env -f infra/docker/docker-compose.yml build --pull api
docker compose --env-file .env -f infra/docker/docker-compose.yml up -d postgres redis api caddy
docker compose --env-file .env -f infra/docker/docker-compose.yml ps
curl https://api.example.com/health/ready
```

Откройте входящие 80/TCP и 443/TCP+UDP. Caddy автоматически запросит TLS-сертификат после правильной настройки DNS. Затем добавьте в LiveKit webhook `https://api.example.com/api/v1/webhooks/livekit`, соберите Windows-клиент с `VITE_PUBLIC_API_BASE_URL=https://api.example.com` и раздайте NSIS-файл пользователям. Для следующих релизов сначала загрузите setup/blockmap, а затем `latest.yml` в каталог `updates/`; клиент проверяет `https://api.example.com/updates/latest.yml`.

API наружу не публикуется напрямую; доступен только через Caddy. Миграции выполняются при старте API. PostgreSQL и Caddy используют named volumes, сервисы имеют healthchecks, restart policy и log rotation. Полный runbook: [docs/deployment.md](docs/deployment.md).

Если LiveKit тоже должен находиться на вашем сервере, используйте [self-hosted runbook](docs/self-hosted-livekit.md). Для production предпочтителен официальный VM generator LiveKit: WebRTC требует отдельного DNS, trusted TLS и открытых 7881/TCP, 3478/UDP и 50000–60000/UDP.

## Переменные окружения

| Группа | Переменные |
|---|---|
| Process | `NODE_ENV`, `HOST`, `PORT`, `LOG_LEVEL`, `PUBLIC_API_URL`, `PUBLIC_INVITE_URL` |
| Product | `APP_NAME`, `APP_PROTOCOL`, `PLATFORM_OWNER_EMAIL` |
| Database | `DATABASE_URL`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` |
| Tokens | `ACCESS_TOKEN_SECRET`, `CREDENTIAL_ENCRYPTION_KEY`, `ACCESS_TOKEN_TTL_SECONDS`, `REFRESH_TOKEN_TTL_DAYS` |
| OTP | `OTP_PEPPER`, `OTP_TTL_SECONDS`, `OTP_RESEND_SECONDS`, `DEV_FIXED_OTP` |
| SMTP | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME` |
| LiveKit | `LIVEKIT_URL`, `LIVEKIT_HTTP_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` |
| Object storage | `MEDIA_STORAGE_DRIVER`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`, `S3_KEY_PREFIX`, `MEDIA_MAX_*`, `MEDIA_ALLOWED_MIME_TYPES`, `MEDIA_CLEANUP_*` |
| Presence | `PRESENCE_STORAGE_DRIVER`, `REDIS_URL`, `REDIS_PASSWORD`, `PRESENCE_HEARTBEAT_SECONDS`, `PRESENCE_TTL_SECONDS` |
| Media coordination | `SCREEN_SHARE_LEASE_SECONDS`, `SCREEN_SHARE_HEARTBEAT_SECONDS` |
| Network | `CORS_ALLOWED_ORIGINS`, `DOMAIN`, `INVITE_DOMAIN`, `LIVEKIT_DOMAIN`, `TURN_DOMAIN` |
| Desktop public | `VITE_PUBLIC_API_BASE_URL` |

Production API отклоняет development secrets и `DEV_FIXED_OTP`; обязательные настройки валидируются Zod до открытия порта.

## Диагностика desktop media

### Микрофон

- Windows → Параметры → Конфиденциальность и безопасность → Микрофон: разрешите доступ desktop apps.
- Закройте программы, эксклюзивно удерживающие устройство.
- Нажмите «Обновить» в блоке аудиоустройств: клиент кратко запрашивает audio-only доступ, после чего показывает названия, которые вернула Windows.
- «Системное устройство» означает текущий Windows default; рядом выводится его реальное название, когда Chromium его предоставляет. Нумерованных заглушек «Микрофон 1»/«Динамики 1» нет.
- Логи: `%APPDATA%\Ватрушка\logs\main.log`; токены и OTP туда не пишутся.

### Screen share

- Источник должен оставаться открытым после показа picker.
- Если демонстрация занята, дождитесь остановки/30-секундного expiry lease.
- При потере heartbeat локальная публикация принудительно останавливается.
- Renderer не имеет доступа к `desktopCapturer`; источник выбирается одноразовым allowlist в main process.

### Системный звук

- Loopback capture включается только на Windows и только если выбран вариант «Передавать звук приложения». Клиент требует точного применения `restrictOwnAudio` и проверяет результат захвата, чтобы голоса участников не дублировались в трансляции.
- Если текущая версия Chromium/Windows не может гарантированно исключить звук самой «Ватрушки», вариант со звуком недоступен либо показ автоматически останавливается с понятным сообщением. Видео без системного звука остаётся доступно.
- Некоторые защищённые приложения и DRM-контент не отдают изображение/звук.
- Если источник не поддерживает аудио, показ видео продолжится без системного звука.

## Существенные допущения и ограничения

- Production поддерживает LiveKit Cloud и self-hosted single-node; текущий сервер проекта использует self-hosted режим.
- Отдельные временные комнаты и гостевой вход удалены; голос доступен только авторизованным участникам серверных каналов.
- Модерация поддерживает kick, постоянный ban list, unban и audit log; platform admin не обходит server permissions.
- Зритель может отдельно выключать и регулировать громкость звука демонстрации; значение сохраняется локально.
- Демонстрация передаётся одним исходным high-quality слоем с разрешением выбранного источника до 2560×1440, 30 FPS и потолком 8 Mbps. Зритель запрашивает HIGH/30 FPS, а поверх видео показывается фактически декодируемое разрешение; итоговая пропускная способность всё равно зависит от канала ведущего, зрителя и LiveKit/TURN-маршрута.
- Реальные SMTP delivery, LiveKit Cloud/WebRTC через NAT, Windows microphone/loopback/display capture требуют внешних credentials и устройств и не заменяются unit-тестами.
- E2E использует виртуальное Chromium-аудиоустройство для проверки разрешения и раскрытия labels; матрица с физическими устройствами и экраном выполняется вручную на Windows.
- NSIS-клиент обновляется автоматически из generic update feed; portable-сборка не обновляется. Закрытие окна сворачивает приложение в tray, а явный выход завершает realtime. Пока нет code signing, E2EE и recording; `/metrics` содержит только технические агрегаты без текста сообщений.

## Документация

- [Architecture](docs/architecture.md)
- [Messaging and realtime](docs/messaging.md)
- [Architecture decisions](docs/adr/README.md)
- [Auth](docs/auth.md)
- [Media](docs/media.md)
- [Object storage](docs/object-storage.md)
- [Deployment](docs/deployment.md)
- [Self-hosted LiveKit](docs/self-hosted-livekit.md)
- [Security](docs/security.md)
- [Testing](docs/testing.md)
- [Test coverage and viewport matrix](docs/test-coverage-matrix.md)
- [Performance](docs/performance.md)
- [Capacity checks](docs/capacity-testing.md)
- [Release 0.4.4](docs/releases/0.4.4.md)
- [Release 0.4.3](docs/releases/0.4.3.md)
- [Release 0.4.2](docs/releases/0.4.2.md)
- [Release 0.4.1](docs/releases/0.4.1.md)
- [Release 0.4.0](docs/releases/0.4.0.md)
- [Release 0.3.0](docs/releases/0.3.0.md)
- [vNext roadmap](docs/vnext-roadmap.md)

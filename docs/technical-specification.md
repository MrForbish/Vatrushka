# Vatrushka: техническая спецификация

Статус документа: канонический, версия продукта 0.8.0.

## 1. Состав системы

Vatrushka — монорепозиторий npm workspaces:

| Пакет             | Ответственность                                                                                |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| `apps/desktop`    | Electron main/preload, React renderer, LiveKit клиент, автообновление, Windows упаковка          |
| `apps/api`        | Fastify API, WebSocket шлюз, PostgreSQL магазины, Redis, SMTP, S3, LiveKit интеграция с сервером |
| `packages/shared` | Zod-контракты, доменные типы, permissions и общие helpers                                      |
| `packages/config` | общие TypeScript-настройки                                                                     |
| `infra`           | Docker, Caddy, LiveKit и операционные scripts                                                  |

Ключевой поток:

```text
React renderer
  ├─ HTTPS/JWT ───────────────> Caddy -> Fastify -> PostgreSQL
  ├─ authenticated WebSocket ─> Fastify -> Redis Pub/Sub
  ├─ allowlisted IPC ─────────> preload -> Electron main/safeStorage/updater
  └─ WebRTC/WSS ──────────────> self-hosted LiveKit

Fastify -> private S3-compatible bucket
Fastify -> SMTP
LiveKit -> signed webhook -> Fastify
```

## 2. Границы доверия

Renderer считается недоверенным. Он не получает refresh token, LiveKit secret, SMTP/S3 credentials или произвольный доступ к Node/Electron API. `contextIsolation` включен; preload публикует минимальный типизированный allowlist. Refresh token шифруется через `safeStorage` и используется Electron main для rotation.

Fastify повторно проверяет auth, membership, permissions, ownership, optimistic version и входные Zod-схемы. UI-disable не является защитой. Production-конфигурация отклоняет fixed OTP, слабые секреты и отсутствующие обязательные integrations до открытия порта.

## 3. Настольный клиент

### 3.1. Процесс отображения

React 19 и TanStack Query отвечают за серверное состояние. `AppRouter` использует `HashRouter`, совместимый с packaged `file://`. `App.tsx` пока остается крупным orchestration controller и является целью безопасной декомпозиции; media connection должна жить выше экранов и settings routes.

Основные feature-модули: `home`, `servers`, `direct-messages`, `voice`, `screen-share`, `settings`, `notifications`, `security`, `update`. Переиспользуемая UI-система находится в `ui/{foundations,primitives,navigation,messaging,voice,overlays,layouts}`.

Gaming Home получает единый агрегат `GET /api/v1/home`. Backend объединяет PostgreSQL server membership и user activity, Redis voice projection, LiveKit-confirmed presence и permission-filtered server DTO. Ответ содержит компактный voice status, `quickReturn`, `activeSpaces` и `friendsInGame`; renderer подменяет только названия input/output фактическими Windows `MediaDeviceInfo`, не создавая демонстрационные production-данные. Realtime voice events coalesced-инвалидируют Home query, а reconnect восстанавливается HTTP snapshot. До появления отдельной friendship-модели социальный список использует реальные контакты существующих личных диалогов; это явно ограниченный compatibility source, а не скрытый mock.

### 3.2. Electron основной/предзагрузка

Main process владеет single-instance/deep-link обработкой, safeStorage, updater, desktopCapturer, native notifications и window lifecycle. Screen source передается renderer только через одноразовый allowlist без повторной проверки списка источников между выбором пользователя и Chromium request: окончательное отсутствие источника безопасно отклоняется самим display-media handler. Updater работает с generic feed `/updates`, классифицирует ошибки проверки как локальную сеть, инфраструктуру обновлений или неизвестную ошибку; portable-сборка не автообновляется.

Windows-окно использует безопасный `titleBarOverlay`: сохраняются системные minimize/maximize/close, Snap и double-click maximize, а renderer резервирует drag-region и размещает единственный центр уведомлений перед системными кнопками. Внешние контакты открываются только через typed IPC allowlist (`https://t.me/MaksZJ`, `mailto:vatrushka-notify@yandex.ru`).

Серверы имеют `private/public` visibility. Авторизованный каталог публичных серверов возвращает только безопасную сводку, поддерживает пагинацию/rate limit и поднимает configured `FEATURED_SERVER_ID` первым. Присоединение к public server не требует invite token. Иконка, banner и accent входят в presentation DTO через временные S3 URL; внутренние object keys не передаются. Профиль пользователя поддерживает avatar и cover object keys с JPEG/PNG/WebP upload intents.

### 3.3. СМИ

LiveKit управляет WebRTC. API выпускает краткоживущий participant token с grants по вычисленным permissions. Client media controller отвечает за connect/reconnect, устройства, participant volume, screen audio, track cleanup и повторную публикацию. PostgreSQL lease сериализует право показа экрана; heartbeat/expiry восстанавливают состояние после аварии. Voice participant DTO включает effective presence, а renderer применяет `presence.updated` непосредственно к списку участников и voice stage, поэтому индикаторы не зависят от speaking state или 30-секундного reconciliation refresh.

## 4. API и фоновые процессы

API построен на Fastify 5. `app.ts` регистрирует transport/routes, `service.ts` координирует use cases, PostgreSQL stores и специализированные services реализуют persistence и integrations. Это рабочая архитектура, но размеры `app.ts`, `service.ts` и `postgres-store.ts` требуют последующей модульной декомпозиции по bounded context без переписывания поведения.

Фоновые процессы:

- транзакционный outbox издатель;
- Redis наличие сердцебиения/истечение срока;
- durable cleanup S3-объектов;
- совместное использование экрана аренда сердцебиение;
- updater feed обслуживается Caddy из versioned artifacts.

Health endpoints различают liveness и readiness. `/metrics` отдает технические метрики API/messaging/media. Production Prometheus, Grafana, Loki/S3, Alertmanager, Blackbox и private Alloy agents подключены; ошибки API имеют bounded labels `code`, `route`, `status_class`, а heartbeat демонстрации — `result` без пользовательских данных.

## 5. Данные

### 5.1. PostgreSQL

PostgreSQL — источник истины для аккаунтов, серверов, permissions, сообщений, уведомлений, audit, S3 metadata и coordination leases. Drizzle migrations применяются вперед при старте API. Перед contract/destructive migration обязателен backup и проверяемый restore-план.

Функциональные группы таблиц:

- идентичность/безопасность: пользователи, сеансы, коды аутентификации, восстановление, события безопасности, блокировки, изменения электронной почты;
- сообщество: серверы, участники, псевдонимы зрителей, роли, роли участников, категории, каналы, приглашения, баны, переопределения, аудит;
- каноническая система обмена сообщениями: разговоры, участники, сообщения, вложения, реакции, упоминания, состояние прочтения, уведомления/настройки, outbox;
- операции: действия пользователя, аренда совместного использования экрана, задания по удалению объектов.

Legacy `text_*`, `direct_*`, `message_*` таблицы и mapping columns пока нельзя удалять: клиент 0.6.1 все еще выполняет compatibility reads, а S3 backfill и rollback window описаны ADR 0005. Их удаление разрешено только отдельной contract-фазой после canonical-only desktop release, подтверждения adoption/telemetry, остановки dual write/read, backup и интеграционного migration test.

### 5.2. Redis

Redis хранит только восстанавливаемое краткоживущее состояние: presence TTL, typing, WebSocket routing, Pub/Sub, deduplication и кэш unread. Потеря Redis не должна терять durable сообщения. Production Redis слушает loopback и защищен паролем; удаленный доступ выполняется через SSH tunnel.

### 5.3. S3

Bucket приватный. API создает ограниченный object key, выдает короткоживущий presigned upload/download URL после permission checks и финализирует metadata. Незавершенные и удаленные объекты очищаются durable job-очередью. Access keys не попадают в desktop.

Renderer не использует presigned URL как React key. Общий `StableImage` предварительно загружает новый URL и сохраняет уже показанный кадр до успешной загрузки, поэтому обновление подписи не создаёт пустую вспышку. `Avatar` отделяет круглую маску изображения от вынесенного поверх неё presence-индикатора. Перед загрузкой нового аватара desktop кадрирует ориентированное браузером изображение в квадрат 512×512; исходный файл не отправляется при отмене.

Изменение server icon/banner/accent обновляет server detail и summaries, а затем явно инвалидирует Home aggregate. Gaming Home получает акцент вместе с каждой voice-space записью и применяет его только к границе карточки; banner остаётся фоном под контрастным затемняющим слоем.

## 6. Messaging и realtime

Запись сообщения, mentions, read state, notification decision и outbox event фиксируются транзакционно. Worker публикует outbox в Redis Pub/Sub; каждый API instance доставляет адресованные события своим authenticated WebSocket sessions. Client сохраняет `eventId`, дедуплицирует события и после reconnect выполняет HTTP reconciliation.

Изменения server overview и каналов публикуются отдельными адресными событиями `server.updated` и `server.channel.updated`. Получатели вычисляются по актуальному членству; renderer инвалидирует server detail и только связанные server-settings snapshots. Ошибка Redis не откатывает уже подтверждённую PostgreSQL-транзакцию: периодическое HTTP reconciliation восстанавливает состояние.

Идемпотентность отправки строится на `(authorId, clientMessageId)`. Cursor истории — стабильный numeric message id. Read/delivered хранятся отдельно по пользователю и conversation. DND/mute/quiet-hours влияют на внешнее уведомление, но не удаляют durable notification.

Renderer нормализует относительные authenticated media URL относительно production API origin. HTTP(S)-ссылки из сообщений открываются только через main-process IPC с проверкой протокола и запретом embedded credentials. Read acknowledgement обновляет серверный cursor до очистки локального счётчика и разделителя. Update state отображается как единственная локальная запись Notification Center и не создаёт отдельный плавающий overlay.

## 7. Жизненный цикл аутентификации

- password: scrypt с уникальной солью;
- access JWT: 15 минут;
- opaque refresh: 30 дней, hash в PostgreSQL, rotation и reuse detection;
- Electron main хранит refresh только в DPAPI-encrypted file при включённом `rememberSession`; для session-only входа token rotation остаётся в памяти main process;
- второй фактор при каждом входе: email/TOTP/recovery;
- OTP rate limits, TTL и pepper;
- password reset использует отдельный OTP purpose, neutral request response и атомарный revoke всех PostgreSQL sessions;
- revoke single/all sessions и security events;
- legacy passwordless endpoints должны оставаться 404, а legacy refresh sessions — отзываться.

## 8. Production топология

Каноническая рабочая копия VPS — `/opt/vatrushka`. Docker Compose запускает Caddy, API, PostgreSQL и Redis; LiveKit/TURN развернуты self-hosted по отдельному runbook. API доступен наружу только через Caddy. PostgreSQL и Redis проброшены только на loopback. Media хранится в приватном Timeweb S3 bucket `media-vatrushka`.

Канонический release flow описан в [release-process.md](release-process.md): task MR squash-merge в `develop`, затем единый release MR `develop → main` создаёт production commit. Только annotated SemVer tag запускает production delivery. Tag pipeline сначала разворачивает API/Compose и проверяет readiness, затем обновляет monitoring VPS, собирает Windows installer и лишь после этого атомарно публикует update feed (`setup`/`blockmap` раньше `latest.yml`). Поэтому клиент не получает несовместимую версию раньше backend. Schema rollback требует отдельного плана и backup перед destructive migration.

## 9. Тестовая стратегия

| Уровень                    | Назначение                                                                        |
| -------------------------- | --------------------------------------------------------------------------------- |
| общая единица               | Zod, помощники, разрешения                                                        |
| API единица/инъекция            | аутентификация, бизнес-правила, маршруты, имитации                                               |
| integration                | настоящие PostgreSQL 17 и Redis 8, миграции и cross-instance semantics            |
| renderer блок/компонент    | вспомогательные средства медиа, редукторы в реальном времени, поведение UI                                     |
| Storybook interaction/a11y | состояния переиспользуемых компонентов                                            |
| Electron E2E               | предварительная загрузка/главная/аутентификация/навигация/медиа контракты                                      |
| visual Playwright          | эталонные stories в фиксированном viewport                                        |
| manual two-machine         | WebRTC, Windows devices, scaling и native updater                                 |
| capacity harness           | opt-in API/WebSocket/PostgreSQL/Redis/S3/LiveKit-control baseline и JSON evidence |

CI изолированно поднимает PostgreSQL/Redis services. Coverage оценивается по рискам, а не по проценту: auth, permissions, message idempotency, reconnect, media cleanup и migrations являются блокирующими зонами.

## 10. UI и visual contract

Storybook является исполняемым каталогом UI, но не заменяет сравнение с утвержденными макетами. Канонические токены, typography, geometry и components должны использоваться production-экранами без локальных копий стилей. Проверяются wide/medium/narrow desktop, переполнение русских строк, длинные имена, empty/loading/error/permission/conflict и клавиатура.

Pixel-perfect означает совпадение композиции, размеров, ритма, типографики и состояний с утвержденным reference на целевом viewport; это не оправдывает ломкий absolute layout. Адаптивное поведение документируется отдельно и проверяется snapshots/interaction tests.

## 11. Наблюдаемость

Реализованная схема: Prometheus + Grafana на VPS, `node_exporter`, cAdvisor, `postgres_exporter`, `redis_exporter`, API `/metrics` и blackbox probes. Все HTTP endpoints monitoring stack bindятся только к `127.0.0.1`, Grafana/Prometheus доступны через SSH tunnel, а публичный Caddy route `/metrics` закрыт.

Обязательные сигналы:

- API: RPS, задержка p50/p95/p99, 4xx/5xx, задержка цикла событий, куча, готовность;
- WebSocket: активные сессии, подключение/повторное подключение, ошибки отправки, обратное давление, задержка событий;
- Redis: память, клиенты, операций/сек, задержка команд, вытеснения, отклонённые подключения, Pub/Sub;
- PostgreSQL: подключения, блокировки, транзакции, задержка запросов, размер БД, outbox глубина/возраст самого старого;
- обмен сообщениями: задержка от создания до доставки, повторные попытки, дубликаты, ошибки согласования непрочитанных сообщений;
- S3: ошибки presign/upload/finalize/delete, незавершённые объекты, время очистки;
- LiveKit: комнаты/участники, повторное подключение, RTT/джиттер/потеря пакетов, где это разрешено экспортером;
- хост/контейнеры: CPU, RAM, диск, сеть, перезапуски, срок действия сертификата.

Alerts должны покрывать readiness failure, 5xx/latency surge, Redis memory/evictions, PostgreSQL connection saturation/locks, outbox backlog, S3 cleanup backlog, disk pressure и certificate expiry. Конкретные thresholds фиксируются после недельного baseline.

## 12. Управление изменениями

Изменения выполняются маленькими MR с одним назначением. Обычные task MR squash-merge в `develop`; assembly, production release, hotfix и обратная синхронизация используют merge commit, чтобы сохранить границы версии и позволить revert целого изменения. Generated outputs, reference-pack и секреты не коммитятся. Мертвый код удаляется только после доказательства отсутствия imports/runtime calls, теста заменяющего контракт и, для БД, завершенной expand/contract migration.

# Присутствие голоса и движение

Членство в голосовом чате подтверждается вебхуками LiveKit, проецируемыми атомарно в Redis, версионируемыми для каждого сервера и доставляемыми через приложение WebSocket. `docs/adr/0006-livekit-confirmed-voice-presence.md` определяет границы источника истины, ключи Redis, адаптеры, согласование и поведение при миграции. PostgreSQL не хранит временное членство в голосовом чате.

Клиент отправляет собственные bounded state transitions (`muted`, `deafened`, throttled `speaking`, `connectionQuality`) через `PATCH /api/v1/channels/:channelId/voice-state`. Backend сверяет authenticated user, channel и exact voice `sessionId`, обновляет Redis и публикует `voice.member.state.updated`; stale session получает `409 VOICE_SOURCE_CHANGED`. WebRTC RTT измеряется renderer через active ICE candidate pair и не записывается в PostgreSQL.

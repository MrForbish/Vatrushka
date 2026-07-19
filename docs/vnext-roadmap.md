# Vatrushka: roadmap

Обновлено для версии 0.7.0. Приоритеты: `P0` блокирует эксплуатационное качество, `P1` дает существенную продуктовую ценность, `P2` расширяет платформу.

## Состояние продукта

### Готово и используется

- password + обязательный email/TOTP/recovery второй фактор;
- безопасный password reset через отдельный email-код с отзывом всех активных сессий;
- постоянные серверы, текстовые/голосовые каналы, короткие invite links;
- роли, 40 permissions, channel overrides и audit log;
- Home dashboard, routed User/Server Settings и presence через Redis;
- canonical messaging, mentions, reactions, read/delivery, notification center;
- authenticated WebSocket, transactional outbox и HTTP reconciliation;
- приватные S3 attachments и durable cleanup;
- реальные Windows audio devices, voice, screen share, системный звук и PostgreSQL lease;
- self-hosted LiveKit/TURN;
- NSIS auto-update с self-hosted feed;
- unit, integration PostgreSQL/Redis, Storybook interaction, Electron и visual regression CI.
- gaming auth shell с фирменным логотипом, адаптивом 1100×680 и реальной session-only политикой «Запомнить меня».
- Gaming Home с компактным voice status, быстрым возвратом, активными голосовыми пространствами и реальными социальными контактами из существующих личных диалогов.

### Работает, но требует укрепления

- UI в целом соответствует дизайн-системе, но нет формальной матрицы адаптива для всех экранов;
- Storybook покрывает основные компоненты, но не все production edge states и viewport;
- canonical messaging все еще содержит legacy compatibility reads/tables;
- крупные orchestration-файлы затрудняют безопасные изменения;
- production Prometheus собирает API/runtime/messaging/media metrics; требуется накопить baseline и откалибровать alert thresholds;
- installer не подписан code-signing сертификатом;

## План выполнения

### P0.0 — Git branching и release automation

Статус: базовая модель выполнена в исторических PR #14–#16. С 19 июля 2026 года репозиторий перенесён в GitLab; `develop` и `main` сохранены, Merge Request policy и единый GitLab pipeline заменяют GitHub Actions. Protected branches, успешный pipeline и resolved discussions настраиваются в GitLab; независимый approval появится после добавления второго Maintainer.

1. Ввести `develop` как интеграционную ветку и выполнить контролируемый переход production `master → main` без разрыва VPS deployment/updater.
2. Поддерживать branch/MR policy tests, MR templates, CODEOWNERS и protected branch rules.
3. Разделять rules/jobs для ordinary MR, release candidate, release MR, tag-only production и sync; protected production secrets не выдавать MR jobs.
4. Добавить единый version check, безопасные `release:prepare --dry-run`/`release:validate`, RC/production metadata и checksums.
5. Следующий релиз собрать через immutable `assemble/<version> → release/<version>`, выпустить annotated tag и вернуть `[SYNC] main → develop`.

Критерий: некорректные направления MR блокируются автоматически, RC не попадает в stable feed, production publish возможен только из защищённого тега в `main`, а ручной rollback описан и проверен. Полный процесс — в [release-process.md](release-process.md).

### P0.1 — документация и доказательная очистка

Статус: канонические бизнес-/техническая спецификации, roadmap и inventory созданы в PR #12; settings fallback удален в PR #13. Текущий cleanup переносит channel overrides в production routed settings и удаляет недостижимый старый modal без потери сценариев. Legacy messaging остается compatibility-кодом и не удаляется до adoption gate.

1. Поддерживать `product-specification.md`, `technical-specification.md` и этот roadmap как канонические документы.
2. Построить import/runtime/API/schema inventory; разделить `dead`, `compatibility`, `future-approved`.
3. Удалить неиспользуемые UI fallback, feature flags и дублирующий ADR только после подтверждения parity.
4. Сначала перевести desktop на canonical-only messaging, затем наблюдать adoption и отдельной contract migration удалить legacy routes/tables/mapping columns.
5. Декомпозировать `App.tsx`, API `app.ts/service.ts` и PostgreSQL store по bounded context без большого переписывания.

Критерий: каждый удаленный контракт имеет поиск отсутствующих consumers, тест и migration/rollback note.

### P0.2 — UI/Storybook quality gate

1. Составить экран → story → reference → viewport matrix.
2. Проверить 1440×900, 1280×720, узкое desktop-окно и Windows scaling 100/125/150%.
3. Добавить stories для long Russian copy, empty/loading/error/permission/conflict, menus/modals и переполнения.
4. Исправить overlap, clipping, z-index, focus trap, outside click, hit areas и нерабочие действия.
5. Запретить локальные дубли токенов и сырые browser controls в production UI.

Критерий: visual/interaction/a11y CI зеленый, все действия достижимы мышью и клавиатурой, критический текст не обрезан.

### P0.3 — профильная voice-плашка

Статус: выполнено в `feat/ROADMAP-3-profile-audio-controls`. Кнопки используют фактический media snapshot, deafen fail-safe выключает микрофон и все входящие LiveKit-аудиоисточники, а undeafen не включает микрофон автоматически. Unit, Storybook, Electron E2E и visual regression покрывают поведение и двухстрочную адаптивную компоновку.

1. Добавить рядом с настройками две icon buttons: микрофон и входящий звук.
2. Синхронизировать их с фактическим LiveKit/media snapshot, а не локальной иллюзией состояния.
3. Deafen выключает входящий звук и микрофон; undeafen не включает микрофон неожиданно.
4. Добавить tooltip, aria-label, disabled/reconnecting состояния и unit/Storybook/E2E tests.

### P0.4 — server shell usability

Статус: выполнено в `feat/ROADMAP-4-server-shell-usability`. `ServerDetail` публикует описание, sidebar показывает empty/overflow состояния, а доступное только с `MANAGE_CHANNELS` контекстное меню использует существующий versioned settings API. Изменения сервера и каналов адресно рассылаются участникам через Redis/WebSocket и инвалидируют server/settings snapshots. Founder-плашки используют компактный `CEO Founder` без жёлтого фона сообщений. API, PostgreSQL conflict, component, Storybook и visual regression сценарии добавлены.

1. Показать описание сервера в server header/about surface с empty и overflow состояниями.
2. Добавить «Переименовать» в контекстное меню канала с permission check, validation, optimistic conflict и audit.
3. Отправлять channel/server updated realtime events и сразу обновлять sidebar/top bar/settings caches.
4. Привести platform owner UI к лаконичному `CEO Founder`; убрать желтую подложку его сообщений, оставить компактный badge/accent.

### P0.5 — CI и тестовое покрытие

Статус: quality gate создан в историческом PR #23 и перенесён в `.gitlab-ci.yml`. PostgreSQL/Redis integration выполняются в изолированных CI services, а desktop suite разделён на параллельные behavior/visual jobs GitLab Windows runner. Visual regression использует заранее собранный статический Storybook, step budgets/job timeouts и формальную risk/viewport matrix. Исторический GitHub baseline сохраняется до накопления сопоставимого GitLab baseline.

1. Зафиксировать mapping риска к тестам и удалить только дублирующие/неактуальные сценарии.
2. Кэшировать Playwright Chromium по версии lockfile/Playwright. Выполнено.
3. Ускорить visual suite без сокращения screenshots: внутрипроцессный параллелизм отклонён как нестабильный, выбран статический Storybook. Выполнено.
4. Исключить холодную dev-компиляцию каждой visual story с помощью одного production-like Storybook build. Выполнено.
5. Параллелить независимые CI jobs и сохранять traces/screenshots только при ошибке.
6. Добавить измерение duration по этапам и регрессионный бюджет pipeline. Выполнено: Storybook 77,9/180 секунд, Electron E2E 37,0/90 секунд, static visual 90,6/180 секунд на первом CI-прогоне; visual budget скорректирован после cold-runner прогона 166,7 секунды, в котором все 32 сценария прошли.

Цель: сократить `desktop-regression` с наблюдавшихся ~11 минут до 6–7 минут на cold runner без потери сценариев.

### P0.6 — эксплуатационная готовность

1. Реализовать отдельный rate-limited password reset с отзывом сессий и security event. Реализовано в WEB-24: neutral request response, отдельный hashed OTP purpose, atomic PostgreSQL revoke, presence cleanup, security notice и desktop/visual flow.
2. Добавить code signing и stable/beta update channels после получения сертификата; updater до этого продолжает работать с явным документированным риском SmartScreen.
3. Выполнить load tests PostgreSQL/Redis/API/WebSocket/LiveKit/S3 и установить capacity limits. Добавлен opt-in safety-guarded harness и начальные p95 budgets; production baseline и media-plane ceiling должны быть зафиксированы release evidence после выпуска кода.

### P1.1 — Prometheus/Grafana

Статус: отдельный production observability-контур развернут: Prometheus, Grafana, Alertmanager, Loki/S3, Alloy, Blackbox, private agents, шесть dashboards, backup/restore/rollback и config validation. Loki хранит логи в отдельном S3 bucket; Grafana доступна через выделенный домен. Остаются калибровка alerts по baseline и настройка технического receiver.

1. Уточнить/стабилизировать API metric names и cardinality. Выполнено для HTTP/runtime/messaging.
2. Развернуть отдельный observability VPS и перенести Prometheus/Grafana без остановки production. Выполнено; проверены private ingestion, Loki/S3 и публичный доступ к Grafana.
3. Настроить private ingestion, 30d/55GB Prometheus retention, 30d Loki retention, versioned dashboards и disk budget. Выполнено в конфигурации; требуется production smoke/load verification.
4. Собрать Infrastructure, Containers, Application, Prometheus Health, Loki Health и Logs Overview dashboards. Выполнено; детальные LiveKit/S3 collectors остаются следующим срезом.
5. Включить infrastructure/application/self-monitoring alerts и Alertmanager routing. Rules и routing готовы; фактический receiver и корректировка thresholds — после 72 часов параллельной работы и недельного baseline.
6. После 72 часов стабильности остановить legacy Grafana/Prometheus без удаления volumes, затем отдельным подтверждённым этапом удалить старые данные.

### P1.2 — сообщества и messaging

Текущий клиентский reliability-срез `WEB-25` объединяет связанные исправления без дробления на мелкие pipeline: обязательный one-click updater, безопасный video-only screen share, проверку фактического LiveKit presence перед move, durable email outbox, realtime voice-presence invalidation, каталог публичных серверов, server/profile media, Windows title bar, временные E2E-профили и UI-cleanup. После локального полного quality gate срез поставляется одним ordinary MR в `develop`.

- drag-and-drop порядка каналов и приватные категории;
- заявки на вступление и расширенные invite policies;
- поиск, закрепленные сообщения и threads;
- group DM UI после отдельного UX-среза;
- antivirus scanning и storage quotas для S3.

### P2 — медиа и платформы

- камеры, сетка и noise suppression;
- запись только с явным согласием и retention policy;
- web/mobile companion и push;
- E2EE после отдельного threat model.

## Очередность PR

1. `docs/git-branching-release-process` — аудит, целевая модель и безопасный cutover.
2. `chore/repository-policy` — policy tests, templates, CODEOWNERS и version scripts.
3. `chore/migrate-to-gitlab` — единый GitLab pipeline для ordinary/RC/release/tag/sync и перенос repository policy.
4. `refactor/safe-runtime` — доказуемо мертвые frontend/backend элементы без schema contract.
5. `feat/ROADMAP-3-profile-audio-controls` — mute/deafen, выполнено.
6. `feat/ROADMAP-4-server-shell-usability` — описание, rename, realtime и `CEO Founder`, выполнено.
7. `fix/storybook-responsive` — viewport/edge-state fixes.
8. `refactor/canonical-messaging-contract` — только после client adoption gate.
9. `feat/observability` — Prometheus/Grafana.

Каждый ordinary MR направляется в `develop` и проходит lint, typecheck, релевантные unit/integration, Storybook/Electron/visual проверки. Production получает только стабилизированный `release/*` или hotfix; Windows update публикуется tag pipeline по правилам [release-process.md](release-process.md).
# WEB-26 — Voice presence and drag-and-drop

- [x] Audit current LiveKit, Redis, WebSocket, permission, state, and DnD flows.
- [x] Add LiveKit-confirmed Redis projection, snapshot API, versioned events, deduplication, and late-leave protection.
- [x] Add explicit Cloud and controlled-reconnect transport adapters.
- [x] Add idempotent self/moderator moves with pending, confirmed, failed, and timeout states.
- [x] Add normalized renderer state, reconnect snapshots, pending UI, drag-and-drop, and keyboard-accessible move dialog.
- [x] Add periodic reconciliation, metrics, feature flags, unit tests, and Redis integration coverage.
- [ ] Production rollout: verify the new webhook path, enable flags in stages, and observe reconciliation/version-gap metrics.

# WEB-27 — Gaming authentication

- [x] Заменить auth shell на игровой адаптивный layout с финальным фирменным знаком и утверждённым фоном.
- [x] Сохранить password/email/TOTP/recovery/reset контракты и keyboard accessibility.
- [x] Реализовать настоящий session-only режим при выключенном «Запомнить меня».
- [x] Покрыть 1100×680, interaction, visual и Electron regression.

# WEB-28 — Gaming Home

- [x] Оставить ровно четыре центральных блока: voice status, быстрый возврат, активные пространства и друзья в игре.
- [x] Собрать permission-filtered агрегат из PostgreSQL, Redis voice projection и LiveKit-confirmed presence без production mocks.
- [x] Подключить прямой join голосового канала, переход к личному диалогу, realtime invalidation и offline cache.
- [x] Добавить empty/loading/error states, Storybook и visual baselines 1600×1000/1100×760.
- [ ] После отдельного проектирования заменить contacts-from-DM на каноническую friendship-модель с заявками и приватностью.

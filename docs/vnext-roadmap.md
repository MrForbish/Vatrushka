# Vatrushka: roadmap

Обновлено для версии 0.6.2. Приоритеты: `P0` блокирует эксплуатационное качество, `P1` дает существенную продуктовую ценность, `P2` расширяет платформу.

## Состояние продукта

### Готово и используется

- password + обязательный email/TOTP/recovery второй фактор;
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

### Работает, но требует укрепления

- UI в целом соответствует дизайн-системе, но нет формальной матрицы адаптива для всех экранов;
- Storybook покрывает основные компоненты, но не все production edge states и viewport;
- canonical messaging все еще содержит legacy compatibility reads/tables;
- крупные orchestration-файлы затрудняют безопасные изменения;
- `/metrics` реализован, но не собирается production Prometheus;
- installer не подписан code-signing сертификатом;
- password reset отсутствует;

## План выполнения

### P0.0 — Git branching и release automation

Статус: выполнено в PR #14–#16. `develop` и `main` введены, production VPS переведен на `main`, policy/version/release workflows работают. GitHub branch protection и обязательный approval остаются внешним ограничением: private repository на текущем плане возвращает `403`; до смены плана направления PR контролирует `pr-policy` workflow.

1. Ввести `develop` как интеграционную ветку и выполнить контролируемый переход production `master → main` без разрыва VPS deployment/updater.
2. Добавить branch/PR policy tests, PR templates, CODEOWNERS и protection после первого зеленого workflow run.
3. Разделить ordinary PR checks, release candidate, release PR, tag-only production и sync workflows; production secrets не выдавать PR jobs.
4. Добавить единый version check, безопасные `release:prepare --dry-run`/`release:validate`, RC/production metadata и checksums.
5. Следующий релиз собрать через immutable `assemble/<version> → release/<version>`, выпустить annotated tag и вернуть `[SYNC] main → develop`.

Критерий: некорректные направления PR блокируются автоматически, RC не попадает в stable feed, production publish возможен только из тега в `main`, а ручной rollback описан и проверен. Полный процесс — в [release-process.md](release-process.md).

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

Статус: ordinary/RC/release/tag/sync workflows разделены, PostgreSQL/Redis integration выполняются в изолированных CI services, а desktop suite разделен на параллельные behavior/visual jobs. Наблюдаемое критическое время сократилось с 9:10 до примерно 5:15 (около 43%) без удаления сценариев. Остаются browser cache, переиспользование Storybook artifact и duration budget.

1. Зафиксировать mapping риска к тестам и удалить только дублирующие/неактуальные сценарии.
2. Кэшировать Playwright Chromium по версии lockfile/Playwright.
3. Ускорить visual suite безопасным параллелизмом после проверки детерминизма; не сокращать screenshots.
4. Исключить повторные холодные сборки Storybook там, где interaction и visual могут использовать один артефакт.
5. Параллелить независимые CI jobs и сохранять traces/screenshots только при ошибке.
6. Добавить измерение duration по этапам и регрессионный бюджет pipeline.

Цель: сократить `desktop-regression` с наблюдавшихся ~11 минут до 6–7 минут на cold runner без потери сценариев.

### P0.6 — эксплуатационная готовность

1. Реализовать отдельный rate-limited password reset с отзывом сессий и security event.
2. Добавить code signing и stable/beta update channels после получения сертификата; updater до этого продолжает работать с явным документированным риском SmartScreen.
3. Выполнить load tests PostgreSQL/Redis/API/WebSocket/LiveKit/S3 и установить capacity limits.

### P1.1 — Prometheus/Grafana

1. Уточнить/стабилизировать API metric names и cardinality.
2. Развернуть Prometheus, Grafana, node/cAdvisor/PostgreSQL/Redis exporters и blackbox probes.
3. Ограничить доступ auth/VPN/SSH tunnel; настроить retention, backup dashboards и disk budget.
4. Собрать dashboards API/WebSocket, messaging/outbox, Redis, PostgreSQL, LiveKit/S3 и host.
5. После baseline включить alerts по перечню из технической спецификации.

### P1.2 — сообщества и messaging

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
3. `chore/release-workflows` — ordinary/RC/release/tag/sync GitHub Actions и CI speedup.
4. `refactor/safe-runtime` — доказуемо мертвые frontend/backend элементы без schema contract.
5. `feat/ROADMAP-3-profile-audio-controls` — mute/deafen, выполнено.
6. `feat/ROADMAP-4-server-shell-usability` — описание, rename, realtime и `CEO Founder`, выполнено.
7. `fix/storybook-responsive` — viewport/edge-state fixes.
8. `refactor/canonical-messaging-contract` — только после client adoption gate.
9. `feat/observability` — Prometheus/Grafana.

Каждый ordinary PR направляется в `develop` и проходит lint, typecheck, релевантные unit/integration, Storybook/Electron/visual проверки. Production получает только стабилизированный `release/*` или hotfix; Windows update публикуется tag workflow по правилам [release-process.md](release-process.md).

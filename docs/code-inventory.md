# Инвентаризация кода и данных

Дата аудита: 2026-07-18; актуализировано 2026-07-19 после release 0.6.3.

Этот документ отделяет действительно мертвый код от временной совместимости и от согласованных будущих функций. Он является safety checklist для cleanup PR, а не разрешением удалить все перечисленное одним изменением.

## Активные контуры

- Desktop: Electron main/preload, React `App.tsx`, feature-модули и UI kit.
- API: Fastify transport, application service, PostgreSQL stores, canonical messaging, settings, identity, realtime, presence, LiveKit, S3 cleanup и metrics.
- Shared: runtime Zod contracts, permissions и domain helpers.
- Infra: production Compose/Caddy, self-hosted LiveKit, release feed и приватный observability-контур Prometheus/Grafana/exporters.
- Tests: unit/API inject, настоящие PostgreSQL/Redis integration, Storybook interaction, Electron E2E и visual snapshots.

`dist`, `out`, `release`, `storybook-static`, `coverage`, `test-results` и updater artifacts являются генерируемыми outputs и не отслеживаются Git.

## Можно удалить безопасно

| Объект | Доказательство | Действие |
|---|---|---|
| `docs/adr/settings-routing-and-shell.md` | не входит в ADR registry, нигде не импортируется/не ссылается, дублирует и местами противоречит ADR 0001 | удален документационным PR |
| локальные reference-pack файлы | не являются runtime dependency и намеренно untracked | оставить только локально, не включать в release/repository |

Остальной runtime-код не помечается мертвым только по названию или размеру. Перед удалением требуется import/reference scan и релевантный тест.

## Совместимость — пока не удалять

### Canonical messaging expand window

Desktop 0.6.1 все еще объединяет legacy `listDirectConversations()` и canonical `listConversations()`. API выполняет compatibility mapping/read/write, а S3 migration поддерживает старые attachment rows. Поэтому пока активны:

- `text_messages`, `message_mentions`, `message_reactions`, `channel_read_states`, `message_attachments`;
- `direct_conversations`, `direct_messages`, `direct_message_reactions`, `direct_message_attachments`;
- `messages.legacy_text_message_id` и `messages.legacy_direct_message_id`;
- legacy-id helpers в canonical messaging service;
- backfill/verification tests.

Contract migration допустима только после canonical-only клиента, проверки production adoption, остановки compatibility writes, backup/restore rehearsal и migration integration test.

### Retired security contracts

Тесты, проверяющие `404` старых passwordless/room endpoints и отзыв legacy refresh sessions, не являются мертвыми. Это regression/security assertions, запрещающие случайное возвращение удаленного публичного контракта.

### Settings migration

Завершенные build-time feature flags и production fallback branches удалены после подтверждения API parity routed settings. `SecurityCenter` сохранен: его page presentation обслуживает реальные security routes. Старый modal `features/roles/ServerSettings` удален после переноса channel overrides, проверки опасного права `ADMINISTRATOR` и visual/interaction scenarios в канонический routed `ServerSettingsPage`. API-контракт и таблица `channel_permission_overwrites` остаются активными.

## Согласованный будущий код — сохранить

- group conversation data model до отдельного Group DM UI;
- object deletion queue и compatibility S3 migration до закрытия retention/backfill;
- metrics endpoint, collectors и приватный Prometheus/Grafana-контур; внешний канал доставки алертов и специализированные LiveKit/S3 collectors остаются по roadmap;
- typed settings routes и media controller, которые потребуются при декомпозиции `App.tsx`;
- permission/audit primitives для будущих категорий, invite policies и moderation.

Будущий код должен иметь ссылку на канонический roadmap или ADR, не открывать неработающий UI и быть покрыт schema/domain test.

## Архитектурный долг, но не dead code

- `apps/desktop/src/renderer/src/App.tsx` объединяет navigation, auth, messaging и media orchestration;
- `apps/api/src/app.ts` содержит слишком много route registration;
- `apps/api/src/service.ts` объединяет несколько bounded contexts;
- `apps/api/src/db/postgres-store.ts` является монолитным persistence adapter;
- `ServerSettingsPage.tsx` содержит много независимых settings sections.

Их следует разделять небольшими behavior-preserving PR. Полная перепись одновременно увеличит риск для auth, voice, screen share и permissions.

## База данных: правила очистки

1. Получить фактический список таблиц production и размеры/index usage только read-only запросом.
2. Сопоставить каждую таблицу со schema export, store query, API route, migration и rollback note.
3. Сначала остановить reads/writes в релизе expand.
4. Наблюдать минимум один обязательный client adoption window.
5. Выполнить backup и проверку restore.
6. Добавить forward-only contract migration и integration test на снимке совместимой схемы.
7. Удалить TypeScript mapping только в том же или следующем PR после применения migration.

Таблица не удаляется только потому, что текущий UI ее не показывает: sessions, outbox, audit, cleanup и leases обслуживают фоновые гарантии.

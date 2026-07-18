# Vatrushka vNext: сверка ТЗ и roadmap

## Что изменилось относительно исходного MVP

Исходное ТЗ уже требовало подписанный выбор монитора/окна, системный звук демонстрации и выбор устройств записи/воспроизведения. Эти пункты доведены до рабочего UI: источники сгруппированы, безопасный системный звук включается автоматически, зритель отдельно меняет его громкость/mute через контекстное меню, а собственный вывод «Ватрушки» обязательно исключается из loopback capture.

Пароли, TOTP, текстовый чат, постоянные серверы/каналы и сложные роли были явно вынесены за границы MVP. В vNext они стали единственным постоянным контуром; быстрые комнаты, гостевой вход и passwordless-авторизация удалены в 0.4.0.

## Реализовано в vNext

- регистрация с scrypt-паролем и подтверждением email;
- вход с обязательным вторым фактором: email или TOTP;
- QR-настройка и отключение TOTP в клиенте;
- одноразовые recovery-коды, активные/доверенные устройства, отзыв сессий и журнал событий безопасности;
- platform owner/admin с отдельным визуальным статусом;
- постоянные серверы и приглашения;
- текстовые и голосовые каналы;
- история, создание и удаление сообщений;
- системные роли `@everyone`/`Владелец`, назначаемые роли и редактируемая иерархия;
- 40 server permissions с `ADMINISTRATOR`, защитой от повышения собственных привилегий и готовыми шаблонами ролей;
- channel-specific overrides для ролей и участников с состояниями inherit/allow/deny;
- audit log изменений каналов, ролей, назначений и участников;
- техническое ограничение `SPEAK`, `STREAM_SCREEN` и `STREAM_APPLICATION_AUDIO` отдельными LiveKit grants;
- транзакционные screen-share leases для голосовых каналов;
- локальные Manrope/Unbounded, анимации и новый server shell.
- NSIS auto-update через self-hosted generic feed с progress/restart UI.
- персональная Home-панель с быстрым возвратом, активными пространствами, недавней активностью, offline-кэшем, onboarding и фактической диагностикой выбранного микрофона.
- приватное S3-compatible хранилище вложений с backend permission checks, DB rollback-копией и идемпотентным backfill.
- публичное имя пользователя внутри сервера и viewer-scoped приватные псевдонимы других участников; приватный псевдоним применяется только в представлении назначившего его пользователя и не меняет профиль цели.

## Settings / mentions / presence feature pack

Phase 1 — repo audit и фиксация контрактов — завершена. Принятые решения находятся в [ADR](adr/README.md): общий SettingsShell и hash routes, rollout feature flags, развитие существующего `electron-updater`, structured mentions, presence/realtime и единая DND notification policy.

Phase 2 — общий `SettingsShell`, типизированные routes, staged feature flags, Storybook и Electron navigation tests — завершена. Старые модалки сохранены как production fallback до полного parity.

Phase 3 завершена вертикальными срезами без UI-заглушек. Routed user settings подключены к реальным API для профиля, avatar, уникального username, bio, presence/privacy, уведомлений, пароля/2FA/recovery, сессий, security activity, смены email, блокировок, экспорта и 14-дневной деактивации. Routed server settings функционально покрывают overview, appearance, members, roles/permissions, categories/channels, invites, moderation, audit и danger zone.

Messaging transport завершён: `@` autocomplete поддерживает пользователей, роли и `@everyone`; API хранит stable Unicode entities, проверяет membership/permissions и server moderation limit. Canonical PostgreSQL messages доставляются через transactional outbox → Redis Pub/Sub → authenticated WebSocket, а HTTP polling остаётся редким reconciliation после reconnect. Реализованы ЛС, read receipts, cursor history, optimistic retry, tombstones, notification center, DND/mute/quiet hours и durable S3 cleanup.

## Следующие итерации

### P0 — эксплуатационная готовность

1. Восстановление забытого пароля через отдельный ограниченный email-flow.
2. Code signing автообновляемого Windows-клиента и отдельные release channels stable/beta.
3. Подключение `/metrics` к Prometheus/Grafana и production alerts для outbox/Redis/WebSocket.
4. Нагрузочные тесты PostgreSQL, Redis, LiveKit и S3.

### P1 — полноценное сообщество

1. Приватные категории и drag-and-drop порядка каналов.
2. Временные/постоянные invite links, kick/ban list и заявки на вступление.
3. Поиск, закреплённые сообщения и треды.
4. Group DM UI (schema остаётся выключенной feature flag до отдельного UX-среза).
5. Антивирусная проверка S3-вложений и per-user/server storage quotas; lifecycle/garbage collection уже автоматизирован.

### P2 — медиа и платформы

1. Камеры, сетка участников и noise suppression уровня Krisp/RNNoise.
2. Запись встречи только с явным согласием участников и политикой хранения.
3. Web/mobile companion, push notifications и синхронизация настроек.
4. End-to-end encryption для приватных каналов после отдельного threat model.

## Осознанные ограничения текущей версии

- WebSocket является основным realtime-транспортом, но клиент намеренно сохраняет 30-секундный HTTP reconciliation;
- server settings имеют kick и ban list; заявки на вступление ещё не реализованы;
- installer пока не подписан; auto-update работает только в установленной NSIS-версии, а portable build обновляется вручную.

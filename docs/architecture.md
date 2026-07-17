# Architecture

## Границы доверия

Renderer считается недоверенным web-контекстом. У него нет Node.js, `ipcRenderer`, файловой системы, environment или server secrets. Preload предоставляет фиксированный типизированный allowlist для auth, capture, settings, notifications и updater. Main process валидирует sender frame и каждый входящий аргумент.

Fastify — единственный компонент, имеющий PostgreSQL, приватный S3, SMTP и LiveKit API credentials. Desktop получает access JWT и краткоживущий channel-scoped LiveKit token. Refresh token шифруется Electron `safeStorage` (DPAPI на Windows) до записи на диск. Вложения всегда проходят через авторизованные API endpoints; S3 credentials и внутренний `storage_key` не попадают в renderer и публичные контракты.

## Потоки

1. Registration/password → HMAC OTP или TOTP → user/session → access JWT + rotating opaque refresh.
2. Create/join server → membership → channels/roles/messages in PostgreSQL.
3. Connect voice channel → effective permissions → LiveKit room/token.
4. Voice/screen tracks идут напрямую между desktop и LiveKit, не через Fastify.
5. Screen claim → PostgreSQL transaction/row lock → capture picker → publication → heartbeat.
6. Подписанный LiveKit webhook освобождает lease после ухода participant или unpublish.
7. Permission aggregation = `@everyone` + назначенные роли + channel overwrites; персональные allow/deny применяются последними. Полный набор получают владелец сервера и роли с `ADMINISTRATOR`, а platform owner/admin остаются визуальным статусом и не обходят права сервера. `SPEAK`, `STREAM_SCREEN` и `STREAM_APPLICATION_AUDIO` транслируются в отдельные LiveKit grants.
8. Electron main проверяет generic update feed, загружает NSIS differential package и предлагает перезапуск; renderer видит только типизированное состояние прогресса.
9. Desktop опрашивает server detail и message notifications; API дополняет голосовые каналы фактическими LiveKit identities, поэтому membership и media presence не смешиваются.
10. `MOVE_MEMBERS` нативно переносит уже подключённую identity между LiveKit rooms и повторно применяет channel-scoped publish grants. Короткоживущая команда синхронизирует UI клиента, а для пользователя вне voice инициирует подключение с новым токеном.
11. Home запрашивает агрегат `GET /api/v1/home`: API объединяет членство, unread-счётчики, фактические LiveKit identities и значимую `user_activity`. TanStack Query сохраняет последний снимок локально, повторно проверяет его при возврате на Home и инвалидируется при изменении состава voice participants/серверов.
12. User/server settings используют hash routes внутри packaged `file://` renderer. `SettingsShell` загружается отдельным chunk и переиспользует `AppShell`; top-level media controller не размонтируется при переходе в настройки. До API parity новые входы контролируются независимыми build-time feature flags, а старые модалки остаются fallback.
13. Attachment upload → проверка auth/permissions/типа/размера → приватный S3 → metadata и rollback-копия в PostgreSQL. Download повторно проверяет права, предпочитает S3 и на expand-фазе использует DB fallback при временной ошибке хранилища.

## Консистентность

- Refresh rotation и reuse detection выполняются под row lock.
- Channel screen-share lease захватывается одной транзакцией и не допускает двух ведущих одновременно.
- Сервер, его каналы, роли и членство создаются одной транзакцией. Удаление канала каскадно удаляет сообщения, permission overwrites, dashboard activity этого канала и channel lease.
- Объект пишется до строки вложения; при ошибке DB API best-effort удаляет уже загруженный объект. Additive `storage_key` и временная dual-write схема позволяют откатить образ без потери старых и новых вложений.
- Системные роли `OWNER`/`EVERYONE` защищены от удаления, пользовательские роли ограничены иерархией, а административные изменения записываются в append-only audit log.

## Packages

`@vatrushka/shared` не зависит от Node API и безопасно используется backend/renderer. Здесь находятся validation, API errors, dashboard/server contracts, permissions, expiration и чистая lease logic. Исторические standalone rooms, guest sessions и их lease-модель удалены из текущей схемы и рабочих контрактов.

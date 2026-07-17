# Architecture

## Границы доверия

Renderer считается недоверенным web-контекстом. У него нет Node.js, `ipcRenderer`, файловой системы, environment или server secrets. Preload предоставляет ровно 12 типизированных операций. Main process валидирует sender frame и каждый аргумент Zod-схемой.

Fastify — единственный компонент, имеющий PostgreSQL, SMTP и LiveKit API credentials. Desktop получает access JWT и краткоживущий room-scoped LiveKit token. Refresh token шифруется Electron `safeStorage` (DPAPI на Windows) до записи на диск.

## Потоки

1. Registration/password → HMAC OTP или TOTP → user/session → access JWT + rotating opaque refresh.
2. Create/join quick room → room state check → LiveKit room/token.
3. Create/join server → membership → channels/roles/messages in PostgreSQL.
4. Voice/screen tracks идут напрямую между desktop и LiveKit, не через Fastify.
5. Screen claim → PostgreSQL transaction/row lock → capture picker → publication → heartbeat.
6. Подписанный LiveKit webhook освобождает lease после ухода participant или unpublish.
7. Permission aggregation = `@everyone` + назначенные роли + channel overwrites; персональные allow/deny применяются последними. Полный набор получают владелец сервера и роли с `ADMINISTRATOR`, а platform owner/admin остаются визуальным статусом и не обходят права сервера. `SPEAK`, `STREAM_SCREEN` и `STREAM_APPLICATION_AUDIO` транслируются в отдельные LiveKit grants.

## Консистентность

- LiveKit `maxParticipants=5` — окончательный барьер при конкурентных join; API делает раннюю понятную проверку.
- Код комнаты уникален в PostgreSQL, генератор повторяет попытку при конфликте.
- Refresh rotation и reuse detection выполняются под row lock.
- Lease блокирует room row и lease row в одной транзакции.
- Room close сначала фиксируется в БД, отзывает гостей/lease, затем удаляет LiveKit room.
- Сервер, его каналы, роли и членство создаются одной транзакцией. Удаление канала каскадно удаляет сообщения, permission overwrites и channel lease.
- Системные роли `OWNER`/`EVERYONE` защищены от удаления, пользовательские роли ограничены иерархией, а административные изменения записываются в append-only audit log.

## Packages

`@vatrushka/shared` не зависит от Node API и безопасно используется backend/renderer. Здесь находятся нормализация, validation, API errors, contracts, expiration и чистая lease logic.

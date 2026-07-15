# Architecture

## Границы доверия

Renderer считается недоверенным web-контекстом. У него нет Node.js, `ipcRenderer`, файловой системы, environment или server secrets. Preload предоставляет ровно 12 типизированных операций. Main process валидирует sender frame и каждый аргумент Zod-схемой.

Fastify — единственный компонент, имеющий PostgreSQL, SMTP и LiveKit API credentials. Desktop получает access JWT и краткоживущий room-scoped LiveKit token. Refresh token шифруется Electron `safeStorage` (DPAPI на Windows) до записи на диск.

## Потоки

1. Email → `request-code` → HMAC OTP в PostgreSQL → SMTP.
2. OTP → user/session → access JWT + rotating opaque refresh.
3. Create/join → room state check → LiveKit room/token.
4. Voice/screen tracks идут напрямую между desktop и LiveKit, не через Fastify.
5. Screen claim → PostgreSQL transaction/row lock → capture picker → publication → heartbeat.
6. Подписанный LiveKit webhook освобождает lease после ухода participant или unpublish.

## Консистентность

- LiveKit `maxParticipants=5` — окончательный барьер при конкурентных join; API делает раннюю понятную проверку.
- Код комнаты уникален в PostgreSQL, генератор повторяет попытку при конфликте.
- Refresh rotation и reuse detection выполняются под row lock.
- Lease блокирует room row и lease row в одной транзакции.
- Room close сначала фиксируется в БД, отзывает гостей/lease, затем удаляет LiveKit room.

## Packages

`@vatrushka/shared` не зависит от Node API и безопасно используется backend/renderer. Здесь находятся нормализация, validation, API errors, contracts, expiration и чистая lease logic.

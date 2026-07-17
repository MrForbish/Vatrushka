# ADR 0004: Redis как ephemeral presence-хранилище

- Статус: `accepted`
- Дата: `2026-07-17`
- Scope: presence/privacy vertical slice

## Контекст

Presence должен объединять несколько desktop-сессий пользователя, автоматически переводить истёкшие heartbeat в offline и одинаково работать при нескольких экземплярах API. PostgreSQL остаётся источником истины для выбранного статуса, custom status и privacy-настроек, но не подходит для частых ephemeral heartbeat. In-memory реализация пригодна только для тестов и локальной разработки: её состояние не разделяется между процессами и пропадает при рестарте API.

## Решение

Production использует непосредственно Redis 8 и официальный Node.js-клиент `redis`.

- Каждая сессия обновляет heartbeat раз в 20 секунд; TTL составляет 75 секунд.
- Активные сессии пользователя хранятся в sorted set, а их состояния — в hash. Истёкшие элементы удаляются при чтении/heartbeat.
- Наличие хотя бы одной активной сессии означает online; если все активные сессии idle, эффективный connectivity state — idle.
- Предпочтения `online`, `idle`, `do_not_disturb`, `invisible`, custom status и privacy сохраняются в PostgreSQL. Поэтому Redis работает без RDB/AOF и не входит в backup-контур.
- `invisible` всегда сериализуется для других пользователей как offline. Ошибка Redis также закрывается безопасно в offline и делает readiness probe незелёным.
- Redis публикуется только на `127.0.0.1:6379`, требует пароль и недоступен из интернета. API в host network подключается к loopback.
- `memory` adapter сохраняется для unit/integration tests и локальной разработки; production config запрещает его.

## Последствия

Presence переживает горизонтальное масштабирование API, но после рестарта Redis участники временно отображаются offline до следующего heartbeat (не более 20 секунд для активного клиента). Это ожидаемо: долговечное восстановление ephemeral connectivity дало бы более опасные ложные online-статусы. Отказ Redis не блокирует auth, сообщения или voice, но `/health/ready` сигнализирует деградацию для оператора.

## Проверки

- unit: multi-session aggregation, idle/online priority и TTL expiry;
- API integration: DND, invisible/offline, privacy и сохранение unread при подавленной доставке;
- Electron E2E: routed status/privacy settings и DND notification controls;
- production: Redis `PING`, `/health/ready` и повторный heartbeat после рестарта Redis.

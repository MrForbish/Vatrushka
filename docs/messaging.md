# Messaging, realtime и уведомления

## Источник истины

PostgreSQL хранит conversations, members, messages, attachments metadata, reactions, structured mentions, read state, internal notifications и transactional outbox. Redis не хранит историю: он используется только для Pub/Sub, presence/typing TTL, WebSocket registry, active conversation и event deduplication. Бинарные объекты находятся в приватном S3.

Серверный канал имеет canonical conversation с тем же UUID, что и `server_channels.id`. Direct conversation создаётся идемпотентно для пары пользователей. `clientMessageId` уникален для автора, поэтому повтор после сетевой ошибки возвращает уже созданное сообщение.

## HTTP API

Все маршруты ниже находятся под `/api/v1` и требуют bearer access token:

- `GET /conversations` и `GET /conversations/:id`;
- `GET /conversations/:id/messages?before=&after=&limit=` — cursor pagination без OFFSET;
- `POST /conversations/:id/messages`;
- `PATCH/DELETE /conversations/:id/messages/:messageId`;
- `PUT/DELETE /conversations/:id/messages/:messageId/reactions/:emoji`;
- `PUT /conversations/:id/read-state` и `GET /conversations/:id/read-states` для direct/group direct receipts;
- `GET /me/unread`;
- `GET/PUT /me/notification-preferences`;
- `GET/PUT /servers/:id/notification-preferences`;
- `GET/PUT /conversations/:id/notification-preferences`;
- `GET /notifications`, mark read, dismiss и mark-all-read;
- конечные точки для intent/финализации/скачивания/удаления вложений.

Старые channel/direct endpoints сохраняются на один совместимый релиз. Новый UI читает canonical contracts; ручных room/join-code маршрутов нет.

## WebSocket и reconnect

Desktop получает `url` и краткоживущий access token через авторизованный HTTP endpoint. Token не передаётся в query string: первый WebSocket command — `{ type: "auth", token, deviceId }`. После auth доступны subscribe/unsubscribe, typing, active conversation, delivery/read ACK и ping.

Outbox worker публикует committed события в Redis Pub/Sub с at-least-once семантикой. Каждый backend-инстанс получает событие и доставляет его локальным сокетам. Client дедуплицирует `event.id`; после reconnect всегда повторно загружает conversation/history/unread по HTTP, поэтому потеря Pub/Sub не означает потерю сообщения. Отозванная session закрывается не позднее следующего 30-секундного heartbeat.

## Чтение состояния

Direct message проходит состояния `sending → sent → delivered → read`; ошибка optimistic request даёт `failed` и retry с тем же `clientMessageId`. Delivered фиксируется после получения истории устройством адресата. Read отправляется только когда нужный диалог видим, окно сфокусировано и состояние сохраняется 500 мс. Курсоры обновляются монотонно и хранятся на пользователя, а не на устройство.

Для серверных каналов хранится только пользовательский cursor для unread; персональные delivery receipts для каждого участника не создаются. UI показывает separator и переход к первому непрочитанному, cursor pagination вверх сохраняет scroll position, удалённое сообщение остаётся tombstone.

## Решение по уведомлению

Перед Electron toast клиент и API учитывают access, автора, блокировку, активный conversation, mute, уровень `all/mentions/none`, подавление role/everyone, глобальные direct/mention switches, DND, quiet hours, возраст и dedupe события. Тихие часы задаются одним интервалом и на каждом устройстве считаются по его локальному времени — отдельный часовой пояс не хранится и не показывается. DND подавляет toast и звук, но не историю, internal notification и unread.

Закрытие окна оставляет приложение в tray. Native notification открывает серверный канал либо direct conversation; само нажатие не отмечает историю прочитанной до фактического показа.

## Наблюдаемость

`GET /metrics` отдаёт Prometheus text format без содержимого сообщений и персональных данных:

- `chat_messages_created_total`, `chat_message_create_duration_ms`, `chat_message_create_errors_total`;
- `chat_ws_connections_active`, `chat_ws_reconnects_total`, `chat_ws_delivery_latency_ms`;
- `chat_outbox_pending_total`, `chat_outbox_failed_total`, `chat_outbox_oldest_age_seconds`;
- `chat_notifications_created_total`, `chat_notifications_suppressed_total`;
- `chat_redis_publish_errors_total`, `chat_unread_recalculation_duration_ms`.

Outbox logs содержат только `eventId`, `backendInstanceId`, `durationMs`, `result` и технический error code. Текст ЛС не логируется.

## Команды проверки

```bash
npm run db:check
npm run typecheck
npm run lint
npm run test
npm run test:integration
npm run test:e2e
npm run build
```

Integration suite требует отдельные `INTEGRATION_DATABASE_URL` и `INTEGRATION_REDIS_URL`, очищает test schema и проверяет полный migration chain, idempotency, read state, notification preferences, outbox и Redis Pub/Sub.

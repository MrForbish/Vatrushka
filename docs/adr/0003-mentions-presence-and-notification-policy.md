# ADR 0003: Structured mentions, presence и notification policy

- Статус: `accepted`
- Дата: `2026-07-17`
- Область применения: пакет функций упоминаний/наличия, Фаза 1

## Контекст

Канальные сообщения сейчас содержат обычный `content`; structured mention entities отсутствуют. Новые сообщения и notification items обнаруживаются polling. UI имеет визуальные `online/idle/dnd/offline` primitives, но backend presence-модели и синхронизации между сессиями нет. Desktop sound/banner preferences локальны для устройства.

Нельзя определять mention повторным regex по готовому тексту. DND должен подавлять sound и desktop/push доставку серверным правилом, сохраняя unread/history. Invisible не должен раскрывать реальный online state другим пользователям.

## Решение: mentions

1. Create/update message contract получает `content` и массив entities `{ userId, start, length }`; offsets относятся к Unicode code points нормализованного content.
2. Backend валидирует границы, отсутствие пересечений, доступность пользователя в server/channel context и право автора отправлять сообщение.
3. Добавить additive `message_mentions` table с отдельной строкой на каждое вхождение. Разрешить повторное упоминание одного пользователя; индексировать `message_id`, `mentioned_user_id` и уникальную позицию внутри сообщения.
4. Message response возвращает entities с устойчивым `userId` и разрешённым display label. Rename меняет отображаемое имя, но не адресата. Удалённый/недоступный пользователь отображается безопасным fallback без превращения текста в новую mention.
5. Notification/unread создаётся один раз на пару message/recipient даже при повторных entities. Будущие `@role`/`@everyone` получают отдельный entity kind и не включаются текущим PR.

## Решение: presence

1. Хранить выбранный пользователем статус отдельно от session connectivity: `online`, `idle`, `dnd`, `invisible`; custom status — nullable text с отдельным validation/expiry.
2. Фактическая доступность вычисляется из активных сессий/heartbeat. Disconnect не перезаписывает выбранный статус.
3. Публичный resolver всегда преобразует `invisible` в `offline`. Собственный пользователь видит выбранный статус.
4. Автоматический idle является device signal и не заменяет вручную выбранные `dnd`/`invisible`.

Физическое хранение heartbeat реализовано решением [ADR 0004](0004-redis-presence-store.md): production использует Redis, а выбранный статус и privacy остаются в PostgreSQL.

## Решение: realtime и notification policy

1. Добавить общий типизированный event envelope в `@vatrushka/shared`: `presence.changed`, `custom-status.changed`, `mention.created`, `mention.read`, `server-settings.changed`, `role.changed`, `member-roles.changed`, `session.revoked`.
2. Так как data-realtime слоя сейчас нет, в соответствующем вертикальном этапе добавить один authenticated WebSocket gateway. Access token не передаётся в URL; аутентификация выполняется первым protocol message. LiveKit остаётся только media/presence источником для voice rooms и не используется как transport бизнес-событий.
3. Events адресно обновляют TanStack Query cache. Polling временно остаётся reconciliation/fallback и удаляется только после production stability.
4. Notification policy реализуется чистым resolver в `@vatrushka/shared`, используемым API и desktop. Входы: event type/criticality, selected presence, server/channel mute, account preferences, device preferences, foreground/current channel и quiet hours.
5. API обязательно применяет account DND/mute/criticality до постановки push/banner/sound delivery. Desktop может только дополнительно подавить доставку по локальным device/focus settings; он не может ослабить серверное решение.
6. При DND unread и notification history сохраняются. Security-critical события не исчезают и имеют отдельную политику без обычного message sound.

## Миграции и безопасность

- только additive tables/columns и backfill-safe defaults;
- message/channel permissions проверяются тем же backend resolver;
- presence visibility фильтруется до сериализации ответа/event;
- websocket subscriptions привязаны к user/session и повторно проверяют membership;
- content, custom status и event payload проходят Zod validation и size limits;
- audit events требуются для административных изменений, но не для обычного presence heartbeat.

## Проверки следующих этапов

- unit: entity offsets/serialization, repeated mentions, public presence resolver и полная notification-policy matrix;
- integration: inaccessible mention rejection, rename/delete behavior, DND suppression, invisible privacy и session disconnect;
- component: `@` autocomplete keyboard navigation, rendered mention, presence picker и notification settings;
- E2E на двух сессиях: mention delivery/read, status sync, DND без sound/banner при сохранённых unread и invisible как offline.

# Architecture Decision Records

ADR фиксируют принятые архитектурные решения до начала вертикальных feature-этапов. Статусы:

- `proposed` — решение обсуждается и не разрешает реализацию;
- `accepted` — решение принято и является ограничением для следующих PR;
- `superseded` — заменено более новым ADR со ссылкой на замену.

## Реестр

| ADR | Статус | Решение |
| --- | --- | --- |
| [0001](0001-settings-routing-and-feature-flags.md) | accepted | Settings routes, общий shell и rollout flags |
| [0002](0002-windows-update-strategy.md) | accepted | Фоновое Windows-обновление через существующий electron-updater |
| [0003](0003-mentions-presence-and-notification-policy.md) | accepted | Structured mentions, presence, realtime и единая notification policy |
| [0004](0004-redis-presence-store.md) | accepted | Redis для multi-session heartbeat и PostgreSQL для долговечных presence-настроек |
| [0005](0005-canonical-messaging-expand-migration.md) | accepted | Expand/backfill и безопасное последующее удаление legacy messaging |
| [0006](0006-livekit-confirmed-voice-presence.md) | accepted | LiveKit-confirmed voice presence, Redis projection и reconciliation |

# Дорожная карта Vatrushka

Обновлено: 20 июля 2026. Выпущенная версия: `0.8.0`.

## Готово

- Windows Electron client, password + email/TOTP/recovery 2FA, sessions и reset password.
- Серверы, каналы, роли/permissions, audit, короткие invite links и public catalog.
- Canonical messaging: attachments, images, reactions, mentions, read state, outbox и WebSocket reconciliation.
- Redis presence, LiveKit-confirmed voice presence, drag-and-drop и controlled reconnect move.
- Voice, реальные аудиоустройства Windows, screen share, screen audio, fullscreen и viewer volume.
- Private S3 media, self-hosted LiveKit/TURN, updater feed и one-click NSIS update.
- Prometheus, Grafana, Loki/S3, Alloy, Blackbox, Alertmanager и provisioned dashboards.

## P0 — эксплуатационная надёжность

1. **Delivery automation** — автоматический tag deploy API/Compose, monitoring и публикация клиента только после readiness. В работе в текущем MR.
2. **Monitoring baseline** — после DNS/TLS Grafana собрать 7 дней фактических данных, настроить receiver alerts и откалибровать пороги без скрытия сигналов.
3. **Media stability** — двухклиентский Windows прогон: voice, devices, screen-share restart, reconnect, смена сети и self-deafen.
4. **Code signing** — приобрести сертификат, включить signing и проверить SmartScreen/update path.

## P1 — качество продукта

1. Матрица Storybook/visual: wide, medium, narrow, 100/125/150% scaling, длинные русские строки, empty/loading/error/conflict states.
2. Canonical friendship model вместо контактов, выведенных из DM.
3. Search, pinned messages, threads, group DM, channel ordering и private categories.
4. Антивирусная проверка S3 uploads и storage quotas.

## P2 — расширение платформы

- камеры, grid view и noise suppression;
- мобильный/web companion и push;
- запись звонков только после отдельного consent/retention design;
- E2EE только после самостоятельного threat model.

## Ограничения, которые нельзя обходить

- не возвращать отдельные legacy rooms, ручной join-by-code или passwordless login;
- не хранить current voice presence в PostgreSQL;
- не передавать secrets в renderer или Git;
- не удалять legacy messaging schema до adoption telemetry, backup и отдельной expand/contract migration;
- не публиковать updater metadata до backend readiness.

# Vatrushka vNext: сверка ТЗ и roadmap

## Что изменилось относительно исходного MVP

Исходное ТЗ уже требовало подписанный выбор монитора/окна, системный звук демонстрации и выбор устройств записи/воспроизведения. Эти пункты доведены до рабочего UI: источники сгруппированы, звук включается автором до публикации, зритель отдельно меняет его громкость/mute, а собственный вывод «Ватрушки» исключается из loopback capture.

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

## Settings / mentions / presence feature pack

Phase 1 — repo audit и фиксация контрактов — завершена. Принятые решения находятся в [ADR](adr/README.md): общий SettingsShell и hash routes, rollout feature flags, развитие существующего `electron-updater`, structured mentions, presence/realtime и единая DND notification policy.

Phase 2 — общий `SettingsShell`, типизированные routes, staged feature flags, Storybook и Electron navigation tests — завершена. Старые модалки сохранены как production fallback до полного parity.

Phase 3 выполняется вертикальными срезами без подмены API: существующие уведомления, пароль/2FA, резервные коды, сессии, security activity, редактирование отображаемого имени и реальные локальные аудиоустройства перенесены в routed user settings. Presence и privacy также подключены к реальному API: Redis агрегирует multi-session heartbeat, PostgreSQL хранит пользовательские предпочтения, invisible закрывается в offline, а DND подавляет доставку без потери unread. Аватар/username/bio не имитируются до появления backend-контрактов.

## Следующие итерации

### P0 — эксплуатационная готовность

1. Восстановление забытого пароля через отдельный ограниченный email-flow.
2. Mention-счётчики и доставка событий через WebSocket без polling; локальные настройки push/звука уже реализованы.
3. Code signing автообновляемого Windows-клиента и отдельные release channels stable/beta.
4. Нагрузочные тесты PostgreSQL/LiveKit и метрики Prometheus/Grafana.

### P1 — полноценное сообщество

1. Приватные категории и drag-and-drop порядка каналов.
2. Временные/постоянные invite links, kick/ban list и заявки на вступление.
3. Поиск, закреплённые сообщения, треды и массовые упоминания.
4. Presence/typing через WebSocket вместо трёхсекундного polling.
5. Антивирусная проверка S3-вложений, квоты и lifecycle/garbage collection.

### P2 — медиа и платформы

1. Камеры, сетка участников и noise suppression уровня Krisp/RNNoise.
2. Запись встречи только с явным согласием участников и политикой хранения.
3. Web/mobile companion, push notifications и синхронизация настроек.
4. End-to-end encryption для приватных каналов после отдельного threat model.

## Осознанные ограничения текущей версии

- сообщения обновляются polling каждые три секунды;
- есть kick участника, но ещё нет ban list;
- installer пока не подписан; auto-update работает только в установленной NSIS-версии, а portable build обновляется вручную.

# Матрица тестового покрытия

Матрица связывает продуктовые риски с минимальным обязательным уровнем проверки. Она не заменяет ручную release-матрицу для реального LiveKit, Windows loopback, SMTP и обновления установленного клиента.

## Риски и quality gates

| Область | Главный риск | Unit/component | API + PostgreSQL/Redis | Storybook/a11y | Electron E2E | Visual | Ручной release gate |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Auth, reset и 2FA | обход второго фактора, enumeration, утечка refresh token, неотозванная сессия | да | да, atomic reset | да | да | login/reset | SMTP/TOTP/recovery/reset на двух установках |
| Серверы, роли и permissions | действие без права, stale update, рассинхронизация клиентов | да | да | да | серверный flow | shell/settings | два клиента и denied/allowed matrix |
| Presence и уведомления | устаревший статус, нарушение DND/privacy, дубликаты | да | да, настоящий Redis | да | частично | settings/notification | native notifications и reconnect |
| Messaging | дубликаты, потеря read state, неверные mentions/attachments | да | да, outbox + S3 contracts | да | базовый flow | message states | два клиента, S3 и reconnect |
| Voice | неверное устройство, зависшее подключение, неснятые tracks | да | lease/webhook | да | permission/devices | voice shell | реальный LiveKit и два Windows ПК |
| Screen share/audio | повторный publish, плохой профиль, дублирование голосов | да | lease | да | lifecycle smoke | picker/viewer | window/monitor, loopback и reconnect |
| Updater | ложное уведомление, dev URL, поломанный upgrade | да | feed contract | да | shell state | ready state | clean install + две предыдущие версии |
| Release и migrations | destructive migration, неверная ветка/версия, mutable artifact | policy tests | полный migration chain | нет | installer в RC | нет | staging feed и rollback drill |

## Viewport contract

| Режим | Размер | Автоматическая проверка | Ожидаемое поведение |
| --- | ---: | --- | --- |
| широкий desktop | 1600×1000 | Home snapshot | профиль справа, основной контент без clipping |
| полный App Shell | 1440×900 | основной shell/settings/voice/messaging набор | участники справа, ширина контента не меньше 620 px |
| поддерживаемый desktop | 1280×720 | `app-shell-1280` | участники переходят в drawer, основные действия доступны |
| компактный | 1100×760 | `app-shell-compact`, Home profile drawer | серверы/профиль открываются поверх контента |
| минимальный | 1024×680 | `app-shell-minimum` | workspace library открывается drawer, элементы не перекрываются |

Windows scaling 100/125/150% остаётся ручным release gate: Chromium viewport не воспроизводит системный DPI, нативные меню Electron и реальные размеры установленного окна достаточно точно.

## Правила изменения тестов

1. Удаление сценария допускается только после фиксации дублирующего покрытия и оставшегося risk owner в этой матрице.
2. Visual snapshot проверяет композицию; поведение и доступность должны иметь interaction/component test.
3. PostgreSQL/Redis integration использует только изолированные CI services и отдельную локальную test database.
4. Диагностические traces, screenshots и reports сохраняются только при ошибке.
5. Рост времени контролируется step budgets; повышать бюджет можно только вместе с объяснением причины в PR.

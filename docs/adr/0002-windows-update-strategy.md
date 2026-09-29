# ADR 0002: Фоновое обновление Windows

- Статус: `accepted`
- Дата: `2026-07-17`
- Объем: пакет функций updater, Фаза 1

## Контекст

Установленная NSIS-версия уже использует `electron-updater` 6.x, generic feed `https://api.myvatrushka.ru/updates`, typed preload IPC и renderer progress UI. Main process автоматически проверяет feed, скачивает update и вызывает `quitAndInstall`. Portable build намеренно не обновляется автоматически.

Текущий NSIS — assisted installer (`oneClick: false`, `perMachine: false`), code signing отсутствует, `autoDownload` и `autoInstallOnAppQuit` включены. Main process не знает об активном LiveKit-звонке и dirty forms. Это не удовлетворяет требованиям тихой установки и защиты активной работы.

## Решение

1. Сохранить `electron-updater`, NSIS target и generic feed. Не внедрять второй updater и не запускать installer через shell/openExternal.
2. Main process остаётся владельцем updater lifecycle. Renderer получает только типизированное состояние и команды через allowlisted preload IPC.
3. State machine публикует `checking`, `available`, `downloading`, `ready`, `up-to-date`, `error` и `unsupported`; повторные события не создают второй download/install job.
4. `autoDownload` включён: найденное обязательное обновление сразу загружается в фоне с реальным progress event. Плашку нельзя закрыть на стадиях download/ready.
5. Renderer блокирует команду установки при активном LiveKit-звонке. Update остаётся `ready` и ждёт явного нажатия после выхода из канала либо следующего штатного запуска.
6. Тихая установка выполняется только через `quitAndInstall(true, true)` после `update-downloaded`; обработать `before-quit-for-update` и идемпотентное завершение приложения.
7. В updater-этапе изменить NSIS на `oneClick: true`, сохранив `perMachine: false`, install scope и текущий app identity. Перед production rollout проверить upgrade с последней опубликованной assisted NSIS-версии.
8. Feed публикуется атомарно: installer и blockmap раньше `latest.yml`. Логи содержат version/state/error class, но не URL с credentials, session identifiers или пользовательские данные.
9. Проверка начинается сразу, ограничена 30 секундами и повторяется через минуту после ошибки; далее сохраняется периодическая проверка. Отсутствие code-signing сертификата не блокирует разработку и staging, но остаётся release risk и должно быть явно показано перед публичным rollout.

## Последствия

- существующий feed и release tooling переиспользуются;
- portable build остаётся manual-update вариантом;
- смена assisted → one-click тестируется как upgrade chain, а не считается безопасной автоматически;
- активный звонок и несохранённые формы больше не могут быть прерваны скрытым restart;
- цифровая подпись остаётся отдельной эксплуатационной задачей, а не замалчивается.

## Обязательные проверки updater-этапа

- тесты состояний/гонки юнита;
- IPC validation и sender allowlist tests;
- component stories для всех состояний, retry и call blocker;
- Electron E2E с fake updater events;
- ручной Windows upgrade: предыдущий NSIS → staging build, background download, silent restart, сохранённая сессия и настройки;
- отдельная проверка во время активного LiveKit-звонка.

## Статус реализации на 2026-07-18

Реализован обязательный one-click контур без ожидания code-signing сертификата: `oneClick: true`, `autoDownload: true`, `autoInstallOnAppQuit: true`, установка вызывается через `quitAndInstall(true, true)`. Проверка начинается сразу, имеет timeout и retry; готовое обязательное обновление нельзя скрыть. Renderer блокирует restart во время активного LiveKit-звонка. Upgrade с последней assisted-версии остаётся обязательной ручной release-проверкой, а отсутствие подписи принято владельцем продукта как временный SmartScreen risk.

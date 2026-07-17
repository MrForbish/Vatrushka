# ADR 0002: Фоновое обновление Windows

- Статус: `accepted`
- Дата: `2026-07-17`
- Scope: updater feature pack, Phase 1

## Контекст

Установленная NSIS-версия уже использует `electron-updater` 6.x, generic feed `https://api.myvatrushka.ru/updates`, typed preload IPC и renderer progress UI. Main process автоматически проверяет feed, скачивает update и вызывает `quitAndInstall`. Portable build намеренно не обновляется автоматически.

Текущий NSIS — assisted installer (`oneClick: false`, `perMachine: false`), code signing отсутствует, `autoDownload` и `autoInstallOnAppQuit` включены. Main process не знает об активном LiveKit-звонке и dirty forms. Это не удовлетворяет требованиям тихой установки и защиты активной работы.

## Решение

1. Сохранить `electron-updater`, NSIS target и generic feed. Не внедрять второй updater и не запускать installer через shell/openExternal.
2. Main process остаётся владельцем updater lifecycle. Renderer получает только типизированное состояние и команды через allowlisted preload IPC.
3. Расширить state machine состояниями `available`, `downloading`, `downloaded`, `waiting-for-call-end`, `installing`, `error`; повторная команда не создаёт второй download/install job.
4. Переключить `autoDownload` на `false`: скачивание начинается после явного действия пользователя и идёт в фоне с реальным progress event.
5. Перед установкой renderer передаёт main только runtime blockers (`activeVoiceCall`, `dirtySettings`). Main повторно проверяет state и принимает окончательное решение. При активном звонке update остаётся downloaded и ждёт выхода либо следующего штатного запуска.
6. Тихая установка выполняется только через `quitAndInstall(true, true)` после `update-downloaded`; обработать `before-quit-for-update` и идемпотентное завершение приложения.
7. В updater-этапе изменить NSIS на `oneClick: true`, сохранив `perMachine: false`, install scope и текущий app identity. Перед production rollout проверить upgrade с последней опубликованной assisted NSIS-версии.
8. Feed публикуется атомарно: installer и blockmap раньше `latest.yml`. Логи содержат version/state/error class, но не URL с credentials, session identifiers или пользовательские данные.
9. `silentWindowsUpdates` остаётся выключенным в production до успешной staging-матрицы на реальной установленной Windows-версии. Отсутствие code-signing сертификата не блокирует разработку и staging, но остаётся release risk и должно быть явно показано перед публичным rollout.

## Последствия

- существующий feed и release tooling переиспользуются;
- portable build остаётся manual-update вариантом;
- смена assisted → one-click тестируется как upgrade chain, а не считается безопасной автоматически;
- активный звонок и несохранённые формы больше не могут быть прерваны скрытым restart;
- цифровая подпись остаётся отдельной эксплуатационной задачей, а не замалчивается.

## Обязательные проверки updater-этапа

- unit state-machine/race tests;
- IPC validation и sender allowlist tests;
- component stories для всех состояний, retry и call blocker;
- Electron E2E с fake updater events;
- ручной Windows upgrade: предыдущий NSIS → staging build, background download, silent restart, сохранённая сессия и настройки;
- отдельная проверка во время активного LiveKit-звонка.

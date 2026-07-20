# Документация Vatrushka

Канонические документы проекта находятся только в `docs/`. Внешние макеты и исходные ТЗ не являются частью runtime, CI или release-процесса.

## Основные документы

- [Бизнес-спецификация](product-specification.md) — пользовательские сценарии и границы продукта.
- [Техническая спецификация](technical-specification.md) — компоненты, данные, безопасность и интеграции.
- [Roadmap](vnext-roadmap.md) — готовое, риски и приоритеты следующих работ.
- [Delivery и релизы](release-process.md) — ветки, Merge Request, tag и автоматический production deploy.
- [Развёртывание](deployment.md) — topology, переменные окружения и аварийная диагностика.
- [Observability](observability.md) и [runbook](observability-runbook.md) — Grafana, Prometheus, Loki, alerting и восстановление.

## Спецификации по областям

| Область | Документ |
| --- | --- |
| Аутентификация и сессии | [auth.md](auth.md) |
| Главная и Home | [home.md](home.md) |
| Сообщения и realtime | [messaging.md](messaging.md) |
| Voice и screen share | [media.md](media.md) |
| S3-вложения | [object-storage.md](object-storage.md) |
| Безопасность | [security.md](security.md) |
| Тестирование | [testing.md](testing.md), [test-coverage-matrix.md](test-coverage-matrix.md) |
| Производительность | [performance.md](performance.md), [capacity-testing.md](capacity-testing.md) |
| Self-hosted LiveKit | [self-hosted-livekit.md](self-hosted-livekit.md) |
| ADR | [adr/README.md](adr/README.md) |
| История выпусков | [releases](releases), [CHANGELOG](../CHANGELOG.md) |

## Приоритет источников

1. Фактическое production-состояние, безопасность данных и ограничения инфраструктуры.
2. Бизнес- и техническая спецификации.
3. Принятые ADR, runbook и release process.
4. Roadmap.
5. Исторические release notes.

Изменение поведения считается завершённым только вместе с тестами и обновлением соответствующего канонического документа. Секреты, private keys, production `.env`, installers и reference assets в репозиторий не добавляются.

# Документация Vatrushka

Эта директория — каноническая документация проекта. Исходные макеты и большие prompt/spec-файлы используются как входные требования, но не описывают состояние production сами по себе.

## С чего начать

- [Бизнес-спецификация](product-specification.md) — продукт, пользовательские сценарии, функциональные границы и критерии качества.
- [Техническая спецификация](technical-specification.md) — архитектура, данные, безопасность, realtime, медиа, поставка и ограничения совместимости.
- [Roadmap](vnext-roadmap.md) — что готово, что требует улучшения и в каком порядке выполняется дальнейшая работа.

## Поддерживающие документы

| Область | Документ |
|---|---|
| Архитектура | [architecture.md](architecture.md) |
| Аутентификация | [auth.md](auth.md) |
| Home | [home.md](home.md) |
| Messaging и realtime | [messaging.md](messaging.md) |
| Voice и screen share | [media.md](media.md) |
| Приватное S3-хранилище | [object-storage.md](object-storage.md) |
| Безопасность | [security.md](security.md) |
| Развертывание | [deployment.md](deployment.md) |
| Self-hosted LiveKit | [self-hosted-livekit.md](self-hosted-livekit.md) |
| Тестирование | [testing.md](testing.md) |
| Производительность | [performance.md](performance.md) |
| Архитектурные решения | [adr/README.md](adr/README.md) |
| Инвентаризация кода и данных | [code-inventory.md](code-inventory.md) |
| Git branching и релизы | [release-process.md](release-process.md) |
| История релизов | [releases](releases) и корневой `CHANGELOG.md` |

## Иерархия источников

При расхождении документов приоритет имеют:

1. безопасность данных и фактические ограничения production;
2. эта каноническая бизнес- и техническая спецификация;
3. принятые ADR;
4. актуальные runbook развертывания и тестирования;
5. feature-spec и макеты;
6. исторические release notes.

Изменение поведения считается завершенным только после одновременного обновления кода, тестов и соответствующего канонического документа. Секреты, реальные пароли и private keys в документацию не добавляются.

# Git branching и выпуск Vatrushka

Статус: канонический процесс разработки и поставки. До завершения перехода из раздела «Миграция текущего репозитория» действуют явно отмеченные временные исключения.

## 1. Текущее состояние и найденные разрывы

На 18 июля 2026 года production-ветка называется `master` и является default branch. В репозитории появился `develop`, созданный от того же production commit, но protection и специализированные workflow еще не включены. Единственный `.github/workflows/ci.yml` запускает lint, typecheck, unit, PostgreSQL/Redis integration, Storybook, Electron E2E, visual regression и Windows package для любого PR. Он не различает обычную разработку, RC и production publish.

Package manager — npm с корневым `package-lock.json` и workspaces. Версия `0.6.1` повторяется в корневом, API, desktop, config и shared `package.json`; автоматической проверки согласованности пока нет. Конфигурация electron-builder находится в `apps/desktop/package.json`. NSIS, portable, blockmap и `latest.yml` собираются CI, но production generic feed публикуется вручную: installer и blockmap копируются раньше `latest.yml`. Git tags, GitHub Releases, repository Actions secrets, PR templates и CODEOWNERS на момент аудита отсутствовали.

Это переходное состояние нельзя считать выполнением целевой release policy.

## 2. Целевая модель веток

```text
feat|fix|chore|refactor|test|docs ──squash──> develop
                                                     │ immutable snapshot
                                                     v
                                           assemble/<version>
                                                     │ assembly PR, merge commit
                                                     v
main ─────────────────────────────────────> release/<version>
                                                     │ release fixes only
                                                     │ release PR, merge commit
                                                     v
                                                   main ──tag vX.Y.Z──> production
                                                     │
                                                     └──[SYNC] merge commit──> develop

main ──> hotfix/<version>-<description> ──merge commit──> main ──tag──> production
```

Постоянные ветки:

- `main` — только выпущенное production-состояние;
- `develop` — интеграция следующего релиза.

Временные ветки:

- `feat/<ticket>-<description>`;
- `fix/<ticket>-<description>`;
- `chore/<description>`;
- `refactor/<description>`;
- `test/<description>`;
- `docs/<description>`;
- `assemble/<version>`;
- `release/<version>`;
- `release-fix/<version>-<description>`;
- `hotfix/<version>-<description>`.

Обычная задача начинается только от актуального `develop` и удаляется после squash merge. Незавершенное поведение допускается в `develop` только под безопасным feature flag.

## 3. Разрешенные направления PR

| Source | Target | Merge |
|---|---|---|
| `feat/*`, `fix/*`, `chore/*`, `refactor/*`, `test/*`, `docs/*` | `develop` | squash |
| `assemble/<version>` | `release/<version>` | merge commit |
| `release-fix/<version>-*` | `release/<version>` | squash |
| `release/<version>` | `main` | merge commit |
| `hotfix/<version>-*` | `main` | merge commit |
| `main` | `develop` | merge commit |
| `main` | активная `release/*` | merge commit |

Направления `develop → main`, task-ветка → `main`, task-ветка → `release/*`, `assemble/* → main`, `hotfix/* → develop` и `release/* → develop` до production запрещены. Workflow должен отклонять их понятным сообщением.

## 4. Обычная разработка

```bash
git switch develop
git pull --ff-only
git switch -c fix/WEB-0000-short-description
```

PR должен объяснять цель, изменения, проверку, риски, миграции, flags и breaking changes. Для UI прикладываются screenshots целевых viewport. Runtime, generated artifacts, локальный reference-pack и secrets в один commit не смешиваются.

## 5. Сборка release candidate

Для версии `X.Y.Z`:

1. Зафиксировать конкретный commit актуального `develop`.
2. Создать `assemble/X.Y.Z` от этого commit и больше не добавлять в snapshot feature commits.
3. Создать `release/X.Y.Z` от актуального `main`.
4. Открыть draft PR `[ASSEMBLE] Vatrushka vX.Y.Z`: `assemble/X.Y.Z → release/X.Y.Z`.
5. Проверить full CI, migration/upgrade/rollback metadata и получить RC installer.
6. Merge assembly PR только merge commit.

RC artifacts именуются `Vatrushka-X.Y.Z-rc.<run-number>-<short-sha>.exe` и не попадают в stable update feed. Вместе с installer сохраняются checksums, Playwright report, migration report и machine-readable metadata.

После assembly merge действует freeze. Разрешены только blockers, critical/high bugs, security, migrations, updater/installer, changelog и version metadata. Исправление идет отдельным squash PR `release-fix/X.Y.Z-* → release/X.Y.Z`; каждый merge создает новый RC.

## 6. Production release

После QA открывается `[RELEASE] Vatrushka vX.Y.Z`: `release/X.Y.Z → main`. PR проверяет финальный RC, full CI, clean install, upgrade, migrations, rollback, release notes и отсутствие dev URLs/debug flags. Сам merge ничего не публикует.

После merge создается annotated tag:

```bash
git switch main
git pull --ff-only
git tag -a vX.Y.Z -m "Vatrushka vX.Y.Z"
git push origin vX.Y.Z
```

Только tag workflow получает production secrets, повторяет full CI, собирает production NSIS/portable, проверяет checksum, создает GitHub Release и публикует stable feed атомарно: setup/blockmap сначала, `latest.yml` последним. До появления code-signing сертификата workflow должен явно фиксировать принятый риск SmartScreen, но updater не отключается.

После успешной публикации открывается `[SYNC] vX.Y.Z back to develop`: `main → develop`. Release-ветка удаляется только после production tag, успешной публикации и sync.

## 7. Hotfix

Hotfix создается от `main`, не от `develop`:

```bash
git switch main
git pull --ff-only
git switch -c hotfix/X.Y.Z-description
```

После merge commit в `main` создается production tag. Затем обязательны `main → develop` и, если существует следующий release candidate, `main → release/<next-version>`.

## 8. Rollback и неуспешные workflow

- Неуспешный task PR исправляется в той же ветке; защищенные ветки не переписываются.
- Неуспешный RC не публикуется. Исправление идет через `release-fix/*`, старые artifacts сохраняются для диагностики.
- Если tag workflow упал до изменения feed, повторно запускается тот же workflow для того же immutable tag после исправления инфраструктуры.
- Если опубликованный client дефектен, выпускается новый patch hotfix; существующий tag и GitHub Release не перезаписываются.
- Server rollback использует предыдущий application commit/image и обязательный backup. Down migration выполняется только при наличии отдельно проверенного плана; additive schema обычно остается.
- Stable feed переключается только на полностью загруженный artifact. При аварии возвращается предыдущий проверенный `latest.yml`, но опубликованные файлы не удаляются до завершения расследования.

## 9. GitHub Actions

Целевые workflow без дублирования общих steps:

- `pr-policy.yml` — branch names, направления PR, title prefixes и совпадение версий;
- `pr-checks.yml` — обычный CI для PR в `develop`, без production secrets;
- `release-candidate.yml` — full CI, migrations, upgrade, Electron RC и metadata для `release/*`;
- `release-pr.yml` — policy/full evidence для `release/*|hotfix/* → main`, publication выключена;
- `production-release.yml` — только annotated SemVer tag в `main`, production environment и publish;
- `sync-check.yml` — `[SYNC] main → develop` и наличие production tag.

Release workflow использует `concurrency: release-<version>` и `cancel-in-progress: false`. Jobs получают минимальные GitHub token permissions. PR-код, включая forks, никогда не выполняется вместе с signing/deploy secrets.

## 10. Версия и release metadata

SemVer `MAJOR.MINOR.PATCH` является единственным форматом production. До централизации источником считается корневой `package.json`, а `version:check` обязан сверять остальные workspaces, internal dependency versions, Electron artifact name, release branch/tag и changelog. API OpenAPI version также должна получать product version, а не отдельную константу.

RC metadata содержит version, commit SHA, base production tag, build number, `channel: rc`, timestamp и workflow run id. Production metadata содержит version, commit SHA, tag, `channel: stable`, timestamp и workflow run id.

## 11. Ожидаемые secrets и variables

На момент аудита repository Actions secrets отсутствуют. Перед автоматической production publication понадобятся имена без хранения значений в Git:

- `WINDOWS_CSC_LINK`, `WINDOWS_CSC_KEY_PASSWORD` — когда будет получен code-signing certificate;
- `PRODUCTION_SSH_PRIVATE_KEY`, `PRODUCTION_SSH_HOST_KEY`, `PRODUCTION_SSH_HOST`, `PRODUCTION_SSH_USER` — ограниченный deploy/update-feed доступ;
- при отказе от SSH в пользу S3/update CDN — отдельные scoped access key/secret и endpoint/bucket variables.

`GITHUB_TOKEN` предоставляет GitHub Actions. Public API/update URLs, channel и artifact directory являются environment variables, не secrets. Production environment рекомендуется защитить manual approval. Значения secrets в logs и artifacts запрещены.

## 12. Ручная настройка GitHub

До включения protection необходимо убедиться, что новые workflow уже успешно прошли хотя бы один PR, иначе required checks могут заблокировать репозиторий.

Для `main`:

- PR обязателен, direct/force push и deletion запрещены;
- минимум один approval, dismiss stale approvals, resolved conversations;
- branch up to date и required release checks;
- CODEOWNERS review для release/infrastructure;
- допустимые источники контролирует `pr-policy`.

Для `develop`:

- PR обязателен, direct/force push запрещены;
- минимум один approval, resolved conversations, up-to-date и required ordinary checks;
- squash является обычной стратегией.

Для `release/*`:

- direct/force push запрещены;
- PR, full CI, Electron package и release-policy обязательны;
- источники только `assemble/*`, `release-fix/*` и `main`.

Администраторские bypass должны быть минимальны и использоваться только для восстановления. Изменять default branch, удалять `master` или включать блокирующие protection rules до готовности workflow нельзя.

## 13. Миграция текущего репозитория

1. `develop` создан как точная копия production `master`; незавершенные task PR переводятся в него.
2. Добавить этот документ, PR templates, CODEOWNERS и policy tests отдельными PR в `develop`.
3. Разделить универсальный CI на обычные и release workflow, сохранив существующее покрытие.
4. Добавить `version:check`, `release:validate` и безопасный `release:prepare --dry-run`.
5. Получить первый зеленый workflow run, затем применить protection к `develop`.
6. Создать `main` от текущего `master`, обновить GitHub default branch и deployment references контролируемым cutover.
7. Только после проверки ссылок/CI/prod удалить или заархивировать `master` и включить protection `main`.
8. Следующий feature release собрать через `assemble/* → release/*`, tag и `[SYNC]`.

Текущий `master` остается production веткой до шага 6. Это единственное временное исключение; новые ordinary changes уже направляются в `develop`.

## 14. Локальная проверка

Текущий набор команд:

```bash
npm ci
npm run lint
npm run typecheck
npm run test
npm run test:integration
npm run db:check
npm run build
npm run test:storybook
npm run test:e2e
npm run test:visual
npm run package:win
```

Infrastructure PR дополнительно проверяет YAML, policy test cases, artifact naming, version consistency и dry-run release preparation. Реальные SMTP, LiveKit/TURN, Windows devices, upgrade и updater проверяются release matrix, а не заменяются unit tests.

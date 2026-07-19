# Git branching и выпуск Vatrushka в GitLab

Статус: канонический процесс разработки и поставки. С 19 июля 2026 года GitLab-проект `vatrushka-group/Vatrushka` является источником Git, Merge Requests, CI/CD, artifacts и Releases. GitHub хранится только как исторический read-only remote и не участвует в поставке.

## Ветки и направления Merge Request

Постоянные ветки:

- `main` — только выпущенное production-состояние;
- `develop` — интеграция следующего релиза и default branch.

Временные ветки:

- `feat/<ticket>-<description>` и `fix/<ticket>-<description>`;
- `chore/<description>`, `refactor/<description>`, `test/<description>`, `docs/<description>`;
- `assemble/<version>`, `release/<version>`, `release-fix/<version>-<description>`;
- `hotfix/<version>-<description>`.

| Source | Target | Merge |
|---|---|---|
| task branches | `develop` | squash |
| `assemble/X.Y.Z` | `release/X.Y.Z` | merge commit |
| `release-fix/X.Y.Z-*` | `release/X.Y.Z` | squash |
| `release/X.Y.Z` | `main` | merge commit |
| `hotfix/X.Y.Z-*` | `main` | merge commit |
| `main` | `develop` или активная `release/*` | merge commit |

Прямые `develop → main`, task → `main`, task → `release/*`, `hotfix/* → develop` и `release/* → develop` запрещены. Job `merge-request-policy` проверяет направление, имя ветки, версию и обязательный prefix заголовка MR.

## Обычная разработка

```bash
git switch develop
git pull --ff-only origin develop
git switch -c fix/WEB-0000-short-description
```

MR направляется в `develop`, использует шаблон `feature` и включает цель, изменения, проверку, риски, rollback и миграции. Generated artifacts, reference pack и secrets не коммитятся. После зелёного pipeline task MR выполняется squash merge с удалением source-ветки.

## GitLab pipeline

Единый `.gitlab-ci.yml` создаёт pipeline для Merge Request, `develop`, `release/*` и SemVer tags. Push task-ветки с открытым MR не создаёт дублирующий branch pipeline.

Quality gate выполняет параллельно:

- `merge-request-policy` — направление и naming MR;
- `verify` — policy/version, lint, typecheck, unit/API/renderer, schema, build и performance budgets;
- `integration` — настоящие PostgreSQL 17 и Redis 8 в изолированных CI services;
- `desktop-behavior` — Storybook interaction и Electron E2E на self-managed Windows runner;
- `visual-regression` — статический Storybook visual suite на self-managed Windows runner.

Linux jobs используют project runner с тегом `vatrushka-linux` и Node 24 container. Docker Hub images загружаются через GitLab Dependency Proxy, чтобы не зависеть от публичных rate limits. Windows jobs используют project runner `vatrushka-windows`; Playwright хранится в project-relative cache. Оба runner принадлежат инфраструктуре Vatrushka, поэтому не расходуют квоту GitLab-hosted compute. Диагностические artifacts сохраняются только при падении, release artifacts имеют отдельный retention.

## Release candidate

Для версии `X.Y.Z`:

1. Зафиксировать commit `develop`.
2. Создать `assemble/X.Y.Z` от него.
3. Создать `release/X.Y.Z` от актуального `main`.
4. Открыть draft MR `[ASSEMBLE] Vatrushka vX.Y.Z`: `assemble/X.Y.Z → release/X.Y.Z` без squash.
5. Дождаться full quality, migration report, database upgrade и Windows RC package.
6. Выполнить merge commit.

RC artifact называется `Vatrushka-X.Y.Z-rc.<pipeline-iid>-<short-sha>.exe` и не публикуется в stable feed. После assembly merge действует freeze; исправления идут только через squash MR `release-fix/X.Y.Z-* → release/X.Y.Z`.

## Production release

После QA открывается `[RELEASE] Vatrushka vX.Y.Z`: `release/X.Y.Z → main` без squash. MR обязан содержать release evidence и rollback. Публикация из MR невозможна.

После merge создаётся annotated tag:

```bash
git switch main
git pull --ff-only origin main
git tag -a vX.Y.Z -m "Vatrushka vX.Y.Z"
git push origin vX.Y.Z
```

Только защищённый SemVer tag запускает production pipeline. Pipeline повторяет quality gate, проверяет принадлежность commit ветке `main`, собирает Windows artifacts, атомарно обновляет VPS feed (`setup`/`blockmap` раньше `latest.yml`) и создаёт GitLab Release с immutable assets в Generic Package Registry. До слияния любого MR в `main` job `release-auth-smoke` проверяет доступ к Releases API встроенным CI job token, чтобы ошибка авторизации не обнаруживалась только после создания тега. После успешного выпуска выполняется `[SYNC] main → develop` merge commit без squash.

## Hotfix

Hotfix создаётся только от `main`:

```bash
git switch main
git pull --ff-only origin main
git switch -c hotfix/X.Y.Z-description
```

После merge commit создаются tag и production pipeline, затем обязательны sync `main → develop` и, при наличии, `main → release/<next-version>`.

## Protected branches и merge settings

GitLab project settings:

- default branch: `develop`;
- merge method: merge commit;
- squash: включён по умолчанию, но выключается для assembly/release/hotfix/sync MR;
- successful pipeline и resolved discussions обязательны;
- source branch удаляется после merge;
- `main`, `develop`, `release/*`: force push и direct push запрещены, merge разрешён Maintainer/Owner;
- tags `v*`: создание только Maintainer/Owner.

В одиночном проекте обязательный independent approval не включается: автор и единственный Owner совпадают. Контроль обеспечивают protected branches, policy job и зелёный pipeline. При появлении второго Maintainer следует включить минимум одно approval и сброс approvals после новых commits.

## CI/CD variables

Обычные переменные:

- `PRODUCTION_BRANCH=main`;
- `PRODUCTION_API_BASE_URL=https://api.myvatrushka.ru`;
- `PRODUCTION_UPDATE_FEED=https://api.myvatrushka.ru/updates`;
- `PRODUCTION_UPDATE_PATH` — абсолютный allowlisted путь feed на VPS;
- `WINDOWS_CSC_ENABLED=false` до появления сертификата.

Protected variables только для production tags:

- `PRODUCTION_SSH_HOST`, `PRODUCTION_SSH_USER`;
- `PRODUCTION_SSH_PRIVATE_KEY` — file variable;
- `PRODUCTION_SSH_HOST_KEY` — file variable;
- `WINDOWS_CSC_LINK`, `WINDOWS_CSC_KEY_PASSWORD` — только после появления сертификата.

Fork/MR pipeline не получает protected variables. Значения secrets запрещено печатать в logs и artifacts.

Для команд `glab` внутри CI используется только штатный режим `GLAB_ENABLE_CI_AUTOLOGIN=true`: он передаёт короткоживущий `CI_JOB_TOKEN` через поддерживаемый заголовок `JOB-TOKEN`. Запрещено назначать `GITLAB_TOKEN=$CI_JOB_TOKEN`, потому что тогда `glab` отправляет значение как `PRIVATE-TOKEN`, и Releases API отклоняет запрос. Постоянный PAT/project/group token допускается только для документированного endpoint, который не поддерживает job token, после отдельного согласования области доступа.

## Rollback

- Неуспешный task, release или hotfix MR исправляется в той же source-ветке без создания следующего MR и версии. Новый patch создаётся только если предыдущий immutable tag уже отправлен.
- Неуспешный RC не публикуется; исправление идёт через `release-fix/*`.
- Существующие tags и GitLab Releases не перезаписываются для исправления продукта — выпускается новый patch.
- Stable feed переключается только на полностью загруженный набор; при аварии возвращается предыдущий проверенный `latest.yml`.
- Server rollback использует предыдущий commit/image и обязательный backup. Down migration выполняется только по отдельному проверенному плану.

## Локальная проверка

```bash
npm ci
npm run repo-policy:test
npm run version:check
npm run lint
npm run typecheck
npm run test
npm run test:integration
npm run db:check
npm run build
npm run perf:check
```

GitLab CI syntax дополнительно проверяется API endpoint `POST /projects/:id/ci/lint`; production publication проверяется только на защищённом тестовом release/tag flow без выдачи секретов MR jobs.

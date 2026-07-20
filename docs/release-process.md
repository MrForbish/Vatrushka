# Delivery и выпуск Vatrushka

GitLab `vatrushka-group/Vatrushka` — единственный источник Git, Merge Request, CI/CD и Releases. GitHub — исторический read-only remote.

## Короткий flow

```text
task branch → develop → [RELEASE] develop → main → annotated tag vX.Y.Z
                                                    ↓
                         deploy API/infrastructure → deploy monitoring
                                                    ↓
                              build Windows client → publish updater feed
```

Обычная задача использует `feat/WEB-<n>-description` или `fix/WEB-<n>-description`; нетикетная — `chore/*`, `refactor/*`, `test/*` или `docs/*`. Все они идут только в `develop` и squash-merge. Один MR содержит цельный рабочий срез: код, тесты и документацию.

Когда `develop` готов к выпуску, создаётся единственный MR `[RELEASE] Vatrushka vX.Y.Z`: `develop → main`, merge commit без squash. Промежуточные `assemble/*`, `release/*`, `release-fix/*` и регулярный sync не используются. После merge создаётся неизменяемый annotated tag `vX.Y.Z`.

Hotfix остаётся исключением: `hotfix/X.Y.Z-description → main` merge commit, затем обязательный `[SYNC] main → develop` без squash.

## Пайплайны

Pipeline создаётся для MR и SemVer tag; push в `develop` не повторяет проверки, которые уже прошли в MR. На обычном MR запускаются только проверки затронутой области: policy всегда; API/shared/infra — lint, typecheck, unit, integration PostgreSQL/Redis и build; desktop — Storybook interaction, Electron E2E и visual regression; observability — конфигурационные проверки.

Release MR всегда проходит полный набор качества, database upgrade и release evidence. Tag не повторяет весь quality gate: он проверяет tag/версию и запускает production delivery.

## Порядок production delivery

1. CI создаёт immutable git archive tagged commit.
2. На production VPS архив обновляет runtime in-place, не затрагивая `.env`, Docker volumes и уже опубликованные updater artifacts. Compose пересобирает API, применяет migrations и ждёт `/health/ready`.
3. Через production VPS обновляется observability VPS; secrets и local compose overrides сохраняются. Конфигурационные контейнеры принудительно пересоздаются, потому что Compose сам по себе не применяет изменившиеся bind-mounted rules и dashboards. Healthcheck ожидает готовность Prometheus/Loki/Grafana и active targets до 60 секунд, затем проходит или возвращает диагностическую ошибку.
4. Только после обоих readiness gate собирается Windows installer.
5. Installer и blockmap копируются в update feed; `latest.yml` заменяется последним атомарно. Поэтому клиент не увидит новую версию раньше готового API.
6. Создаются GitLab Release и immutable package assets.

Если deploy или monitoring health check не прошёл, `latest.yml` не меняется и установленные клиенты остаются на предыдущей версии.

## Требования GitLab

- protected `main`, `develop`, tags `v*`; direct push и force push запрещены;
- required successful pipeline и resolved discussions;
- MR в `main` требует `release-auth-smoke`;
- production variables доступны только protected tag pipeline;
- `PRODUCTION_SSH_PRIVATE_KEY`, host key и production `.env` никогда не печатаются и не коммитятся.

Перед merge локально выполняются:

```text
npm run version:check
npm run repo-policy:test
npm run lint
npm run typecheck
glab ci lint
git diff --check
```

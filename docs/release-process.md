# Delivery и выпуск Vatrushka

GitLab `vatrushka-group/Vatrushka` — канонический источник Git, Merge Request, CI/CD и Releases. GitHub используется только как историческое read-only хранилище.

## Поток релиза

```text
task branch → develop → assemble/X.Y.Z → release/X.Y.Z → main → annotated tag vX.Y.Z
                                                                    ↓
                                             один manual production deploy → verification → stable updater feed
```

- Тикетные изменения: `feat/WEB-<n>-*` или `fix/WEB-<n>-*` → `develop`, squash.
- Нетикетные изменения: `chore/*`, `refactor/*`, `test/*`, `docs/*` → `develop`, squash.
- Сборка версии: `[ASSEMBLE] assemble/X.Y.Z → release/X.Y.Z`, merge commit без squash.
- Релиз: `[RELEASE] release/X.Y.Z → main`, merge commit без squash.
- Релизные исправления: `[RELEASE FIX] release-fix/X.Y.Z-* → release/X.Y.Z`, squash.
- Hotfix: `[HOTFIX] hotfix/X.Y.Z-* → main`, merge commit; затем `[SYNC] main → develop` и, при наличии, в активную `release/X.Y.Z`.

Нельзя выпускать `develop → main` напрямую. Для assembly, release, hotfix и sync API GitLab должен хранить `squash=false`.

## Неизменяемые кандидаты

Push в `release/X.Y.Z` создаёт и сохраняет:

- OCI image API с digest;
- исходный архив и checksums;
- манифест кандидата на выпуск;
- production Windows installer и checksums, но не публикует updater feed.

Все assets кладутся в GitLab Generic Package Registry по SHA release-кандидата. Protected tag `vX.Y.Z` обязан указывать на merge commit из `release/X.Y.Z`; pipeline извлекает второй parent merge-коммита и получает только этот заранее собранный кандидат. Tag pipeline не пересобирает API или Windows installer.

После readiness, backup и observability verification ручная job `deploy-production-runtime` применяет manifest. Только затем `publish-production` загружает installer/blockmap и последним атомарно публикует `latest.yml` в stable feed.

Если любая проверка до публикации не пройдена, stable updater feed не меняется.

## Каналы desktop

| Роль | Источник | API | Updater |
|---|---|---|---|
| Local dev | `npm run dev:desktop` | staging | отсутствует |
| Beta | `develop`, только desktop/shared client changes | staging | beta |
| RC | `release/X.Y.Z` | staging | artifact, без feed на первом этапе |
| Стабильный | защищённый тег `vX.Y.Z` | production | стабильный |

Staging должен быть подготовлен до включения auto-deploy и beta/RC jobs. Пока staging credentials и isolated runtime не готовы, эти jobs не включаются.

## Обязательные проверки

Перед merge/tag:

```text
npm run version:check
npm run repo-policy:test
npm run lint
npm run typecheck
glab ci lint
git diff --check
```

MR в `main` также обязан пройти `release-auth-smoke`, иметь migration impact, release evidence и rollback plan. Секреты, CI variables, SSH keys и production `.env` никогда не печатаются и не коммитятся.

# Testing

## Commands

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run test:api
npm run test:renderer
npm run test:integration
npm run test:storybook
npm run test:e2e
npm run test:visual
npm run db:check
npm run perf:bundle
npm run build
npm run package:win
npm run repo-policy:test
npm run version:check
npm run capacity:check
```

Shared tests cover validation, errors, permissions, expiration and lease logic. API tests use Fastify inject with `MemoryStore`, `MemoryPresenceStore`, `FakeMailer`, `FakeMediaService` and cover password registration, email/TOTP/recovery second factor, refresh rotation/reuse, retired auth/room routes, the Gaming Home aggregate and its Redis/LiveKit voice projection, Redis-compatible multi-session presence semantics, DND/privacy enforcement, servers, text/voice channels, messages, attachment-only creation, LiveKit presence, permission-enforced member moves, channel lease concurrency/expiry and signed/unsigned webhooks.

Renderer tests cover password auth/OTP, real remember-session control, Gaming Home loading/empty/no-code states, current-voice Quick Return and server accents, shared-shell fullscreen state, typed settings route parsing, SettingsShell navigation/states, avatar crop cancellation, the shared round avatar mask and Home status dismissal, persistent server/voice navigation, short-link invitation UI, chronological messages and below-viewport delivery, clipboard images, safe external links, emoji insertion/shortcodes, current avatars, canonical unread acknowledgement, roles, participants, stable active-speaker volume controls, device normalization/switching, mute, reconnect/publish timeout handling, safe screen-audio constraints, screen busy/error, outside-click dismissal, Notification Center update actions and accessible labels. Storybook interaction tests enforce axe accessibility checks for every story. Electron Playwright launches the compiled app, verifies keyboard-only auth and visible focus, trusted audio permission with labeled Chromium devices, session revocation, hash-based settings navigation, absence of Node globals, the exact fullscreen-aware preload allowlist, automatic invite acceptance after authentication and clean close. Windows visual regression covers foundations and critical auth at the normal and minimum 1100×680 viewport, the routed settings shell, Gaming Home at 1600×1000 and compact 1100×760, invitation, messaging, custom device controls, connected voice inside the full server shell, participant and screen-share volume controls, screen-share and permissions states.

Renderer performance gate допускает суммарно 2,65 МБ JavaScript и 195 КБ CSS для полнофункциональных messaging, notification и media-editing компонентов. Отчёт по-прежнему показывает raw и gzip-размеры, а лимит крупнейшего JS chunk остаётся отдельным и неизменным.

Electron E2E создаёт отдельный профиль через `mkdtemp` в системном temp для каждого запуска и удаляет его в `afterEach`, включая падающие сценарии. Cleanup разрешён только для canonical path с префиксом `vatrushka-e2e-`; настоящий Electron user-data каталог не используется и не может попасть под удаление. Старые локальные `.e2e-user-data*` остаются в `.gitignore` и могут удаляться вручную только при остановленных тестовых процессах.

`npm run db:check` verifies that every journal entry has exactly one SQL migration and one chained Drizzle snapshot. It rejects accidental destructive SQL; a deliberate contract step is accepted only when both the migration name ends in `_contract` and the SQL starts with `-- vatrushka: destructive-contract`. Production schema changes must use an expand/migrate/contract rollout. Do not squash or renumber migrations that may already exist on a server.

## Production adapter integration tests

The integration suite exercises the real PostgreSQL and Redis adapters. It resets the `public` schema of the configured database, so always use a dedicated test database.

```powershell
$env:INTEGRATION_DATABASE_URL = 'postgresql://vatrushka:password@127.0.0.1:5432/vatrushka_test'
$env:INTEGRATION_REDIS_URL = 'redis://127.0.0.1:6379/15'
npm run test:integration
```

CI starts isolated PostgreSQL 17 and Redis 8 services, applies the complete Drizzle migration chain, and verifies persistence/idempotency, atomic password-reset session revocation, monotonic read state, notification preferences, durable S3 cleanup jobs, outbox publish/deduplication and multi-session presence semantics.

## CI и release gates

Единый `.gitlab-ci.yml` является quality gate для task MR в `develop`: независимые jobs проверяют настоящие PostgreSQL/Redis adapters, lint/typecheck/unit/build/bundle budgets и полный Windows Storybook/Electron/visual набор. Обычный MR не собирает публикуемый installer. Storybook interaction + Electron E2E и 33 последовательных visual scenario выполняются параллельными Windows jobs; общий pipeline успешен только при успехе обоих. Chromium кэшируется по lockfile в project-relative cache; локально быстрые два workers внутри одного visual process были отклонены после деградации на ограниченном Windows runner.

Visual suite сначала собирает production-like статический Storybook, затем обслуживает `storybook-static` через Vite preview. Это сохраняет однопоточный детерминированный screenshot contract, но исключает холодную Vite-трансформацию при открытии каждой story. `run-with-budget.mjs` измеряет Storybook interaction, Electron E2E и visual шаги, пишет фактическое время в GitLab job log и блокирует существенную регрессию. Job-level timeouts защищают от зависшего runner. Актуальная связь рисков, уровней тестов и viewport находится в [test-coverage-matrix.md](test-coverage-matrix.md).

Исторический baseline GitHub PR #23: Storybook interaction 77,9 секунды, Electron E2E 37,0 секунды, static Storybook visual 90,6 секунды; полный visual job 3:01 вместо 6:01 в PR #21. Эти значения остаются ориентиром до накопления GitLab Windows baseline, а блокирующие budgets намеренно оставляют запас для вариативности cold runner. Static visual budget равен 180 секундам: все 32 сценария обязательны.

Release-candidate jobs в `.gitlab-ci.yml` повторно используют тот же quality gate и дополнительно:

- проверяет release branch/version/changelog;
- применяет production schema из текущей production-ветки в чистую PostgreSQL, затем накатывает candidate migrations;
- сохраняет migration/upgrade reports;
- собирает NSIS/portable и SHA-256;
- проверяет clean silent install и upgrade поверх installer из production feed;
- сохраняет RC metadata и installer, не публикуя `latest.yml`.

`release-evidence` требует full quality evidence, rollback/release notes и запрещает dev URLs. Production jobs доступны только immutable SemVer tag, повторяют quality gate, собирают stable artifacts и атомарно публикуют feed и GitLab Release. MR pipeline не получает protected signing/SSH secrets. `merge-request-policy` разрешает обратную синхронизацию только при наличии production tag.

Unit/CI intentionally does not send SMTP, contact LiveKit or capture microphone/loopback/screen. Before release, execute a two-machine manual matrix on Windows with real SMTP and production LiveKit:

1. new/existing account and restart refresh;
2. server owner/member join and reconnect to a persistent voice channel;
3. input/output switch and reconnect;
4. monitor/window share with and without system audio; while sharing audio, play remote participant speech through Vatrushka and verify it is not present in the received `ScreenShareAudio` track;
5. simultaneous claim from two clients;
6. moderation, permissions and `https://<INVITE_DOMAIN>/i/<token>` → `vatrushka://invite/<token>` flow;
7. leave/window close while microphone/share active;
8. password login with email factor, TOTP enable/login/disable and recovery login; verify retired passwordless endpoints remain 404;
9. create/join server, role assignment, denied/allowed text and voice actions, WebSocket delivery plus HTTP reconnect reconciliation;
10. inspect the desktop shell and critical dialogs at Windows scaling 100%, 125% and 150%; keyboard focus must remain visible and no primary action may be clipped;
11. publish a higher test version to a staging feed, verify background download, progress, explicit restart and preserved session/settings.
12. interrupt the presenter network during voice use, wait for reconnect and verify that screen publication is disabled while reconnecting and succeeds after `Connected` without exposing a raw LiveKit engine timeout.
13. send a DM between two installed clients and verify `sent → delivered → read`, retry without duplication, first-unread navigation and tombstone after deletion;
14. verify user/server/channel mute, strict DND, quiet hours, native direct/server notification click and no stale toast after reconnect;
15. upload/finalize an S3 attachment, abandon a second upload, then verify the cleanup worker completes its durable deletion job after the configured retention.

# Voice presence

Voice projection unit tests cover versioning, late-leave protection, move idempotency/conflicts, webhook deduplication, and renderer event reduction. `npm run test:integration` additionally executes the Redis atomic-projection scenario when `INTEGRATION_REDIS_URL` is available in GitLab CI.

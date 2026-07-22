# Changelog

All notable changes to Vatrushka are documented here. The project follows semantic versioning for desktop and API release artifacts.

## [Unreleased]

## [0.8.17] - 2026-07-22

### Fixed

- preserves protected Hawk integration tokens during Windows release packaging instead of replacing them with literal self-references in GitLab CI;
- validates the inherited Desktop Main and Renderer Hawk tokens before packaging, while exporting renderer-only build aliases at runtime without logging secrets.

## [0.8.16] - 2026-07-22

### Fixed

- makes Hawk source-map upload verifiable for Desktop Main and Renderer instead of allowing a release package to succeed after a hidden upload failure;
- publishes API source maps with the immutable API release while keeping Hawk outages outside the API availability path.

## [0.8.15] - 2026-07-22

### Fixed

- passes the immutable release tag to the Desktop Renderer Hawk catcher, so new events no longer use `unknown` as their release;
- adds a CI contract test and release configuration documentation for the Renderer Hawk metadata.

## [0.8.14] - 2026-07-22

### Fixed

- prevents an incomplete offline Home cache from crashing the network-unavailable notification;
- avoids clearing or briefly replacing the current server channel or direct conversation when it is selected again;
- switches from a server channel before deletion and uses the styled application confirmation dialog;
- restores an interactable `2560 × 1440 · 60 FPS` screen-share preset by placing its portalled menu above the source-picker modal.

## [0.8.13] - 2026-07-21

### Fixed

- fixes the production Alloy API scrape timeout so it is shorter than the 5-second interval and telemetry can start.

## [0.8.12] - 2026-07-21

### Fixed

- restores the versioned TURN TLS blackbox module and adds a public LiveKit HTTPS probe, so availability panels have an explicit data source;
- makes `/opt/vatrushka` the canonical production runtime whenever its operator-owned `.env` exists, preventing a release directory from silently using a different configuration;
- fails a production deploy when Hawk is enabled in the runtime configuration but the API reporter is not actually active.

## [0.8.11] - 2026-07-20

### Fixed

- fixes Grafana LogQL selectors for the "All" filter value and removes the invalid Loki compactor pseudo-timestamp;
- clarifies container, Redis and HTTP observability panels and refreshes the product metrics agent as part of a production deployment;
- restores uploaded profile and server media across settings, navigation and workspace cards;
- makes the initial text-channel scroll position reliably land on the latest messages and refines Help and application scrollbars;
- adds safe Hawk reporter enabled/attempt diagnostics without exposing telemetry secrets.

## [0.8.10] - 2026-07-20

### Fixed

- fixes the Hawk-token preflight in Windows release packaging: it now runs with PowerShell syntax before the package build.

## [0.8.9] - 2026-07-20

### Fixed

- the unread divider no longer appears for the current user's own message or in an already open conversation;
- restores the explicit 2560 × 1440 / 60 FPS screen-share quality choice;
- Home, server and direct-message surfaces consistently resolve uploaded server covers, server avatars and profile avatars;
- removes the application-window fullscreen control; fullscreen remains available only for screen-share viewing;
- enables actionable Hawk runtime error capture and validates the protected release token before packaging.

### Added

- configurable local volume for Vatrushka cues: voice join/leave, screen-share start/stop, message and ready-to-install update notifications;
- a manual update check in the Notification Center.

### Fixed

- screen-share source selection no longer rejects a valid first selection because a second desktop-source enumeration raced with window lifecycle;
- only participants already present in a voice channel can be dragged between voice channels; regular/offline member rows are no longer drag sources;
- presence on the central voice stage now uses the same realtime status as member lists and profile surfaces.
- background update checks stay quiet during a local network outage and distinguish it from an update-service outage when the user runs a manual check.

## [0.8.8] - 2026-07-20

### Fixed

- Observability deployment health checks now wait for recreated Prometheus, Loki, Grafana and active targets instead of failing on their expected short startup window.

## [0.8.7] - 2026-07-20

### Fixed

- Observability deployment now force-recreates configuration-bound services, ensuring changed Prometheus rules, Grafana dashboards, Alloy and Loki configuration are loaded during the release instead of merely copied to the VPS.

## [0.8.6] - 2026-07-20

### Fixed

- Voice and screen-share gauges are refreshed from their authoritative operational stores on every internal metrics scrape, so an API restart no longer leaves the dashboards at a stale zero until the next media event.
- Central Prometheus now alerts when product telemetry disappears from the cross-VPS ingestion path even while the public API remains reachable.

## [0.8.5] - 2026-07-20

### Fixed

- observability deployment now explicitly receives the release-version artifact from tag verification, preventing an empty version from reaching the monitoring deployment script.

## [0.8.4] - 2026-07-20

### Fixed

- production and observability deployment scripts now execute on the VPS through non-interactive sudo, allowing the deployment user to update the root-owned runtime tree safely.

## [0.8.3] - 2026-07-20

### Fixed

- production SSH deployment jobs now declare the protected `production` environment, allowing GitLab to expose only the intended environment-scoped SSH variables.

## [0.8.2] - 2026-07-20

### Fixed

- production deployment jobs now pull their SSH runtime image through the GitLab Dependency Proxy, avoiding Docker Hub rate-limit failures before deployment begins.

## [0.8.1] - 2026-07-20

### Fixed

- Loki dashboard queries now retain a non-empty stream selector when every filter is set to `All`, so the Logs Overview dashboard opens without a LogQL parse error.

### Operations

- adds opt-in Hawk error monitoring for the API, Electron Main process and renderer, with source-map upload restricted to protected CI credentials and pseudonymised user context.

## [0.8.0] - 2026-07-20

### Added

- provisioned product dashboards for realtime messaging, voice and screen sharing, PostgreSQL, Redis, private S3, email delivery, authentication and external probes;
- bounded application metrics for WebSocket lifecycle, login outcomes, LiveKit webhooks, screen-share leases, S3 operations and in-flight HTTP requests;
- actionable alerts for realtime reconnect bursts, messaging errors, voice projection drift, screen-share conflicts, S3 failures and login failure bursts.
- a provisioned `Service Health & SLO` dashboard now tracks public API/update/TURN availability, 30-day success and latency objectives, error budgets, dependencies, alerts and deployed build metadata.
- Prometheus health now exposes down targets, scrape and rule budgets, series churn, TSDB/WAL, Alertmanager delivery and remote-write state.
- structured Loki dashboards now use normalized bounded log levels, query-time correlation fields and an end-to-end Loki canary instead of text-only error matching.
- Russian infrastructure and container dashboards now cover host freshness, CPU/iowait, normalized load, swap, disks/inodes, I/O, network errors, clock skew, container limits, throttling, restarts and OOM events.
- Russian Grafana dashboards for the application and detailed HTTP diagnostics now separate 2xx/3xx/4xx/5xx traffic, latency quantiles and bounded route/error breakdowns, with matching Prometheus recording rules and SLO alerts.
- автор демонстрации может рисовать синхронные аннотации поверх видео, выбирать цвет и толщину, отменять последний штрих и очищать слой; координаты одинаково масштабируются у всех зрителей и сбрасываются вместе с media-сессией;

### Fixed

- avatars now use one round masked component with a stable fallback, profile media controls stay aligned, and avatar uploads include a move/zoom crop preview before upload;
- signed S3 image URL refreshes are preloaded without blank flashes, while server icon, cover and accent changes immediately invalidate Home data and update navigation/voice cards;
- the profile preview keeps the avatar above the cover, and the shared status menu is available from Home with outside-click and Escape dismissal;
- messaging now keeps chronological bottom-anchored history, reports messages received below the viewport, clears canonical unread state after acknowledgement and performs a single bounded highlight when opening a notification;
- the composer accepts pasted clipboard images, provides an accessible emoji picker and English emoji shortcodes, linkifies safe HTTP(S) URLs through validated Electron IPC and removes the inactive microphone action;
- direct conversations, message authors and notification actors now render current profile avatars through normalized authenticated media URLs;
- client update progress and restart actions now live in one deduplicated Notification Center entry instead of a floating bottom-right overlay;
- the shared desktop shell now provides synchronized F11/UI fullscreen controls, a confirmation before logout, the canonical Vatrushka brand mark and a responsive Home support rail;
- Gaming Home keeps the current confirmed voice session at the top of Quick Return, and the retired Spaces navigation action is removed;
- Windows packaging deterministically generates a multi-resolution 32-bit application icon from the tracked brand asset;
- voice mute/deafen/speaking state now propagates through the authenticated API, Redis projection and realtime server UI; undeafen restores the microphone only when it was enabled before deafen;
- Gaming Home shows measured WebRTC RTT, and an active voice connection prevents false automatic idle presence;
- voice-channel invites provide visible clipboard feedback, member moderation is hidden behind a context menu, and device selects flip/fit inside the current viewport;
- screen sharing now tolerates transient heartbeat/network failures, keeps authoritative lease conflicts deterministic and records bounded heartbeat diagnostics;
- remote audio tracks are reattached after a LiveKit reconnect and desktop media diagnostics include safe session/correlation context;
- voice-state reads no longer synchronously poll LiveKit, preventing a transient RoomService failure from becoming an API 500;
- Windows system-audio capture uses a compatible `restrictOwnAudio` constraint and refuses an unsafe stream when Chromium cannot exclude Vatrushka output;
- production observability no longer sends Loki internal gRPC through the egress proxy, probes TURN with a real TLS handshake and avoids the AppArmor-incompatible systemd collector.
- Loki health diagnostics no longer depend on obsolete BoltDB Shipper metrics while the production store uses TSDB/S3.
- cAdvisor metrics expose a canonical bounded `container` label, and restart alerts now use changes of the start-time gauge instead of an invalid counter increase.

## [0.7.0] - 2026-07-19

### Added

- LiveKit-confirmed realtime voice presence with Redis projection, versioned snapshots, reconciliation and self/moderator drag-and-drop moves;
- Gaming Home with compact voice health, quick return, active voice spaces and permission-filtered social activity;
- redesigned gaming authentication shell with the final Vatrushka logo, approved background and functional session-only sign-in;
- reproducible Prometheus, Grafana, Loki, Alertmanager, Blackbox and agent configuration for the dedicated observability platform;
- public server visibility, profile/server media and durable email delivery through the transactional outbox.

### Changed

- Home now keeps exactly four central gaming blocks and removes the retired welcome/onboarding/recent-activity UI;
- screen sharing and voice movement wait for authoritative LiveKit state instead of optimistic client state;
- Windows title bar, updater discovery, temporary E2E profiles and responsive Storybook coverage are hardened;
- canonical product, technical, testing, deployment and roadmap documentation reflects the 0.7 architecture.

### Fixed

- screen sharing no longer falls back to unsafe system-audio capture and validates actual media presence before participant moves;
- notification email delivery is durable and idempotent;
- Home realtime refreshes are coalesced and exclude high-frequency typing events;
- dead Home components and their obsolete stories/selectors/styles are removed while legacy response fields remain compatible.

## [0.6.10] - 2026-07-19

### Fixed

- Windows production packaging now downloads its locked, SHA-256-verified toolchain from the private GitLab Generic Package Registry with the built-in CI job token;
- packaging toolchain caches are isolated from Electron E2E and visual-regression caches, preventing unrelated jobs from overwriting them;
- includes the prompt automatic update discovery fix introduced in the unpublished 0.6.9 tag.

## [0.6.9] - 2026-07-19

### Fixed

- desktop update checks now run immediately after startup, every 15 minutes, and when the application regains focus or Windows resumes;
- repeated focus events are rate-limited while still allowing a newly published version to be discovered promptly.

## [0.6.8] - 2026-07-19

### Fixed

- `glab` production publication now enables GitLab CI auto-login, which sends `CI_JOB_TOKEN` through the supported `JOB-TOKEN` header;
- removed the unnecessary long-lived release-token variable and added a policy guard against configuring `GITLAB_TOKEN` in the production job.

## [0.6.7] - 2026-07-19

### Fixed

- production release publication now authenticates to the GitLab Releases and Generic Packages APIs with a dedicated protected and masked CI variable instead of the insufficient `CI_JOB_TOKEN`;
- repository policy tests prevent the release job from silently returning to `CI_JOB_TOKEN`.

## [0.6.6] - 2026-07-19

### Fixed

- Windows packaging now prefetches Electron and electron-builder toolsets with retrying `curl` downloads and verifies every archive by SHA-256 before use;
- the verified local Electron archive is passed directly to `electron-builder`, removing its unreliable runtime request for GitHub `SHASUMS256.txt`;
- GitLab caches the verified Windows packaging toolsets between jobs.

## [0.6.5] - 2026-07-19

### Fixed

- production GitLab Release publication now uses POSIX-compatible commands instead of Bash-only `mapfile` in the Alpine `glab` image;
- the production SSH file variable preserves the final OpenSSH newline required by Alpine `libcrypto`.

## [0.6.4] - 2026-07-19

### Operations

- repository automation, protected delivery and Windows/Linux quality gates moved to self-managed GitLab CI runners;
- added a private Prometheus/Grafana stack with host, container, PostgreSQL, Redis and public endpoint probes;
- added low-cardinality API HTTP/runtime metrics, a provisioned production dashboard and 14 baseline alert rules;
- blocked public access to `/metrics`; Grafana and Prometheus are available only through an SSH tunnel.

## [0.6.3] - 2026-07-18

### CI and quality

- Visual regression now runs against one production-like static Storybook build instead of recompiling stories through the development server.
- GitHub Actions reports and enforces duration budgets for Storybook interaction, Electron E2E and visual suites, with job-level hang protection.
- The visual contract now includes the supported 1280×720 and minimum 1024×680 App Shell boundaries; the risk-to-test matrix is documented.

### Added

- безопасное восстановление пароля по email-коду с нейтральным ответом, отзывом всех сессий, security event/email notice и отдельным Storybook/visual состоянием;
- opt-in capacity harness для API, WebSocket, PostgreSQL, Redis, S3 и control plane LiveKit с p95 budgets, JSON evidence и защитой от случайного production-запуска;
- в нижнюю плашку профиля добавлены синхронизированные с LiveKit кнопки mute/deafen; отключение входящего звука также выключает микрофон, голоса участников и звук демонстрации, не сбрасывая индивидуальные уровни громкости.
- описание сервера отображается в основном server shell с пустым и ограниченным по высоте состояниями;
- переименование канала доступно из контекстного меню и синхронизируется между клиентами через адресные WebSocket-события.

### Changed

- оформление платформенного владельца приведено к компактному `CEO Founder`; отдельная жёлтая заливка его сообщений удалена.

## [0.6.2] - 2026-07-18

### Fixed

- Windows production packaging now requires and verifies the public API URL, preventing an installer from silently targeting `http://localhost:3000`;
- release-candidate and production workflows explicitly build the desktop client for `https://api.myvatrushka.ru`.

## [0.6.1] - 2026-07-18

### Added

- публичное отображаемое имя участника внутри конкретного сервера и приватные псевдонимы других участников, видимые только назначившему их пользователю;
- выбор качества демонстрации `1080p/60 FPS` по умолчанию или `1440p/60 FPS`, полноэкранный просмотр и локальное управление звуком демонстрации через контекстное меню;
- полноэкранный просмотр изображений из сообщений и расширенный набор реакций.

### Fixed

- устранён PostgreSQL `42P18` при первой загрузке canonical message history без cursor, из-за которого текстовый канал и Home показывали внутреннюю ошибку;
- повторный запуск и остановка демонстрации сериализованы, а разрыв LiveKit полностью сбрасывает зависшее состояние подключения;
- демонстрация всегда запрашивает системный звук с обязательным `restrictOwnAudio`; небезопасный захват больше не запускается молча;
- исправлены входной раздел server settings, перекрытие кнопки возврата колокольчиком, адаптивные сетки участников/каналов/модерации, file picker и CSP для приватных Timeweb S3-изображений;
- presence синхронизируется между страницей настроек, карточками участников и нижней панелью; быстрый выбор статуса доступен по нажатию на собственный аватар;
- удаление сообщения идемпотентно относительно realtime-события, а модалки, меню реакций и просмотр изображений корректно работают поверх layout.

### Database

- миграция `0024_server_member_aliases` добавляет приватное viewer-scoped хранилище псевдонимов без изменения существующих публичных имён сервера.

## [0.6.0] - 2026-07-18

### Added

- private S3-compatible storage for channel and direct-message attachments, with API-only credentials and authenticated downloads;
- idempotent attachment backfill and a production canary that verifies bucket access, write, read and delete;
- additive `storage_key` migration and temporary PostgreSQL dual-write fallback for rollback-safe rollout;
- routed `SettingsShell` with typed hash routes, staged production flags, Storybook states and preserved modal fallbacks;
- real notification, password/2FA, recovery-code, session and security-activity sections inside routed user settings, including `/settings/security/backup-codes`;
- routed profile editing for the supported display-name contract, with validation, live preview, save progress and guarded navigation when changes are unsaved;
- routed voice/audio settings backed by actual Windows `MediaDeviceInfo` input/output labels, persisted device IDs and live microphone readiness diagnostics.
- Redis-backed multi-session presence with heartbeat TTL, automatic idle, invisible/offline privacy and durable status/custom-text preferences in PostgreSQL;
- routed status and privacy settings backed by API contracts, including server-enforced direct-message and presence visibility rules;
- DND delivery policy that suppresses message sounds, desktop notifications and future push delivery while preserving unread counters and notification history.
- structured user mentions with keyboard/mouse autocomplete, Unicode-safe entities, rename-safe rendering, backend membership/permission validation and per-channel unread mention counters;
- additive `message_mentions` migration with atomic create/edit persistence and repeated-mention deduplication at notification/count level.
- canonical PostgreSQL conversations for server channels and direct messages, cursor history, idempotent optimistic retry, tombstones and virtualized upward pagination;
- authenticated WebSocket delivery through Redis Pub/Sub and transactional outbox, including typing, multi-device read synchronization and reconnect reconciliation;
- direct-message `sent`/`delivered`/`read` states, first-unread navigation and native Electron notifications that open both server channels and private dialogs;
- notification center plus user/server/conversation delivery levels, mute windows, role/everyone suppression, quiet hours and strict DND;
- Prometheus-compatible `/metrics` for message latency/errors, WebSocket, outbox, notifications, Redis and unread recalculation;
- durable S3 object-deletion jobs with retry/backoff for unfinished uploads, deleted-message retention and previews;
- complete routed server/user settings, profile/avatar/username/bio, privacy/blocking, email change, export and delayed account anonymization.

### Fixed

- updater restart is deferred while a voice call is active, without showing a notification when no update exists;
- revoked sessions are disconnected from realtime on the next WebSocket heartbeat;
- role and `@everyone` mentions now use stable entities, backend permissions and rename-safe labels.

### Operations

- documented Timeweb Cloud configuration, `/opt/vatrushka` as the canonical VPS checkout, Redis operations, the expand/backfill sequence and rollback procedure.

## [0.5.0] - 2026-07-17

### Added

- redesigned Home as a personal dashboard with Continue, Active Spaces, Recent Activity, audio readiness, onboarding, responsive profile rail and Storybook states;
- `GET /api/v1/home`, persisted user activity, cached TanStack Query data and presence-driven invalidation for dashboard widgets;
- live microphone permission/signal diagnostics using the selected Windows input without opening a duplicate capture stream during an active call;
- live voice presence under every voice channel, backed by LiveKit participant identities;
- drag-and-drop voice member moves gated by `MOVE_MEMBERS`: connected participants move natively between LiveKit rooms, while an online desktop not yet in voice receives a short-lived connect command;
- independent Windows push and message-sound preferences in account settings;
- a 30-item message reaction picker and inline previews for authenticated image attachments;
- decoded screen-share resolution diagnostics and a centered grid containing every participant when no screen is shared.

### Fixed

- server member counts, the right member panel, channel unread state and voice presence refresh without reopening the server;
- attachment-only server and direct messages can be sent without placeholder text;
- screen share no longer falls back to a low adaptive simulcast layer: it publishes one original high-quality layer and viewers request HIGH/30 FPS;
- desktop message notifications are no longer silently discarded merely because the application window is focused.

### Security and operations

- removed the legacy standalone-room, guest-session and standalone screen-share lease tables through an explicitly marked contract migration; persistent server channels and channel leases are unchanged;
- image previews use authenticated blob downloads and the Electron CSP allows only local `blob:` images;
- PostgreSQL remains bound to `127.0.0.1:5433`; administrative access is documented through an SSH tunnel instead of a public database port.

## [0.4.4] - 2026-07-17

### Fixed

- remote participant volume controls now remain mounted and visible when the participant becomes the active speaker;
- participant and screen-share volume sliders use a stable compact layout with aligned values and controls;
- settings popovers, server settings and the screen-source picker close on an outside click as well as their explicit close action;
- screen publication is blocked while LiveKit is reconnecting, and the raw `publishing rejected as engine not connected within timeout` error is replaced with a recovery instruction;
- duplicate voice-channel connection attempts are coalesced while a connection transition is already running.

### Changed

- screen capture now preserves the selected source aspect ratio up to 2560×1440 at 30 FPS and publishes with an 8 Mbps ceiling and `maintain-resolution` degradation preference;
- Windows system-audio sharing requires Chromium to apply `restrictOwnAudio` exactly. If the client cannot prove that Vatrushka voice output is excluded, it stops the unsafe share and asks the presenter to continue without audio;
- viewers retain independent persistent mute and volume controls for the `ScreenShareAudio` track.

### Quality

- added renderer coverage for active-speaker slider stability, safe screen-audio capture, LiveKit timeout messaging and outside-click dismissal;
- added Storybook and Windows visual coverage for screen-share audio volume controls and updated the participant-volume baselines.

## [0.4.3] - 2026-07-17

### Changed

- server invitations are now short HTTPS links on `myvatrushka.ru`; the desktop client accepts them automatically after authentication;
- the invite button opens a styled dialog with the link, copy progress, success confirmation and an explicit clipboard error;
- opening an invite for a server the user already belongs to now opens that server instead of returning a conflict.

### Removed

- manual invite-code fields and “Войти по коду” actions from Home, server and direct-message navigation;
- the public `POST /api/v1/servers/join` contract and invite codes from server/voice responses;
- the former `vatrushka://server/<code>` deep-link format.

### Operations

- production requires `PUBLIC_INVITE_URL` for API link generation and `INVITE_DOMAIN` for the dedicated Caddy TLS site;
- no database migration is required: existing opaque invite identifiers remain valid as link tokens.

## [0.4.2] - 2026-07-17

### Changed

- removed the redundant Home navigation column; server actions remain in the workspace rail while security and logout stay available in the top bar;
- a voice channel can now be joined by double-clicking its name without hiding the server navigation;
- added soft local join and leave cues for the current user and remote participants, routed through the selected output device.

### Quality

- participant cue detection starts from a silent baseline, ignores the local LiveKit participant and coalesces simultaneous joins/leaves;
- added renderer coverage for remote participant diffs, Home shell structure and double-click voice joining;
- updated the Windows Home visual baseline for the simplified two-column shell.

## [0.4.1] - 2026-07-17

### Fixed

- Windows input/output device names are disclosed after an audio-only permission request; numbered placeholder devices were removed;
- audio selectors use the Vatrushka design-system menu and no longer overlap in the voice control dock;
- connecting to voice now keeps the workspace, server, channel and member navigation visible;
- authentication, profile and home screens now use the current app shell, typography and design tokens;
- the updater notification is hidden for idle, checking, current, unsupported and failed checks, appears only for a real update and can be dismissed.

### Quality

- added Electron coverage for trusted audio permission and non-empty device labels;
- added Storybook and Windows visual baselines for password login, real device controls and a connected voice channel inside the persistent server shell.

## [0.4.0] - 2026-07-17

### Added

- in-app NSIS updates from the self-hosted generic feed, with background progress, explicit restart and install-on-quit;
- Caddy `/updates` file endpoint and deployment procedure that publishes `latest.yml` only after its setup/blockmap artifacts;
- regression coverage for retired endpoints, server invite deep links and updater UI states.

### Changed

- servers and their text/voice channels are now the only collaboration model;
- deep links now use `vatrushka://server/<8-character-invite>`;
- all workspace packages and Windows artifacts now report version 0.4.0.

### Removed

- passwordless `/auth/request-code` and `/auth/verify-code` login;
- standalone room creation/join/moderation, guest access and their desktop flows;
- legacy room screen-share endpoints; voice channels retain permission-enforced screen-share leases.

### Operations

- 0.3.0 users must install 0.4.0 manually once; future installed NSIS releases can update in place;
- historical standalone-room tables are retained but unreachable, avoiding a destructive database migration;
- portable and unsigned installer limitations remain; public distribution still needs code signing.

## [0.3.0] - 2026-07-17

### Added

- cohesive desktop design system, Storybook catalog and responsive server shell;
- replies, reactions, attachments, unread state, native notifications, direct messages and virtualized message feeds;
- visible microphone/output selection, per-participant volume and local mute controls;
- monitor/window source picker, presenter audio mode and independent viewer stream-audio mixer;
- server role hierarchy, channel overrides, permission-enforced LiveKit grants and audit log;
- password/email/TOTP/recovery authentication, trusted sessions, revocation and security events;
- release gates for Storybook accessibility, Electron E2E, Windows visual regression, migrations and renderer bundle budgets.

### Changed

- desktop, API and shared packages now report version 0.3.0;
- the migration runner resolves its Drizzle folder correctly on both Windows and Linux;
- Windows packaging waits for the complete desktop regression suite in CI.

### Operations

- migrations remain additive and must not be renumbered or squashed after deployment;
- this release still requires a manually configured production API, SMTP and LiveKit deployment;
- installers are not code-signed and automatic updates are not enabled yet.

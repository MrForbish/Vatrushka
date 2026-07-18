# Changelog

All notable changes to Vatrushka are documented here. The project follows semantic versioning for desktop and API release artifacts.

## [Unreleased]

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

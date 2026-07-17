# Changelog

All notable changes to Vatrushka are documented here. The project follows semantic versioning for desktop and API release artifacts.

## [Unreleased]

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

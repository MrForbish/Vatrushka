# Changelog

All notable changes to Vatrushka are documented here. The project follows semantic versioning for desktop and API release artifacts.

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

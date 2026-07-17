# Testing

## Commands

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run test:api
npm run test:renderer
npm run test:storybook
npm run test:e2e
npm run test:visual
npm run db:check
npm run perf:bundle
npm run build
npm run package:win
```

Shared tests cover validation, errors, permissions, expiration and lease logic. API tests use Fastify inject with `MemoryStore`, `FakeMailer`, `FakeMediaService` and cover password registration, email/TOTP/recovery second factor, refresh rotation/reuse, retired auth/room routes, servers, text/voice channels, messages, role enforcement, channel lease concurrency/expiry and signed/unsigned webhooks.

Renderer tests cover password auth/OTP, home, persistent server/voice navigation, short-link invitation UI, messages, roles, participants, device normalization/switching, mute, reconnect, screen busy/error, update visibility/dismissal and accessible labels. Storybook interaction tests enforce axe accessibility checks for every story. Electron Playwright launches the compiled app, verifies keyboard-only auth and visible focus, trusted audio permission with labeled Chromium devices, session revocation, absence of Node globals, exact preload allowlist, automatic invite acceptance after authentication and clean close. Windows visual regression covers foundations and critical auth, home, invitation, messaging, custom device controls, connected voice inside the full server shell, screen-share and permissions states.

`npm run db:check` verifies that every journal entry has exactly one SQL migration and one chained Drizzle snapshot. It rejects accidental `DROP TABLE`, `DROP COLUMN`, `TRUNCATE TABLE` and column type rewrites; production schema changes must use an expand/migrate/contract rollout. Do not squash or renumber migrations that may already exist on a server.

Unit/CI intentionally does not send SMTP, contact LiveKit, capture microphone/loopback/screen or require PostgreSQL. Before release, execute a two-machine manual matrix on Windows with real SMTP and production LiveKit:

1. new/existing account and restart refresh;
2. server owner/member join and reconnect to a persistent voice channel;
3. input/output switch and reconnect;
4. monitor/window share with and without system audio;
5. simultaneous claim from two clients;
6. moderation, permissions and `https://<INVITE_DOMAIN>/i/<token>` → `vatrushka://invite/<token>` flow;
7. leave/window close while microphone/share active;
8. password login with email factor, TOTP enable/login/disable and recovery login; verify retired passwordless endpoints remain 404;
9. create/join server, role assignment, denied/allowed text and voice actions, message polling.
10. inspect the desktop shell and critical dialogs at Windows scaling 100%, 125% and 150%; keyboard focus must remain visible and no primary action may be clipped;
11. publish a higher test version to a staging feed, verify background download, progress, explicit restart and preserved session/settings.

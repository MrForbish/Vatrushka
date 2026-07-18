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
```

Shared tests cover validation, errors, permissions, expiration and lease logic. API tests use Fastify inject with `MemoryStore`, `MemoryPresenceStore`, `FakeMailer`, `FakeMediaService` and cover password registration, email/TOTP/recovery second factor, refresh rotation/reuse, retired auth/room routes, the Home dashboard/onboarding/activity aggregate, Redis-compatible multi-session presence semantics, DND/privacy enforcement, servers, text/voice channels, messages, attachment-only creation, LiveKit presence, permission-enforced member moves, channel lease concurrency/expiry and signed/unsigned webhooks.

Renderer tests cover password auth/OTP, Home selectors/limits/no-code guard, typed settings route parsing, SettingsShell navigation/states, persistent server/voice navigation, short-link invitation UI, messages, roles, participants, stable active-speaker volume controls, device normalization/switching, mute, reconnect/publish timeout handling, safe screen-audio constraints, screen busy/error, outside-click dismissal, update visibility/dismissal and accessible labels. Storybook interaction tests enforce axe accessibility checks for every story. Electron Playwright launches the compiled app, verifies keyboard-only auth and visible focus, trusted audio permission with labeled Chromium devices, session revocation, hash-based settings navigation, absence of Node globals, exact preload allowlist, automatic invite acceptance after authentication and clean close. Windows visual regression covers foundations and critical auth, the routed settings shell, the three-column Home and compact profile drawer, invitation, messaging, custom device controls, connected voice inside the full server shell, participant and screen-share volume controls, screen-share and permissions states.

`npm run db:check` verifies that every journal entry has exactly one SQL migration and one chained Drizzle snapshot. It rejects accidental destructive SQL; a deliberate contract step is accepted only when both the migration name ends in `_contract` and the SQL starts with `-- vatrushka: destructive-contract`. Production schema changes must use an expand/migrate/contract rollout. Do not squash or renumber migrations that may already exist on a server.

## Production adapter integration tests

The integration suite exercises the real PostgreSQL and Redis adapters. It resets the `public` schema of the configured database, so always use a dedicated test database.

```powershell
$env:INTEGRATION_DATABASE_URL = 'postgresql://vatrushka:password@127.0.0.1:5432/vatrushka_test'
$env:INTEGRATION_REDIS_URL = 'redis://127.0.0.1:6379/15'
npm run test:integration
```

CI starts isolated PostgreSQL 17 and Redis 8 services, applies the complete Drizzle migration chain, and verifies persistence/idempotency, monotonic read state, notification preferences, durable S3 cleanup jobs, outbox publish/deduplication and multi-session presence semantics.

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

# Testing

## Commands

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run test:api
npm run test:renderer
npm run test:e2e
npm run build
npm run package:win
```

Shared tests cover normalization/validation/code generation/error/expiry/lease logic. API tests use Fastify inject with `MemoryStore`, `FakeMailer`, `FakeMediaService` and cover OTP, password registration, email/TOTP second factor, refresh rotation/reuse, rooms, servers, text/voice channels, messages, role enforcement, lease concurrency/expiry and signed/unsigned webhooks.

Renderer tests cover auth/OTP, home, server navigation, messages, roles, guest join, participants, mute, reconnect, screen busy/error, owner controls and accessible labels. Electron Playwright smoke launches the compiled app, verifies auth, absence of Node globals, exact preload allowlist, startup deep link and clean close.

Unit/CI intentionally does not send SMTP, contact LiveKit, capture microphone/loopback/screen or require PostgreSQL. Before release, execute a two-machine manual matrix on Windows with real SMTP and production LiveKit:

1. new/existing account and restart refresh;
2. owner + four participants, reject sixth;
3. input/output switch and reconnect;
4. monitor/window share with and without system audio;
5. simultaneous claim from two clients;
6. lock/kick/close/deep link;
7. leave/window close while microphone/share active.
8. password login with email factor, TOTP enable/login/disable and legacy password setup;
9. create/join server, role assignment, denied/allowed text and voice actions, message polling.

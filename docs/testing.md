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

Shared tests cover normalization/validation/code generation/error/expiry/lease logic. API tests use Fastify inject with `MemoryStore`, `FakeMailer`, `FakeMediaService` and cover valid/invalid/expired/exhausted OTP, refresh rotation/reuse, logout, rooms, guests, locked/closed/full states, owner permissions, lease concurrency/expiry and signed/unsigned webhooks.

Renderer tests cover auth/OTP, home, guest join, participants, mute, reconnect, screen busy/error, owner controls and accessible labels. Electron Playwright smoke launches the compiled app, verifies auth, absence of Node globals, exact preload allowlist, startup deep link and clean close.

Unit/CI intentionally does not send SMTP, contact LiveKit, capture microphone/loopback/screen or require PostgreSQL. Before release, execute a two-machine manual matrix on Windows with real SMTP and LiveKit Cloud:

1. new/existing account and restart refresh;
2. owner + four participants, reject sixth;
3. input/output switch and reconnect;
4. monitor/window share with and without system audio;
5. simultaneous claim from two clients;
6. lock/kick/close/deep link;
7. leave/window close while microphone/share active.

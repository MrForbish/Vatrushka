# Security notes

## Desktop

- `nodeIntegration=false`, `contextIsolation=true`, `sandbox=true`, `webSecurity=true`, webview disabled;
- local renderer only; CSP denies objects/base/frame ancestors and restricts scripts;
- unknown navigation/windows denied;
- main-frame sender validation and fixed IPC channels; no generic invoke;
- source ID is one-shot and revalidated immediately before display capture;
- refresh encrypted by OS `safeStorage`; no plaintext fallback;
- access/LiveKit tokens only in memory; no localStorage;
- logs rotate at 5 MiB and never intentionally include tokens.

Windows DPAPI protects against other OS users but not every process already running as the same Windows user. This matches Electron `safeStorage` semantics; full hardware-backed secret isolation is out of MVP scope.

## API

- strict Zod validation and unified non-stacktrace errors;
- OTP HMAC pepper, refresh SHA-256 hashes, JWT issuer/audience/expiry;
- rate limits, attempt limits, session family revocation;
- least-privilege room tokens: microphone/screen sources, no camera;
- owner checks server-side, guest room binding, room state checks;
- webhook signature and body checksum validation;
- Pino redaction for auth headers/code/refresh/secrets.

Secrets live only in `.env`/deployment secret management. `.env` is ignored and is never copied to the Docker image or desktop bundle.

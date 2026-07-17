# ADR: settings routing and shell

## Status

Accepted for the staged settings migration.

## Context

The desktop client previously selected `home`, `server`, `direct` and modal settings screens through local React state. The new server and user settings require stable URLs, browser-style history, nested sections and safe deep links without replacing the working media controller.

The packaged renderer is loaded from `file://`, so server-backed browser routing is unavailable. Voice and screen sharing are owned by the existing top-level application controller and must survive settings navigation.

## Decision

- Use `react-router-dom` with hash history. Canonical application paths such as `/settings/profile` are represented as `#/settings/profile` in the packaged window.
- Keep the existing application controller mounted. Settings routes select a different view without recreating `MediaSession` or moving Electron IPC into React components.
- Extend the existing `AppShell`; add a dedicated `SettingsShell` rather than creating another UI kit.
- Gate user and server settings pages independently. Development and E2E builds enable them by default; production requires explicit build-time flags until each vertical slice reaches parity.
- Keep legacy settings modals as fallbacks until their API-backed replacements pass regression tests.
- Invalid or incomplete settings paths redirect to a safe overview/profile section.
- Load the settings route chunk lazily so Home, voice and messaging do not pay the full settings UI cost during normal startup.
- Raise the total raw JavaScript budget from 2,300,000 to 2,350,000 bytes for the router while retaining the stricter 2,200,000-byte largest-chunk budget.

## Consequences

- URLs and history work in development and packaged Electron without a web server fallback.
- A direct server-settings link may need to load the server before rendering permission-sensitive navigation.
- The top-level controller remains large for now. Splitting it is a separate refactor and is not coupled to the settings migration.
- Future route guards must enforce UX only; backend services remain authoritative for authentication and permissions.

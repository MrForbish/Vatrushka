# Code dependency inventory

## Active entrypoints

| Area | Status | Evidence |
| --- | --- | --- |
| Desktop renderer/main/preload | active | Electron packaging, `App.tsx`, renderer routes, IPC and desktop CI jobs. |
| API/Fastify | active | `apps/api/src/app.ts`, service/store ports, Docker runtime and integration jobs. |
| Shared contracts | active | workspace build precedes API and desktop builds. |
| Realtime/media | active | WebSocket, Redis, LiveKit and screen-share paths are governed by ADR-0004/0006 and are excluded from cleanup. |
| Canonical messaging migration | compatibility | service, `DataStore`, PostgreSQL schema, migration script and tests use legacy lookup/migration helpers. |
| Test fakes and MemoryStore | active | imported by API unit tests; not a production datastore. |

## Dependency conclusion

`package.json` defines workspaces and root development tooling; workspace manifests own runtime dependencies. No direct dependency is classified removable from import/search evidence alone. Removal must be its own package-manager MR with lockfile regeneration and targeted build/test proof.

## Required pre-removal search

For any candidate, record `rg` results across source, tests, scripts, CI, Docker/Compose, Storybook, Electron packaging, runtime string paths and documentation; then run its owning build/test path.

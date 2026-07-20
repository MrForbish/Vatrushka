# ADR 0005: LiveKit-confirmed voice presence

Status: accepted (WEB-26)

## Audit of the previous implementation

- Client SDK: `livekit-client 2.20.1`; server SDK: `livekit-server-sdk 2.17.0`.
- Production uses self-hosted LiveKit. Cloud remains a supported, explicitly selected strategy.
- A voice channel maps to one transport room named `channel_<uuid>`; this naming is unchanged.
- Participant identity remains `user_<userId>_<random suffix>`; it is not migrated.
- Multiple LiveKit identities could exist for one user. The sidebar policy is one logical active voice session per user; a newer session wins and late leave events are conditionally ignored.
- Application realtime is an authenticated Fastify WebSocket gateway backed by Redis Pub/Sub and target-user fanout.
- The existing Redis presence store only tracked online/idle heartbeats. Voice membership was queried directly from LiveKit whenever server details were loaded.
- LiveKit webhook validation and basic join/leave refresh events already existed, but there was no versioned projection, move state machine, deduplication, or reconciliation.
- Permissions are resolved on the backend from server roles and per-channel overwrites. `CONNECT_VOICE`, `VIEW_CHANNEL`, `MOVE_MEMBERS`, capacity, owner protection, and role hierarchy are enforced for moves.
- Click-to-join issued a short-lived room token. Moderator movement attempted native LiveKit move and fell back through a polling reconnect.
- Renderer state was owned by the top-level application controller. Voice lists were embedded in `ServerDetail` and refreshed every 30 seconds.
- Drag-and-drop used the native HTML5 API. No external DnD dependency was installed.
- Existing coverage included LiveKit token/permissions, voice connect, screen share, cues, media lifecycle, and Electron/Storybook voice scenarios.

## Decision

LiveKit remains the media-presence source of truth. Redis stores an additive, versioned projection:

- `vatrushka:voice:user:<userId>` — current logical voice session hash;
- `vatrushka:voice:channel:<channelId>:members` — channel membership set;
- `vatrushka:voice:server:<serverId>:users` — users in the server projection;
- `vatrushka:voice:server:<serverId>:version` — monotonic membership version;
- `vatrushka:voice:move:<movementId>` — pending move state;
- `vatrushka:voice:move:user:<userId>` — one active move lock;
- `vatrushka:voice:move:request:<actorUserId>:<clientRequestId>` — idempotency;
- `vatrushka:voice:webhook:<eventId>` — webhook deduplication;
- `vatrushka:voice:servers` — reconciliation scope.

Membership updates are atomic in Redis. A leave is conditional on `sessionId`, so a delayed event cannot remove a newer connection. PostgreSQL continues to store only servers, channels, membership, roles, permissions, bans, and audit entries.

The API exposes:

- `GET /api/v1/servers/:serverId/voice-state`;
- `POST /api/v1/servers/:serverId/voice/moves`;
- `POST /api/v1/integrations/livekit/webhook` (the previous webhook path remains during client/server migration).

Realtime membership events are versioned and deduplicated. The renderer applies joined, left, moved, pending, failed, and state updates to a normalized store; a version gap or reconnect requests a snapshot.

Two explicit transport adapters are used:

- `VOICE_MOVE_STRATEGY=controlled-reconnect` for self-hosted LiveKit. The target client receives a targeted command and fetches its one-room token through the authenticated move endpoint.
- `VOICE_MOVE_STRATEGY=livekit-cloud` for native `moveParticipant`. Success is still confirmed only by the target-room webhook.

Tokens and LiveKit secrets never enter Redis Pub/Sub payloads or logs.

## Migration and rollout

No PostgreSQL migration and no voice outage are required. Existing clients continue to receive target-user realtime refreshes and can use the compatibility move endpoint. If Redis has no projection immediately after deployment, server details still use direct LiveKit participant discovery. New webhook events hydrate the projection, while reconciliation heals active projected servers every 45 seconds.

Recommended rollout order:

1. deploy API with `VOICE_DND_ENABLED=false` and verify webhook/snapshot metrics;
2. enable realtime projection and reconciliation;
3. enable self movement;
4. enable moderator movement;
5. retain `controlled-reconnect` on the current self-hosted LiveKit deployment.

Rollback is configuration-only for DnD. Redis voice keys are ephemeral and may be deleted without touching PostgreSQL or LiveKit.

## Regression boundaries

- Do not change room naming or participant identity during this rollout.
- Do not treat frontend drag state, HTTP 202, or client ACK as confirmed membership.
- Do not persist speaking or other high-frequency media state in PostgreSQL.
- Keep the direct LiveKit participant fallback until all supported clients and the production webhook are confirmed on the new version.

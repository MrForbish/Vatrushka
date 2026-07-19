# Media and API stability incident — 2026-07-19

Status: fixes implemented in `WEB-29`; automated regression verification complete, long-running Windows smoke pending release candidate.

## Impact

- A screen share could stop after a single transient lease-heartbeat `503`.
- Remote participant audio could remain silent after an otherwise successful LiveKit ICE reconnect.
- A voice-state read could return `500` when the LiveKit RoomService connection closed transiently.
- Some Windows system-audio capture requests could fail because an ideal media constraint was expressed as an exact constraint.

## Evidence and root causes

All timestamps below are 19 July 2026. Sensitive headers, access tokens and message content are excluded.

### Screen-share heartbeat

- At 17:34:56 MSK request `f3f79a05-3ade-4a4c-ad19-3ff7f9f6804c` returned `503`; LiveKit reported `track_unpublished` 285 ms later.
- At 18:47:19 MSK request `86e2543f-7713-41e0-9187-bc9972a4f939` returned `503`; LiveKit reported `track_unpublished` about 325 ms later.
- The API heartbeat synchronously queried LiveKit on every renewal. The desktop client treated any failed heartbeat as confirmed lease loss and stopped publication immediately.

The lease heartbeat now validates the authenticated participant and exact PostgreSQL lease owner without a synchronous RoomService request. Authoritative LiveKit leave/unpublish webhooks still release the lease. The client retries transient network/5xx failures inside a bounded grace period and stops immediately only for confirmed authorization, ownership or not-found responses.

### Voice-state API

- At 18:27:35 MSK request `e9a588cd-4563-439a-ae2d-b2a26003d28b` failed with `TypeError: terminated: other side closed` inside an undici TLS request to LiveKit.
- `GET /api/v1/servers/:serverId/voice-state` ran full LiveKit reconciliation synchronously on every read.

Voice-state reads now use the Redis projection. LiveKit reconciliation remains periodic/background, so a transient media-control-plane failure no longer converts an otherwise valid snapshot into API `500`.

### Remote audio reconnect

- Between 16:06 and 16:07 MSK LiveKit logged RTC session resume followed by a successful ICE pair switch for participant `user_e9e25d32-..._NrtWR1xl`.
- The renderer refreshed application state after reconnect but did not rebuild already-subscribed remote audio attachments.

The media controller now detaches and reattaches existing remote audio tracks, reapplies participant and screen-share volume/mute preferences and calls `startAudio()` after `RoomEvent.Reconnected`.

### Windows system audio

The Electron capture handler requests Windows loopback audio. The renderer used `restrictOwnAudio: { exact: true }`, which could overconstrain a valid source. It now requests the ideal boolean constraint and verifies the resulting track settings. If Chromium cannot exclude Vatrushka output, capture is rejected safely instead of starting a feedback-prone stream.

## Diagnostics and alerts

- `api_errors_total{code,route,status_class}` counts safe bounded server/dependency errors.
- `screen_share_lease_heartbeat_total{result}` distinguishes `renewed`, `ownership_lost`, `rejected` and `dependency_error`.
- Desktop media lifecycle diagnostics are sent through a validated IPC contract and contain event, timestamp, server/channel, optional voice session, reason and retry attempt only.
- Prometheus alerts report API 5xx reasons and screen-share heartbeat ownership/dependency failures.

## Observability platform corrections

- Loki explicitly bypasses the egress proxy for internal gRPC and listens on `0.0.0.0`, preventing Tinyproxy `403 CONNECT` errors.
- TURN is probed using TLS with the correct SNI rather than a raw TCP connect that generated handshake EOF noise.
- The node-exporter systemd collector is disabled where AppArmor blocks its D-Bus handshake; the remaining host collectors continue to operate.

## Verification

- API regression tests cover heartbeat renewal during LiveKit unavailability and voice-state reads during the same outage.
- Renderer tests cover transient heartbeat retry, confirmed lease-loss shutdown, remote-audio reattachment and support request IDs.
- Remaining release evidence: a long-running two-participant Windows voice session, network reconnect and repeated screen-share start/stop/source replacement.

# Delivery implementation plan

Labels: **fact**, **inference**, **assumption**, **unknown**, **proposal**.

## Completed foundation

- **fact:** immutable API image, candidate manifest, source archive provenance, root-owned deploy/preflight/status wrappers and bounded rollback manifests are implemented.
- **fact:** the new production VPS has Docker/Compose, protected environment paths, registry pull configuration, root-owned delivery wrappers and the restricted `vatrushka_deploy` account. No Vatrushka workload or traffic has moved there.
- **fact:** direct Observer verification has a separate restricted account and wrapper. Observer SSH allows only that account with public keys; root, password and keyboard-interactive authentication are disabled.
- **fact:** protected `main` builds the stable Windows package once and stores it under the immutable commit SHA. A stable tag consumes that exact package before runtime deployment; stable updater publication is a checksum-bound root-owned operation and `latest.yml` remains the final exposure gate.
- **fact:** tag delivery has one mandatory manual production deployment approval; Observer verification runs automatically afterward. An optional manual rollback job is separate from normal release promotion.
- **fact (2026-07-25):** the immutable runtime driver validates and starts the self-hosted LiveKit Compose profile from the same verified source archive as API/Redis/PostgreSQL/Caddy. It waits for API liveness before LiveKit and accepts the release only after full API readiness.
- **fact (2026-07-25):** after the manual immutable runtime deployment, the tag pipeline starts the product Alloy/exporter Compose project through a distinct root-owned, checksum-bound wrapper. The Observer then verifies the new production host's `alloy-agent` series, rather than treating only Observer-container readiness as delivery success.
- **fact (2026-07-25):** the immutable deployment driver now validates the root-owned production application configuration before extracting a candidate or moving the active runtime symlink. It accepts only a complete HTTPS S3 media configuration and production-safe API, database, Redis, SMTP and LiveKit/TURN settings; validation output never contains configuration values.
- **fact (2026-07-25):** a protected tag now invokes the fixed root-owned PostgreSQL backup wrapper before its one manual runtime deployment approval. With no active runtime it validates the protected backup boundary and returns `backup=not-required`; with an active runtime it creates the encrypted backup, so the pipeline cannot silently skip an existing database.
- **fact (2026-07-25):** the production deployment preflight also requires the trusted TURN certificate pair under the root-owned Let’s Encrypt mount before it changes the active runtime path. A missing certificate now fails before the candidate source is extracted or a service is started.
- **fact (2026-07-25):** protected tags run a fixed read-only production readiness wrapper before backup or manual deployment. It validates root ownership, production API/S3/LiveKit/TURN configuration and the TURN certificate without exposing values or starting containers.

## Remaining implementation order

1. **proposal:** configure independent production PostgreSQL/Redis/LiveKit/TURN and production-only media S3 on the new production host. The root-only encrypted PostgreSQL backup boundary, offline recovery key, S3 credential probe and 14-day/56-day lifecycle are ready; activation still requires an immutable runtime and isolated restore evidence.
2. **proposal:** use the established private production-to-Observer route to prove API, WebSocket, media, LiveKit, updater, metrics and logs before DNS cutover.
3. **proposal:** switch production traffic in an approved window; retain the existing production host unchanged through an observation period.
4. **proposal:** reimage the former production host only after that observation period. Configure it as isolated staging with its own database, Redis, LiveKit/TURN, S3 principal, deploy identity and beta feed.
5. **proposal:** activate automatic `develop` staging candidate delivery, staging smoke/Observer verification, then changes-aware beta packaging and beta feed publication.
6. **proposal:** retain RC as an immutable `release/X.Y.Z` artifact against staging. Add an RC feed only as a separately approved enhancement.

## Current blockers

- **fact:** the new production host contains a transferred, root-owned application environment and the runtime policy points to production, but no product workload is running there yet.
- **fact (2026-07-25):** the new production host has the root-only encrypted backup wrapper, `age`, system `python3-boto3`, a validated root-owned backup configuration, a disabled daily systemd timer and verified `backups-vatrushka` access. It correctly remains inactive until the immutable product runtime exists.
- **fact (2026-07-25):** the root-owned application environment now has a `LIVEKIT_WEBHOOK_URL` derived and validated from its existing HTTPS public API URL. The host wrapper set validates the self-hosted LiveKit Compose configuration before a release can switch runtime, but no LiveKit container has been started.
- **fact (2026-07-25):** the new production host has a dedicated WireGuard route to Observer. It was verified in both directions without altering the legacy production peer; the installed Alloy configuration is constrained to those private Observer endpoints and remains inactive until a matching runtime candidate is deployed.
- **fact (2026-07-25):** a root-only, value-redacted configuration audit found the new production application's media S3 configuration incomplete. No runtime or traffic change was made as a result.
- **fact (2026-07-25):** the same audit found public API and TURN DNS still point away from the new production host, and the new host has no TURN certificate. This is expected before the approved traffic/DNS cutover, but prevents the first LiveKit runtime activation.
- **unknown:** independent production database/Redis/LiveKit/TURN validation, production media S3 principal mapping and isolated restore procedure.
- **unknown:** DNS cutover control, private-network/WireGuard topology and migration window.
- **unknown:** staging hostname and staging-only credentials; these intentionally do not exist until after production migration.
- **proposal:** populate the existing root-owned production application environment with the dedicated production-media S3 principal before the first immutable runtime deployment. The new deployment preflight intentionally blocks until this is complete.

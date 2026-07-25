# Production migration plan

Метки: **fact**, **inference**, **assumption**, **unknown**, **proposal**.

## Preconditions

- **fact:** the target production VPS (`vtr-prod-1`) has key-only bootstrap access, a separate no-sudo/no-Docker deploy account, Docker Engine and Compose, and no product workload.
- **fact:** the current production VPS runs the application and is the future staging host only after production migration.
- **fact:** Maxim explicitly accepted loss of the current application's non-critical database data during this infrastructure migration; this does not remove the need for a clean target configuration and verification evidence.
- **unknown:** the exact production configuration values, S3 media credential, DNS switch control, LiveKit/TURN configuration and migration window are not stored in the repository.
- **proposal:** do not repurpose, stop, erase or reinstall this VPS until the new production runtime has passed migration verification and its agreed observation window.

## Ordered migration

1. **proposal:** inventory all hosts, public DNS, pinned SSH host keys, deploy accounts, firewall and WireGuard peers without recording secrets in Git.
2. **proposal:** install the reviewed root-owned wrapper set, create the manifest/driver runtime and provision the new host with independent PostgreSQL, Redis, LiveKit/TURN and production-only media credentials.
3. **proposal:** create an encrypted, checksummed configuration and database backup before cutover whenever source access is available. If data loss remains explicitly accepted, record the waived restore scope while still retaining a rollbackable runtime configuration.
4. **proposal:** verify API, WebSocket, LiveKit, media storage, updater, metrics and logs against the private target.
5. **proposal:** schedule the DNS/traffic switch, retain the former production untouched for the agreed observation window, and use one release manifest/digest for deployment.
6. **proposal:** after that window, reinstall the former production host and create the isolated staging runtime with staging-only S3, LiveKit, database and updater feed.

## Migration execution record

- **fact (2026-07-25):** the new production host has the reviewed wrapper set, transport-only `vatrushka_deploy` account, root-owned runtime/app environment paths and no application workload.
- **fact (2026-07-25):** the Observer has a separate `vatrushka_observer_deploy` account with a dedicated delivery key and exactly one root-owned `vatrushka-observability-verify production` sudo command. Its direct readiness check passed against the existing Grafana, Prometheus and Loki runtime without changing services.
- **fact (2026-07-25):** the Observer's legacy `codex` account was removed only after the restricted deploy account was independently verified. Root, password and keyboard-interactive SSH authentication are disabled, so no general-purpose remote shell remains exposed.
- **fact (2026-07-25):** the current production host remains online and unchanged; it has not been repurposed, stopped, erased or reinstalled.
- **fact (2026-07-25):** a value-redacted audit of the new production root-owned application environment found incomplete media S3 settings. The immutable runtime wrapper now rejects a production deployment before source extraction or symlink replacement when any required production setting is absent or malformed.
- **unknown:** registry pull credential, private-network topology, production DNS/cutover window and independent backup destination.
- **proposal:** complete the registry bootstrap and private runtime validation before any DNS, updater, LiveKit or database traffic cutover.
- **proposal:** before the cutover window, issue the trusted TURN certificate after the agreed DNS strategy is in place, then use the read-only tag preflight result as the final configuration gate. Do not rely on LiveKit startup to discover a missing certificate.

## Stop conditions

- **proposal:** abort traffic switching on failed readiness, smoke, media, WebSocket, LiveKit, logging or metrics verification.
- **proposal:** do not erase the former production host or any bucket without a separate explicit approval.

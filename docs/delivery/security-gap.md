# Security gap

Labels: **fact**, **inference**, **assumption**, **unknown**, **proposal**.

- **fact:** candidate manifests are redacted, checksum-bound and validated before root imports them. Source archives and updater files are allowlisted, ownership-checked and checksum-checked.
- **fact:** runtime deployment uses immutable registry digests and `docker compose --no-build`; the deploy user cannot run Docker or an arbitrary shell.
- **fact:** updater assets are imported into a root-owned feed directory. The wrapper validates an exact manifest and publishes `latest.yml` only after all referenced files are in place.
- **fact:** direct Observer verification uses a separate account and fixed read-only wrapper.
- **fact (2026-07-25):** Observer SSH now has one allowlisted account, `vatrushka_observer_deploy`; root, password and keyboard-interactive SSH authentication are disabled. The account's limited wrapper was verified after the change.
- **fact (2026-07-25):** the root-owned runtime deploy driver validates production configuration before it changes the active application path. The validation is fail-closed and reports only generic invalid/incomplete states, so database, media S3, SMTP and LiveKit values are not disclosed in CI or remote output.
- **fact (2026-07-25):** the same preflight requires the trusted TURN certificate files through the fixed `/etc/letsencrypt` mount; arbitrary certificate directories and a late LiveKit startup failure are rejected before runtime activation.
- **unknown:** production S3 IAM boundaries, backup encryption and retention, provider firewall policy, LiveKit/TURN secrets and private-network/WireGuard controls.
- **proposal:** create separate least-privilege S3 principals for production media, staging media, Loki and backups; retain the token-rotation audit trail outside Git and periodically verify that no expired integration token remains accepted.

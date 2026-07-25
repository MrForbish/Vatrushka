# Access audit

Labels: **fact**, **inference**, **assumption**, **unknown**, **proposal**.

- **fact:** the new production host uses a key-only root break-glass account and a separate `vatrushka_deploy` account for CI transport.
- **fact:** `vatrushka_deploy` is not in the Docker group and has no shell-level sudo authority. Its sudoers entry allows only root-owned Vatrushka wrappers for preflight, deploy, rollback, runtime status and updater publication.
- **fact (2026-07-25):** the Observer accepts SSH only for `vatrushka_observer_deploy` using public keys. Password authentication, keyboard-interactive authentication and root SSH login are disabled; legacy `codex` was removed after the restricted account and wrapper were verified.
- **fact:** `vatrushka_observer_deploy` may invoke only `vatrushka-observability-verify production` through sudo. It has no Docker group membership or general shell-level sudo authority.
- **fact:** CI pins host keys through protected file variables. Runtime `ssh-keyscan` and disabled host-key checks are not used.
- **inference:** production and Observer CI authority are now separated and limited to their intended control planes.
- **unknown:** provider firewall allowlists, WireGuard peer list and the complete legacy-host user inventory.
- **proposal:** after traffic migration, audit and reduce legacy-host users before reimaging it as staging; do not reuse either production deploy key for staging.

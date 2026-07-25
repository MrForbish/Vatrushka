# Server wrapper contract

Production and staging CI deployment must not receive a root shell. A root-owned, non-writable-by-deploy-user wrapper is the only sudo entry point.

Required wrapper names:

- `vatrushka-preflight`
- `vatrushka-deploy`
- `vatrushka-rollback`
- `vatrushka-observability-deploy`
- `vatrushka-runtime-status`
- `vatrushka-publish-updater`

Every wrapper validates an allowlisted manifest path and root-owned checksum, runs with `set -eu`, emits no secret, keeps an audit line with release ID and result, and rejects arbitrary shell arguments. The scripts in `bin/` are the versioned source; `install.sh` is the only supported installer.

CI uploads a candidate manifest and its gzip source archive only to `/var/lib/vatrushka/inbox/`. The archive file name is `<sourceArchiveSha256>.tar.gz`. `vatrushka-preflight` is the fixed privileged importer: it validates deploy-user-owned regular files, validates the archive contents and checksum, copies the manifest and archive to separate content-addressed root-owned stores, validates the candidate contract and prints the canonical manifest path. `vatrushka-deploy` accepts only this canonical path. No CI user can write directly to either protected store.

`drivers/compose-digest-deploy` is installed root-owned by `install.sh`, but cannot act until an operator creates `/etc/vatrushka/runtime.env` from `runtime.env.example`, root-owned registry credentials under its configured directory and `/etc/vatrushka/app.env`. The driver extracts only the preflight-validated source archive into a root-owned release directory, verifies its source and lock checksums, atomically updates the configured `current` symlink, pulls the exact API digest and invokes Compose with `--no-build`. It rejects manual-review migrations. Missing or unsafe configuration fails closed.

The thin wrappers are intentionally not deploy drivers. `vatrushka-deploy` invokes the installed immutable delivery driver and `vatrushka-runtime-status` invokes a root-owned readiness driver. A successful deploy records the active candidate checksum and, where a previous candidate exists, creates a root-owned rollback manifest that references only that prior candidate. `vatrushka-rollback` can therefore restore only a previously verified immutable candidate and never executes a schema down migration. `vatrushka-observability-deploy` starts only the checksum-bound product telemetry agent after the matching application candidate is active; it never provides arbitrary Docker or shell access.

`vatrushka-publish-updater` imports only a deploy-user-owned checksum manifest and the matching stable installer, blockmap, `latest.yml`, metadata and checksum files from the inbox. It atomically places `latest.yml` last in `/opt/vatrushka/updates`; CI never receives write access to the stable feed directory.

Before enabling a host in CI, an operator runs `/usr/local/lib/vatrushka/verify-host-bootstrap --deploy-user vatrushka_deploy --environment staging` (or `production`) as root. It prints only readiness metadata and validates the wrapper installation, least-privilege deploy account, root-owned runtime/app environment files and registry credential directory; it never displays their contents.

`vatrushka_deploy` receives sudo for the four product wrappers only after this installer is run by an operator. The observer needs a distinct account and its own limited sudoers file; it is not granted through this installer. Its fixed readiness wrapper is versioned in `ops/observer-wrappers/`.

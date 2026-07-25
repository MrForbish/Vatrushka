# Rollback plan

Метки: **fact**, **inference**, **assumption**, **unknown**, **proposal**.

- **fact:** today there is no protected `rollback_production` job.
- **proposal:** every promotable stable candidate creates a rollback manifest referring to the last known-good, immutable image digests and desktop updater metadata.
- **proposal:** `rollback_production` will be a single protected manual GitLab job available only from a verified tag/release flow. It verifies the rollback manifest, invokes `vatrushka-rollback`, then runs readiness, smoke and observability checks.
- **proposal:** rollback never performs automatic destructive database down migrations. Only backward-compatible migrations can accompany automatic application rollback.
- **proposal:** the stable updater manifest stays unchanged until verification passes; a client rollback is an explicit, audited publication of a previously verified stable feed.
- **unknown:** current backup restore evidence and application migration compatibility matrix.

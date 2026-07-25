# Rollback gap

Labels: **fact**, **inference**, **assumption**, **unknown**, **proposal**.

- **fact:** the runtime driver preserves a checksum-verified rollback manifest before replacing an active candidate. The rollback wrapper accepts only that root-owned manifest and redeploys its recorded image digest.
- **fact:** `rollback-production-runtime` is an optional manual protected-tag job. It can run only after a production deployment has produced the corresponding rollback manifest, and it performs runtime status verification afterward.
- **fact:** the rollback path does not execute a schema down migration.
- **inference:** an application rollback is safe only for migrations declared `none` or `backward-compatible` in the candidate manifest.
- **fact (2026-07-25):** a root-only encrypted PostgreSQL backup wrapper, offline `age` recovery key, checksum manifest, protected S3 destination and 14-day/56-day retention are in place. The timer is intentionally disabled until runtime and recovery evidence exist.
- **fact (2026-07-25):** every protected tag invokes the fixed backup wrapper before the manual runtime deployment gate. The first deployment receives a distinct `backup=not-required` result only when no active runtime exists; a malformed active runtime or backup failure blocks promotion.
- **unknown:** isolated restore drill evidence.
- **proposal:** perform an isolated restore drill before the first traffic cutover. Abort production migration if a required migration is not backward compatible.

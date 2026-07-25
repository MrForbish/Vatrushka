# Production PostgreSQL backup and restore

Labels: **fact**, **inference**, **assumption**, **unknown**, **proposal**.

## Implemented boundary

- **fact:** `vatrushka-postgresql-backup` is a root-owned, no-argument wrapper. The transport-only deploy account may invoke only this fixed sudo command; it receives neither a root shell nor backup credentials.
- **fact:** the driver takes a custom-format, compressed `pg_dump` from the production Compose PostgreSQL service, encrypts it with the configured public `age` recipient, calculates SHA-256, then uploads the encrypted dump before its manifest.
- **fact:** a root-only systemd timer schedules the backup daily at 03:17 UTC with a bounded random delay. Sunday backups are also copied to the weekly prefix.
- **fact:** temporary plaintext and encrypted files are stored in a root-only workspace and removed on completion or failure.
- **fact:** the wrapper is installed but not enabled automatically. It fails closed until `/etc/vatrushka/backup.env` and its local dependencies are present.
- **fact (2026-07-25):** the wrapper, driver and disabled systemd timer are installed on `vtr-prod-1`; the host bootstrap verifier and systemd unit validation passed after installation. `age` and the Ubuntu system `python3-boto3` module are installed.
- **fact (2026-07-25):** `/etc/vatrushka/backup.env` is present and was validated without reading or printing its values. The configured backup identity passed a `head bucket` plus write/read/delete probe against `backups-vatrushka`; the probe object was deleted immediately.
- **fact (2026-07-25):** the bucket has two enabled lifecycle rules: `vatrushka/postgresql/daily/*` expires after 14 days and `vatrushka/postgresql/weekly/*` after 56 days.

## Activation checklist

1. **fact:** the existing dedicated `backup-user` is assigned to the private `backups-vatrushka` bucket. Its key is the only S3 credential placed in the backup configuration.
2. **fact:** the recovery key was generated offline. Only its public recipient is present in `/etc/vatrushka/backup.env`; the private key is outside the VPS and GitLab.
3. **fact:** the supported Ubuntu `age` package and system `python3-boto3` module are used; an unpinned AWS CLI download is not required.
4. **fact:** the configured lifecycle retains daily backups for 14 days and weekly backups for 56 days.
5. **proposal:** after the immutable production runtime is active, perform one encrypted backup and a separate isolated restore drill. Enable the timer only after that evidence passes.
5. **proposal:** run one manual backup and restore it in an isolated PostgreSQL instance. Record only the backup ID, checksum and restore outcome in the delivery evidence.
6. **proposal:** after restore evidence is accepted, enable `vatrushka-postgresql-backup.timer`.

## Restore boundary

- **fact:** restore is intentionally not an automated production wrapper: it is a destructive, operator-approved action and requires the offline `age` recovery key.
- **proposal:** perform restore tests only in an isolated Docker PostgreSQL instance with a new volume. Do not automatically run a schema downgrade or replace a live production database.

## Remaining unknowns

- **unknown:** whether the backup identity is restricted from media and log prefixes; this must be reviewed in the S3 access policy without exposing credentials.
- **unknown:** capacity metrics and alerting availability for the `backups-vatrushka` bucket through the selected provider/API.

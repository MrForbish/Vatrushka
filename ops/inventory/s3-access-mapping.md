# S3 access mapping

Метки: **fact**, **inference**, **assumption**, **unknown**, **proposal**.

| Credential role | Allowed bucket | Writer | Forbidden access |
| --- | --- | --- | --- |
| `media-prod-key` | `media-vatrushka` | production API | staging media, logs, backups |
| `media-staging-key` | `media-staging-vatrushka` | staging API | production media, logs, backups |
| `loki-logs-key` | `logs-vatrushka` | Observer Loki only | both media buckets, backups |
| `backup-prod-key` | `backups` | root-owned production backup wrapper | application, staging, Loki |

- **fact:** current documentation identifies production media and Loki log storage, but the live policies were not read.
- **assumption:** separate service credentials can be issued by the object-storage provider.
- **unknown:** encryption, lifecycle, versioning, capacity and recovery policy of every bucket.
- **proposal:** configure credentials only as protected, environment-scoped file variables or host secrets; never add credentials or bucket URLs with embedded credentials to a manifest, artifact or repository file.

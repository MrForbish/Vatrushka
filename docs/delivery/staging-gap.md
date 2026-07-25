# Staging and client-channel gap

Метки: **fact**, **inference**, **assumption**, **unknown**, **proposal**.

- **fact:** `npm run dev:desktop` exists and updater disables itself in development; its default is local Vite proxy, not staging.
- **fact:** no active staging VPS, staging API, beta updater feed or prerelease package job exists. The manual staging candidate job and a root-owned runtime readiness check are wired, but cannot be run until the isolated host and CI variables are provisioned.
- **fact:** stable package uses production API and protected SemVer tag flow.
- **inference:** current beta/RC separation required by the ТЗ is absent.
- **assumption:** staging VPS will be available only after the current production VPS has been safely migrated, observed and then reinstalled.
- **unknown:** staging DNS names and tester distribution policy.
- **proposal:** explicit beta build from `develop` only for desktop/shared changes, only after staging readiness/smoke/Observer verification; RC only from `release/X.Y.Z`; stable only protected `vX.Y.Z`.

# Current delivery audit

Дата: 2026-07-24. Метки: **fact**, **inference**, **assumption**, **unknown**, **proposal**.

- **fact:** canonical remote — GitLab; `develop` default branch; `main`, `develop`, `release/*` и `v*` protected.
- **fact:** `v0.8.21` и pipeline `2701829000` успешны; Release содержит installer, blockmap, `latest.yml`, checksums и metadata.
- **fact:** production tag flow: archive → product runtime → Observer → Windows package → updater publish; `latest.yml` заменяется последним.
- **fact:** current GitLab pipeline has no staging environment/job, beta feed/job, RC channel or `rollback_production` job.
- **inference:** stable clients are not exposed before the current API and observability health gates, but the flow still rebuilds the Windows client after production deploy.
- **assumption:** the former production host can become an isolated staging target only after a successful production migration and OS reinstall, without reusing production credentials.
- **unknown:** live host capacity, networks, bucket policies, backup/restore evidence and SSH user inventory.
- **proposal:** introduce staging and immutable promotion in separate MRs after the prerequisite inventory/access evidence.

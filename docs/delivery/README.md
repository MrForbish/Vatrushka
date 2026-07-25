# Delivery audit, inventory and implementation plan

Все файлы каталога используют пять обязательных меток: **fact**, **inference**, **assumption**, **unknown**, **proposal**. Аудит выполнен 2026-07-24 только по репозиторию и GitLab API read-only: значения secrets, VPS, DNS, S3 и SSH не читались.

## Подтверждённые решения

- **fact:** Максим подтвердил целевой RC flow из `release/X.Y.Z`, несмотря на отличие от текущего компактного процесса.
- **fact:** current VPS remains production until the new production runtime is migrated and verified; it must not be repurposed yet.
- **unknown:** доступ к новому production VPS ещё не предоставлен; он не нужен для этого MR.
- **proposal:** next implementation step is a redacted inventory/access audit for the new production VPS; staging is prepared only after the production migration and observation window.

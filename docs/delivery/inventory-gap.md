# Inventory gap

Метки: **fact**, **inference**, **assumption**, **unknown**, **proposal**.

- **fact:** repository has product Compose, separate self-hosted LiveKit Compose, observer platform/agent Compose, Linux project runner and Windows project runner.
- **fact:** `ops/inventory/` now contains a redacted host schema, role records and a private-network matrix; it contains no live credentials or private keys.
- **fact:** staging remains tracked as `planned`; no staging runtime or deploy identity is active yet.
- **inference:** the redacted inventory is sufficient for delivery planning, but not for activation until the final host identity and private route are verified.
- **assumption:** current production VPS can become staging only after new production migration succeeds, as the ТЗ states.
- **fact (2026-07-25):** new production VPS `vtr-prod-1` has Ubuntu 24.04.4 LTS, 8 vCPU, 11 GiB RAM and 94 GB free disk. Docker is installed, but no product container or public application listener is running.
- **fact (2026-07-25):** the legacy production host still runs the Vatrushka API, Caddy, PostgreSQL, Redis and LiveKit. It also has legacy product-observability agent containers repeatedly restarting, so it is not a clean staging base and must not be repurposed before the planned OS reinstall.
- **fact (2026-07-25):** legacy host accounts are `codex` (Docker group, no passwordless sudo observed), `admin` (sudo group) and `vatrushka-deploy`; their removal is deferred until the production migration and staging reimage.
- **unknown:** private CIDRs, provider firewall, Zabbix ownership and allowed peers.
- **proposal:** add versioned, redacted inventory schema; never store passwords, private keys, raw IPs not intended for repository exposure, or `.env` values.

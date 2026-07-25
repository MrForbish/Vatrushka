# Observability gap

Labels: **fact**, **inference**, **assumption**, **unknown**, **proposal**.

- **fact:** the Observer runs Grafana, Prometheus, Loki, Alertmanager, Blackbox and Alloy. Its health endpoints for Grafana, Prometheus and Loki passed through the fixed read-only verification wrapper.
- **fact:** production tag delivery runs Observer verification automatically after the single manual production deployment approval and before stable updater publication.
- **fact:** product and runner Alloy configurations exist; labels include the environment where configuration provides it.
- **fact (2026-07-25):** the private production-to-Observer route is reachable in both directions. A root-only, checksum-bound product agent configuration is installed; its first live ingestion evidence is intentionally deferred until the immutable runtime exists.
- **unknown:** first live ingestion from the new production runtime, staging probe address, alert receiver and retention capacity.
- **fact (2026-07-25):** the new production host has a verified private WireGuard route to Observer. Product telemetry is not expected until its runtime and Alloy agent are activated.
- **proposal:** verify ingestion with `environment=production|staging`, and make staging alerting dashboard-only before adding external routing.

# Private-network matrix

Метки: **fact**, **inference**, **assumption**, **unknown**, **proposal**.

| Source | Destination | Required purpose | Transport | State |
| --- | --- | --- | --- | --- |
| Linux Runner | Production | wrapper-only deployment | SSH with pinned host key | **proposal** |
| Linux Runner | Staging | wrapper-only deployment | SSH with pinned host key | **proposal** |
| Production | Observer | metrics and logs | private WireGuard route | **fact (2026-07-25):** provisioned for the new production host; connectivity is verified while the legacy production peer remains intact. |
| Staging | Observer | metrics and logs | private WireGuard route | **proposal** |
| Linux Runner | Observer | runner metrics and logs | private WireGuard route | **proposal** |
| Operator | Observer | Grafana administration | VPN or SSH tunnel | **proposal** |
| Public clients | Production | API, WebSocket, LiveKit/TURN | HTTPS/WSS and approved UDP/TCP media ports | **fact** for current production topology |

- **fact:** the current product deployment reaches Observer by proxying SSH through the production host.
- **inference:** that path unnecessarily couples product and observer access.
- **fact (2026-07-25):** the new production host and Observer have a dedicated point-to-point WireGuard route. Its private addresses and peer material are intentionally not stored in Git. The legacy production peer remains present until traffic migration is complete.
- **unknown:** provider firewall groups, public IP allocation and DNS ownership.
- **proposal:** replace the production-to-Observer SSH hop with direct private-network observability traffic. Do not expose Prometheus, Loki or Grafana publicly without a separately approved access policy.

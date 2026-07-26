# Documentation inventory

| Class | Status | Evidence and action |
| --- | --- | --- |
| Canonical product/technical/testing/security/release specifications | active | Referenced by `AGENTS.md`; preserve. |
| ADRs under `docs/adr/` | historical-record | Architecture decisions including settings, updater, presence, messaging and LiveKit; preserve. |
| `docs/delivery/*` | active/historical-record | Current delivery plans plus audit and rollback evidence; preserve and keep index in `docs/delivery/README.md`. |
| Observability runbooks/architecture | active | Used by deployed monitoring and operational validation; preserve. |
| ignored local Codex package | user-owned | Not a canonical repository source; do not delete or rewrite in this audit. |

No document is marked `dead-confirmed`: deletion requires duplicate proof, no inbound links, no ADR/release/audit role, and a replacement reference.

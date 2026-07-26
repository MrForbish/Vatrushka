# Repository cleanup inventory

Status: audit-only. No files, branches, worktrees, dependencies, migrations, or deployment resources were deleted.

## Scope evidence

- `git ls-files` reports 593 tracked paths; 95 are under `docs/`.
- `git worktree list --porcelain` reports 69 worktrees.
- Root checkout contains uncommitted and untracked material outside this audit worktree; it is classified `user-owned` and was not touched.
- `vatrushka_codex_package/` is ignored by `.gitignore`; its local contents are classified `user-owned` unless separately imported into a canonical document.

## Candidates

| ID | Category | Path/name | Status | Evidence | Risk | Proposed action |
| --- | --- | --- | --- | --- | --- | --- |
| RC-01 | worktree | historical `assemble/*`, `release/*`, `hotfix/*` worktrees | unknown | 69 registered worktrees, many branches are stale or have gone upstream | high | Classify each worktree against its MR/release ownership before removal. |
| RC-02 | documentation | legacy instructions outside `docs/` | dead-candidate | 95 canonical docs and `docs/delivery/README.md` exist; root untracked packs are ignored | medium | Link or mark historical; do not delete without inbound-link audit. |
| RC-03 | artifacts | `apps/desktop/release-latest/` and local build outputs | user-owned | ignored build/release paths; no Git ownership | medium | Keep outside cleanup scope. |
| RC-04 | code | legacy messaging/attachment compatibility paths | compatibility | canonical messaging service, ports, DB schema, migration script and tests reference the paths | critical | Preserve until documented adoption/rollback gate. |
| RC-05 | tests | `MemoryStore` and fake media/mail/storage | active | referenced from API unit tests; integration tests separately exercise PostgreSQL/Redis | medium | Preserve. |

## Gate

No `dead-confirmed` code or dependency candidate is established by this audit. The next cleanup MR must name a single candidate, show runtime/build/test/CI/ops searches, and preserve rollback evidence.

# Repository cleanup MR plan

1. **Audit (this MR):** add inventories only; no deletion.
2. **Worktree cleanup:** one reviewed batch of individually qualified clean stale worktrees, using Git worktree commands only.
3. **Documentation hygiene:** mark historical material or consolidate proven duplicates; preserve ADR/release/audit evidence.
4. **Code/dependency cleanup:** one bounded candidate per MR with all consumers migrated and targeted verification.

Each implementation MR must include: classification, evidence, affected contracts/ADRs, rollback, pre/post removal checks and explicit statement of whether Maxim approval is required.

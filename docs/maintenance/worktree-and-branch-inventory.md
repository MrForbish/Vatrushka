# Worktree and branch inventory

## Fact

The repository currently has 69 registered worktrees. The canonical working checkout is dirty and contains user-owned reference packs and generated artifacts. This audit worktree is clean and isolated on `chore/repository-cleanup-audit`.

## Classification

- `develop`, `main`, active `release/*` and `hotfix/*`: `active`; never remove here.
- Worktrees with an open MR, unpushed commit, lock, untracked content, or activity within 14 days: `unknown`; preserve.
- Worktrees whose upstream is gone are only `dead-candidate`; a gone upstream alone is not removal proof.

## Cleanup procedure

For each candidate: confirm not locked, clean, no untracked/user-owned files, no unpushed commits, no open MR/release/hotfix owner, merged/gone branch, no runtime dependency, and activity older than 14 days. Then use `git worktree remove` followed by `git worktree prune`; never delete directories directly.

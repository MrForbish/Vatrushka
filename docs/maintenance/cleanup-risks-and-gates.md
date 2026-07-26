# Cleanup risks and gates

| Risk | Classification | Gate |
| --- | --- | --- |
| Delete compatibility messaging data/path | critical | Migration adoption, backup/rollback proof and explicit approval. |
| Delete LiveKit/realtime/IPC/auth code | critical | Governing ADR, cross-process tests and explicit bounded plan. |
| Delete user-owned local packs/artifacts | high | Never in a repository cleanup MR. |
| Remove stale worktree | high | All conditions in `worktree-and-branch-inventory.md`. |
| Remove dependency | medium | Dedicated package-manager MR and regenerated lockfile. |
| Remove CSS/component/test | medium | Consumer search plus Storybook/visual/behavior verification. |

The audit intentionally makes no production, staging, VPS, DNS, GitLab variable, S3, SSH, CI/CD, migration, branch or worktree mutations.

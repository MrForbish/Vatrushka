# Vatrushka repository rules

These rules apply to every change in this repository.

## Canonical platform

- Use `git@gitlab.com:vatrushka-group/Vatrushka.git` for Git, Merge Requests, CI/CD, artifacts, and Releases.
- Treat GitHub as read-only historical storage.
- Follow `docs/release-process.md` and run `scripts/policy/merge-request-policy.mjs` through `npm run repo-policy:test`.

## Branch and merge policy

- Ticketed work: `feat/WEB-<number>-<description>` or `fix/WEB-<number>-<description>` → `develop`, squash.
- Unticketed work: `chore/*`, `refactor/*`, `test/*`, or `docs/*` → `develop`, squash.
- Release: `develop` → `main` with `[RELEASE]` title, merge commit.
- Hotfix: `hotfix/X.Y.Z-*` → `main`, merge commit.
- Sync: `main` → `develop` only after a hotfix, merge commit.
- Never create an unticketed `feat/*` or `fix/*`. Never merge a task branch directly to `main`.
- Do not create a new branch/MR for a failed pre-merge pipeline; fix the existing source branch. Increment the patch version only after an immutable tag has already been pushed.
- Immediately set and read back `squash=false` through the GitLab API for release, hotfix, and sync MRs. Never rely on the UI default. Merge with the full source SHA and verify `squash_commit_sha` is absent.

## GitLab delivery safety

- Read the exact failed job trace before editing CI or credentials.
- Use `GLAB_ENABLE_CI_AUTOLOGIN=true` for `glab` in CI. Never assign `CI_JOB_TOKEN` to `GITLAB_TOKEN`.
- A merge request targeting `main` must pass `release-auth-smoke` before merge/tag creation.
- Do not create PAT/project/group tokens unless the built-in job token cannot serve a documented endpoint and the user explicitly authorizes the additional secret.
- Never print or commit secrets, runner tokens, CI variable values, credential-store data, production `.env`, or temporary auth files.
- Validate `npm run version:check`, `npm run repo-policy:test`, lint, typecheck, GitLab CI lint, and `git diff --check` before merge.
- Verify UTF-8 MR text, required migration/rollback/release evidence, target branch, title prefix, and squash setting.
- Do not overwrite tags or Releases. After successful production publication, verify API readiness, monitoring health and updater assets. Perform `[SYNC] main → develop` only after a hotfix.

## Workspace safety

- Preserve user-owned untracked reference packs and build outputs unless explicitly asked to remove them.
- Do not include temporary MR descriptions, generated installers, local caches, or secrets in commits.

# Windows visual baseline recovery, 2026-09-28

The resumed MR !215 pipeline [2889508841](https://gitlab.com/vatrushka-group/Vatrushka/-/pipelines/2889508841) passed policy, application verification and desktop behavior, but its visual job failed 42 of 47 scenarios.

Evidence before updating snapshots:

- The renderer, Storybook configuration, visual scenarios, Playwright configuration and dependency lockfile are identical to released `v0.8.38` (`06e2c50`). The refresh change only affects Electron main IPC.
- The same failures reproduce locally with the pinned dependencies: foundations has 1,983 differing pixels; app-shell desktop has 4,604. Layout dimensions remain 1440x900 in both expected and actual.
- The foundations reference still contains the old `#07111b` canvas, whereas released `tokens.css` uses `#090a0f`. Other recent references have the current palette but differences around text rasterization on the resumed Windows runner. The precise system-level cause of rasterization changes is not established.
- Actual renders were visually inspected across all failed scenarios, including full-size foundations, shell and Home. No renderer change or screenshot tolerance increase is included in this correction.

Only changed references were regenerated through `playwright test --config=playwright.storybook.config.ts --update-snapshots=changed`. A separate run without snapshot updates passed all 47 scenarios. Existing assertions, viewport contracts and per-scenario tolerances remain unchanged; GitLab must repeat the full visual gate before merge.

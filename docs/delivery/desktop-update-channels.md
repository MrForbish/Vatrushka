# Desktop delivery channels

Status labels: **fact** describes the code in this repository; **proposal** requires infrastructure activation.

## Packaging contract

- **fact:** `apps/desktop/scripts/desktop-delivery-config.mjs` validates the API origin, updater feed path, channel and version before `electron-builder` runs.
- **fact:** `stable` uses production SemVer and `/updates`; `beta` uses `X.Y.Z-beta.<CI_PIPELINE_IID>` and `/updates/beta`; `rc` uses `X.Y.Z-rc.<CI_PIPELINE_IID>` and `/updates/rc`.
- **fact:** local dev and portable packages do not use the updater. RC packages also disable updater checks, so they cannot accidentally read either beta or stable feeds.
- **fact:** the package script passes the validated feed and version directly to `electron-builder`; it does not read CI secrets.

## Activation order

1. **proposal:** provision staging and its isolated API, media, database, Redis and beta update directory.
2. **proposal:** add protected staging CI variables for the pinned staging SSH host key and deploy identity.
3. **proposal:** enable the develop candidate deployment and post-deploy readiness/smoke/observability evidence.
4. **proposal:** enable the Windows beta job only after step 3. It must upload installer and blockmap before atomically publishing `updates/beta/latest.yml`.
5. **proposal:** build RC only from `release/X.Y.Z`; retain it as immutable QA evidence and never publish it to beta or stable.
6. **proposal:** publish stable `latest.yml` only after the protected production approval, deployment, smoke and observability verification complete.

The beta/stable transition remains an explicit tester reinstall until a separately approved in-app channel selector exists.

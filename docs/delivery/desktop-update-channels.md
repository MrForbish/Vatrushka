# Desktop delivery channels

Status labels: **fact** describes the code and configured staging delivery path; **proposal** requires a separate product decision.

## Packaging contract

- **fact:** `apps/desktop/scripts/desktop-delivery-config.mjs` validates the API origin, updater feed path, channel and version before `electron-builder` runs.
- **fact:** `stable` uses production SemVer and `/updates`; `beta` uses `X.Y.Z-beta.<CI_PIPELINE_IID>` and `/updates/beta`; `rc` uses `X.Y.Z-rc.<CI_PIPELINE_IID>` and `/updates/rc`.
- **fact:** local dev and portable packages do not use the updater. RC packages also disable updater checks, so they cannot accidentally read either beta or stable feeds.
- **fact:** the package script passes the validated feed and version directly to `electron-builder`; it does not read CI secrets.
- **fact:** a `develop` pipeline builds and publishes a beta NSIS installer only when desktop code, shared client contracts or the Windows packaging recipe changes. It embeds the staging API and can read only `https://api-staging.myvatrushka.ru/updates/beta`.
- **fact:** beta publication waits for the matching staging runtime deployment and uses the root-owned updater wrapper. The wrapper checks every checksum and writes beta `latest.yml` last under `/opt/vatrushka/updates/beta`.

## Activation order

1. **fact:** staging has an isolated API/runtime candidate path and a protected deploy identity.
2. **fact:** the beta job publishes installer and blockmap before atomically publishing `updates/beta/latest.yml`.
3. **proposal:** build RC only from `release/X.Y.Z`; retain it as immutable QA evidence and never publish it to beta or stable.
4. **fact:** stable `latest.yml` is published only after protected production deployment and observability verification complete.

The beta/stable transition remains an explicit tester reinstall until a separately approved in-app channel selector exists.

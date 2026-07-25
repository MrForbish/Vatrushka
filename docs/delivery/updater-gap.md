# Updater gap

Labels: **fact**, **inference**, **assumption**, **unknown**, **proposal**.

- **fact:** local development disables automatic updates. Stable packaging uses the production API and the protected `vX.Y.Z` tag flow.
- **fact:** protected `main` creates a checksum-bound immutable Windows package-registry artifact. A stable tag downloads that artifact by its exact commit SHA rather than rebuilding it. The root-owned `vatrushka-publish-updater` wrapper writes non-manifest files before `latest.yml`.
- **fact:** the wrapper accepts only a checksum-bound inbox manifest and a fixed `/opt/vatrushka/updates` feed directory. Its production bootstrap boundary is verified.
- **fact:** beta and RC configuration validation exists, but neither beta feed nor RC feed is active.
- **unknown:** signing certificate rotation policy and a completed production upgrade drill.
- **proposal:** after staging exists, publish beta only for desktop/shared client-contract changes and only after staging verification. Keep RC artifact-only until a separate RC-feed decision is approved.

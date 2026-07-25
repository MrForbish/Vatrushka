# Tag delivery order

Labels: **fact**, **inference**, **assumption**, **unknown**, **proposal**.

- **fact:** the API image is built and pushed by the immutable image job on `develop` and on the protected production branch; it is addressed by the merge commit SHA.
- **fact:** the protected tag pipeline only resolves that pre-existing image to a registry digest. It does not rebuild the API image.
- **fact:** `windows-production-package` belongs to the `package` stage, before the manual production deployment gate, and depends only on tag verification.
- **fact:** `deploy-production-runtime` uploads the checksum-bound source archive and candidate manifest to the production inbox, then invokes only the root-owned `vatrushka-preflight`, `vatrushka-deploy` and `vatrushka-runtime-status` wrappers through the least-privilege deploy account.
- **fact:** `publish-production` waits for the package artifact, the manually approved product runtime deployment and direct Observer verification before publishing the stable updater manifest.
- **fact:** the stable updater feed remains the exposure gate: package artifacts alone are not visible to installed clients.
- **inference:** an installer can be inspected before any production runtime change while retaining the no-early-client-exposure behavior.
- **unknown:** immutable Windows installer promotion is still tag-time packaging; it is intentionally kept separate from API-image promotion until the beta/RC channels are implemented.
- **proposal:** before creating a protected stable tag, wait for the production-branch immutable image job for the same merge SHA to finish successfully. The tag resolver is fail-closed if that image is absent.

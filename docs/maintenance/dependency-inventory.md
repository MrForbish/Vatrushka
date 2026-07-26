# Dependency inventory

## Fact

The root package is a private npm workspace with five workspace manifests. Root dependencies are development tooling; runtime dependency ownership resides in the API, desktop and shared workspace manifests.

## Status

No dependency is `dead-confirmed`. `npm ls`, source imports, package scripts, CI jobs and packaging must all agree before a direct dependency can be removed. Transitive lockfile entries must never be edited manually.

## Future removal gate

Use the package manager to remove one direct dependency in a dedicated MR, regenerate the lockfile, run affected workspace build/typecheck/test and verify CI/package paths.

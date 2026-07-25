# Delivery manifest contract

A candidate manifest is immutable JSON containing release SHA, source archive checksum, dependency-lock checksum, OCI image digests, migration metadata, desktop artifact checksums, updater channel and intended API environment. A rollback manifest references only a previously verified candidate manifest and compatible image digests.

Manifest files contain no token, password, private key, S3 credential, full database URL or raw user data. The production promotion job must consume a manifest; it must not rebuild from a mutable branch.

`scripts/delivery/create-candidate-manifest.mjs` is the only initial writer: it hashes a source archive and dependency-lock file locally, validates image digests and writes once with exclusive creation. The job wiring will be introduced only with the staging/promotion pipeline; this script never contacts a host, registry or updater feed.

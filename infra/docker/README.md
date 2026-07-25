# Runtime image contract

`docker-compose.yml` supports two intentionally separate modes:

- local development: `API_IMAGE` is unset, so Compose builds the API from the checked-out source;
- controlled delivery: a root-owned wrapper supplies `API_IMAGE` as a fully qualified OCI image reference with an immutable `@sha256:...` digest and runs Compose with `--no-build`.

The runtime `.env` must not contain registry credentials. The future deployment driver will read the registry repository and environment policy from a root-owned configuration file, authenticate Docker through an operator-provisioned read-only credential, validate the candidate manifest, and then provide the digest through a transient process environment.

This compatibility layer does not enable deployments by itself. The wrapper remains fail-closed until the driver, registry credential provisioning, backup/rollback evidence and staging preflight are implemented.

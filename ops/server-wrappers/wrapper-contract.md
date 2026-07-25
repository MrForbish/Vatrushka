# Wrapper invocation contract

Each runtime wrapper accepts exactly one absolute manifest path below
`/var/lib/vatrushka/manifests/` and no arbitrary shell fragment.

| Wrapper | Accepts | Must verify | Must not do |
| --- | --- | --- | --- |
| `vatrushka-preflight` | candidate manifest | checksum, image digest availability, disk/network prerequisites | mutate runtime |
| `vatrushka-deploy` | candidate manifest | signed/verified manifest, allowed environment, compatible migration metadata | build from source, use branch names |
| `vatrushka-rollback` | rollback manifest | previous root-owned candidate reference, manifest checksums and migration compatibility | run destructive schema down migration |
| `vatrushka-runtime-status` | no arguments | readiness and expected release identity | disclose credentials |
| `vatrushka-production-readiness` | no arguments | root-owned production environment, dedicated media S3 contract and trusted TURN certificate | accept paths, shell fragments or configuration values; start containers |
| `vatrushka-postgresql-backup` | no arguments | root-owned runtime and backup configuration, encrypted artifact checksum before upload; `runtime-inactive` reference result before first deploy | accept paths, shell fragments or CI arguments; expose backup credentials |
| `vatrushka-observability-deploy` | observer manifest | configuration checksum and environment | deploy product workload |

**proposal:** wrappers must be root-owned (`0750`), deploy users cannot edit their directory, and audit records contain only timestamp, wrapper name, release ID, commit SHA, outcome and exit code.

# New production VPS — read-only preflight

Дата: 2026-07-24. Первичная проверка выполнена без установки, удаления, запуска или остановки сервисов. После явного подтверждения владельца на хосте включён только ключевой SSH-доступ.

## Fact

- hostname: `vtr-prod-1`; Ubuntu 24.04.4 LTS, kernel `6.8.0-136-generic`.
- capacity: 8 vCPU, 11 GiB RAM available to the guest, 100 GB disk (94 GB free on `/`).
- Docker Engine `29.1.3` and Docker Compose `2.40.3` are installed for the future immutable runtime; Docker and containerd are active, but no containers or product services are running.
- only SSH (`22/tcp`) and Zabbix Agent (`10050/tcp`) listen on non-loopback interfaces.
- no product API, PostgreSQL, Redis, LiveKit, reverse proxy or observability platform service was found running.
- SSH: root access is key-only (`PermitRootLogin prohibit-password`); password and keyboard-interactive authentication are disabled; public-key authentication is enabled.
- `vatrushka_deploy` is an independent account with neither broad sudo permission nor Docker-group membership.
- Root-owned runtime directories were prepared at `/opt/vatrushka`, `/var/lib/vatrushka/{manifests,runtime}` and `/usr/local/lib/vatrushka`; the deploy account can write only `/var/lib/vatrushka/inbox`.
- **fact (2026-07-25):** a newly generated dedicated GitLab delivery key was verified in `vatrushka_deploy`'s `authorized_keys`; the prior CI key was revoked from this account. The account remains outside the Docker group.
- **fact (2026-07-25):** the reviewed root-owned wrapper set and narrow `sudoers` allowlist were installed. The deploy account can invoke only preflight, deploy, rollback and runtime-status wrappers; it cannot invoke a shell or Docker directly.
- **fact (2026-07-25):** the existing production application environment was transferred through an encrypted SSH stream to root-owned `/etc/vatrushka/app.env` on the new host. Its values were not inspected, printed or committed. Root-owned `/etc/vatrushka/runtime.env` now declares the production runtime paths and image repository.
- **fact (2026-07-25):** no product containers, DNS records, LiveKit service, database, Redis instance or updater feed were changed on the new host during bootstrap.
- **fact (2026-07-25):** UFW is inactive, no WireGuard interface is configured and the host currently exposes only SSH and the provider-managed Zabbix Agent on non-loopback interfaces. Docker has no application networks or containers.
- **fact (2026-07-25):** SSH remains public-key only; root is key-only break-glass access, while `vatrushka_deploy` is the transport-only CI identity.
- **fact (2026-07-25):** a project-scoped GitLab deploy token with only `read_registry` was created for this production host. Its Docker config is root-owned (`0600`) in `/etc/vatrushka/registry`; the token value was not recorded in Git or command output. The token expires on 2027-07-25.
- **fact (2026-07-25):** the bootstrap verifier now succeeds for the production deploy account. Runtime status continues to fail closed because no immutable candidate has been deployed yet.
- **fact (2026-07-25):** protected GitLab production variables now point to this host, its pinned host key and the dedicated delivery key. The variable set contains no root credential.

## Inference

- the host is suitable as a clean target for the production migration described in `docs/delivery/migration-plan.md`.
- root key-only SSH and a publicly listening Zabbix Agent still require a dedicated non-root deploy path and an intentional firewall decision before production traffic.

## Assumption

- the active Zabbix Agent is provider or operator managed; it must not be disabled until its ownership and allowed server addresses are confirmed.

## Unknown

- provider firewall rules, Zabbix server allowlist/configuration, private-network/WireGuard peers, DNS ownership, S3 credentials, backup destination and production traffic window.
- **unknown:** provider firewall ownership/controls and approved peer addresses for Zabbix, SSH administration and the future private Observer path. No firewall policy was changed during this check.

## Proposal

1. Install root-owned wrapper commands and narrow sudo only after the wrapper implementation is reviewed.
3. Verify pinned SSH host key through GitLab protected file variable before CI access.
4. Keep root as a key-only break-glass path until the non-root operational path is tested; then narrow root exposure further only with a documented recovery path.
5. Apply firewall and Zabbix allowlist changes only after provider/network ownership is confirmed.
6. Rotate the protected, read-only registry deploy credential before its expiry date; do not use a personal GitLab token as a durable production registry credential.

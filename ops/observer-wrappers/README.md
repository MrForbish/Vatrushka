# Observer deployment wrapper

`vatrushka_observer_deploy` is a separate, key-only GitLab CI account for the Observer VPS. It is not a production application deploy account and cannot use a shell, Docker, Compose or arbitrary `sudo` command.

The root-owned `vatrushka-observability-verify production` wrapper is the only current CI entry point. It verifies the fixed Observer Compose project and Grafana, Prometheus and Loki readiness through private host bindings. It does not change configuration or restart containers.

Install as root only:

```sh
install -d -m 700 -o vatrushka_observer_deploy -g vatrushka_observer_deploy /home/vatrushka_observer_deploy/.ssh
install -m 600 -o vatrushka_observer_deploy -g vatrushka_observer_deploy /dev/null /home/vatrushka_observer_deploy/.ssh/authorized_keys
# Append only the dedicated GitLab CI public key to authorized_keys.
./ops/observer-wrappers/install.sh --deploy-user vatrushka_observer_deploy
sudo -u vatrushka_observer_deploy sudo -n /usr/local/lib/vatrushka/vatrushka-observability-verify production
```

Do not replace the fixed wrapper with `sudo sh`, Docker-group membership or passwordless `ALL`.

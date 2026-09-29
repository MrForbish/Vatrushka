# Обертка развертывания наблюдателя

`vatrushka_observer_deploy` является отдельной учетной записью только с ключом GitLab CI для Наблюдателя VPS. Это не учетная запись для развертывания приложения production и она не может использовать оболочку, Docker, Compose или произвольные команды `sudo`.

Обертка `vatrushka-observability-verify production`, принадлежащая root, является единственной текущей точкой входа CI. Она проверяет фиксированный проект Observer Compose и готовность Grafana, Prometheus и Loki через приватные привязки хоста. Она не изменяет конфигурацию и не перезапускает контейнеры.

Устанавливать только от имени root:

```sh
install -d -m 700 -o vatrushka_observer_deploy -g vatrushka_observer_deploy /home/vatrushka_observer_deploy/.ssh
install -m 600 -o vatrushka_observer_deploy -g vatrushka_observer_deploy /dev/null /home/vatrushka_observer_deploy/.ssh/authorized_keys
# Append only the dedicated GitLab CI public key to authorized_keys.
./ops/observer-wrappers/install.sh --deploy-user vatrushka_observer_deploy
sudo -u vatrushka_observer_deploy sudo -n /usr/local/lib/vatrushka/vatrushka-observability-verify production
```

Не заменяйте фиксированный обёртку на `sudo sh`, членство в группе Docker или безпарольный `ALL`.

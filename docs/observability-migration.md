# Миграция observability

Статус: конфигурации подготавливаются; production cutover не выполнялся.

## Стратегия

Новый контур разворачивается параллельно. Production-приложение, старые Prometheus/Grafana и их named volumes не останавливаются. История Prometheus не переносится: новый TSDB начинается пустым, старый остаётся read-only через SSH tunnel на 72 часа.

## Этапы

1. Создать отдельный VPS 8 vCPU/12 ГБ RAM/100 ГБ NVMe, Ubuntu 24.04.
2. Создать DNS для Grafana и отдельный приватный S3 bucket Loki.
3. Настроить SSH keys, UFW и WireGuard/private network между observability, production и Runner.
4. Создать runtime secret files с mode `600`; не копировать их в Git или artifacts.
5. На production выполнить backup старой Grafana и сохранить rendered-free конфигурации Prometheus/Grafana.
6. На новом VPS проверить `docker compose config`, Prometheus rules, Loki и Alloy configs.
7. Запустить Grafana, Prometheus, Alertmanager, Loki, Blackbox, Node Exporter и Alloy.
8. Убедиться, что Prometheus/Loki/Alertmanager не доступны по публичному IP.
9. Запустить Alloy/exporters на production и Runner; сначала только metrics, затем logs.
10. Сопоставить targets/rules/dashboards со старым контуром. Проверить provisioned dashboards через Grafana API.
11. Провести smoke tests, redact test и тест warning/critical receiver.
12. Переключить DNS Grafana на новый VPS.
13. Наблюдать минимум 72 часа: targets, alerts, ingestion, S3, CPU/RAM/disk, rejected logs.
14. После отдельного подтверждения остановить старые Grafana/Prometheus без удаления volumes.
15. Ещё через согласованное окно удалить старые контейнеры/volumes и закрыть устаревшие loopback tunnel instructions.

## Rollback

До удаления старого контура rollback состоит из возврата DNS Grafana, остановки новых agents/stack без `-v` и повторного открытия SSH tunnel к старой Grafana. Production data и media S3 не затрагиваются.

Новый rollback script не удаляет volumes или S3 objects. Удаление данных всегда отдельная ручная операция после backup и подтверждения владельца.

## Журнал выполнения

| Время UTC | Этап | Результат | Примечание |
|---|---|---|---|
| 2026-07-19 | Репозиторий и production audit | завершён | без изменений production |
| — | Новый VPS/S3/DNS | ожидает входные данные | cutover заблокирован |

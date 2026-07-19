# Архитектура observability Vatrushka

## Компоненты и потоки

```text
Production VPS                         GitLab Runner VPS
  API /metrics                           Node Exporter
  Node/Postgres/Redis exporters          cAdvisor
  cAdvisor                               Alloy
  Alloy                                   │
     │ metrics remote_write               │ metrics remote_write
     │ logs push                           │ logs push
     └──────── WireGuard/private network ──┘
                         │
                         ▼
Observability VPS
  Caddy :80/:443 ──> Grafana :3000
  Prometheus :9090 (private only) ──> Alertmanager :9093
  Loki :3100 (private only) ──> private S3
  Blackbox Exporter :9115
  Node Exporter :9100
  Alloy :12345
```

Prometheus принимает remote write от Alloy agents и отдельно scrapes собственные компоненты и Blackbox Exporter. Loki принимает логи только через private network. Grafana обращается к Prometheus и Loki по внутренней Docker-сети. Hawk Cloud предназначен только для exception tracking и не заменяет Loki.

## Сетевые границы

| Порт | Где слушает | Назначение | Публичный доступ |
|---|---|---|---|
| 22/tcp | все контролируемые VPS | SSH key authentication | ограничить allowlist/VPN |
| 80/tcp, 443/tcp | observability VPS | Caddy/Grafana HTTPS и ACME | да |
| 9090/tcp | private IP observability | Prometheus remote write/admin | нет |
| 3100/tcp | private IP observability | Loki push/query для Alloy | нет |
| 9093/tcp | Docker network | Alertmanager | нет |
| 9115/tcp | Docker network | Blackbox Exporter | нет |
| 9100/8080/9187/9121 | loopback на agents | exporters | нет |

Private endpoints разрешаются firewall только адресам WireGuard production/Runner. Grafana не проксирует Prometheus, Loki или Alertmanager.

## Persistent data

- `prometheus_data`: новый TSDB, retention 30 дней и максимум 55 ГБ;
- `grafana_data`: SQLite, users/preferences и служебные данные;
- `loki_data`: WAL/cache/compactor working files;
- `caddy_data` и `caddy_config`: ACME и reverse proxy state;
- Loki chunks/index: отдельный S3 bucket, retention 30 дней;
- dashboards, datasources, rules и конфигурации: Git.

Prometheus TSDB не входит в обязательный backup: допустима потеря истории метрик при disaster recovery. Grafana database резервируется; Loki восстанавливается из S3 и Git-конфигурации.

## Labels и безопасность данных

Prometheus external labels: `environment=production`, `region=ru`, `monitoring_cluster=primary`. User/request/session/trace IDs запрещены как metric labels.

Loki labels ограничены `environment`, `service`, `host`, `container`, `level`, `region`, `source`. Request/trace/user IDs остаются полями JSON. Alloy отбрасывает health-check noise, объединяет multiline stack traces и редактирует authorization, cookies, passwords и tokens до отправки.

## Точки отказа

- Отказ observability VPS прекращает dashboards/alerts, но не продукт.
- Отказ S3 временно буферизуется Loki WAL; длительная недоступность вызывает alert и может ограничить ingestion.
- Отказ WireGuard прекращает доставку remote metrics/logs и обнаруживается absent/blackbox alerts.
- Отказ Grafana не влияет на Prometheus/Loki/Alertmanager.
- Старый production monitoring остаётся rollback-контуром на период миграции.

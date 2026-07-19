# Аудит observability Vatrushka

Дата аудита: 19 июля 2026 года. Аудит выполнен без остановки и изменения production-сервисов.

## Фактическое состояние

Production работает на `spb-3-vm-smwv` (`213.171.7.154`, Ubuntu 24.04): 2 vCPU, 3.8 ГБ RAM, диск 48 ГБ. На момент замера использовано 22 ГБ (46%), доступно 2.6 ГБ RAM, load average `0.18/0.20/0.24`.

Observability запущен Docker Compose-проектом `vatrushka-observability` из `/opt/vatrushka/infra/observability/docker-compose.yml` на том же VPS, что API, PostgreSQL, Redis и self-hosted LiveKit.

| Компонент | Версия | Доступ | Состояние аудита |
|---|---|---|---|
| Prometheus | `v3.12.0` | `127.0.0.1:9090` | ready, 9/9 targets up |
| Grafana | `13.1.0` | `127.0.0.1:3002` | database `ok` |
| Node Exporter | `v1.11.1` | `127.0.0.1:9100` | up |
| cAdvisor | `v0.57.0` | `127.0.0.1:8080` | scrape up, container healthcheck ошибочен |
| PostgreSQL Exporter | `v0.19.1` | `127.0.0.1:9187` | up |
| Redis Exporter | `v1.84.0` | `127.0.0.1:9121` | up |
| Blackbox Exporter | `v0.28.0` | `127.0.0.1:9115` | HTTP/TURN probes up |

Все monitoring endpoints привязаны к loopback. UFW не публикует их наружу, а публичный Caddy возвращает `404` для `/metrics`. Grafana и Prometheus доступны администратору через SSH tunnel.

Prometheus использует локальный TSDB, retention `15d or 5GiB`, scrape/evaluation interval 15 секунд. На момент аудита TSDB занимал 37 МБ, head содержал 6 654 series; ошибок reload/corruption не было. Загружены 14 alert rules, все healthy и inactive. Alertmanager и внешний получатель отсутствуют.

Grafana использует SQLite в named volume размером 50 МБ. В базе один пользователь и datasource Prometheus; Grafana alert rules отсутствуют. Файл `vatrushka-overview.json` присутствует в mounted provisioning, но API/SQLite не показывают provisioned dashboard. Это дефект текущего контура, который необходимо устранить и проверить smoke-тестом на новом сервере.

Суммарное потребление памяти семью monitoring-контейнерами во время замера — около 440 МиБ. Grafana, Prometheus и cAdvisor совместно создают основную часть нагрузки. cAdvisor помечен `unhealthy`: healthcheck обращается к недоступному адресу, хотя Prometheus успешно получает `/metrics`.

API пишет JSON-логи через Fastify/Pino, использует UUID request ID и редактирует основные auth/SMTP/LiveKit secrets. Централизованного хранилища логов, multiline pipeline и инфраструктурного redact/drop слоя нет. Docker использует ограниченный `json-file` logging (`10m × 3`), что защищает локальный диск от неограниченного роста.

Отдельного self-hosted GitLab-сервера нет: канонический GitLab работает как SaaS. Linux Runner расположен на `msk-1-vm-up56` (`201.51.3.154`): 4 vCPU, 7.8 ГБ RAM, 77 ГБ диск, GitLab Runner и Docker. Совмещать Runner и целевой observability-контур не следует: сервер меньше целевой конфигурации и потеря Runner одновременно лишит проект CI и диагностики.

## Сохраняемые конфигурации

- API `/metrics` и low-cardinality labels;
- существующие Prometheus targets и 14 alert rules;
- HTTP/TLS probes API и updater feed, TURN TCP probe;
- Grafana datasource и dashboard JSON как исходный материал;
- loopback-only принцип для административных endpoints;
- Docker log rotation и отсутствие публичного `/metrics`;
- текущие named volumes до окончания 72-часового окна наблюдения.

## Риски и пробелы

1. Продукт и мониторинг находятся в одной точке отказа.
2. Grafana/Prometheus конкурируют с API, PostgreSQL, Redis и LiveKit за 3.8 ГБ RAM и диск.
3. Loki, Alloy, Alertmanager и централизованный поиск логов отсутствуют.
4. Нет внешней доставки warning/critical alerts.
5. Нет мониторинга самого observability-контура и S3 Loki.
6. Нет проверенных backup/restore и disaster recovery для Grafana.
7. Provisioned dashboard фактически не загружен.
8. cAdvisor healthcheck даёт постоянный ложный unhealthy.
9. Prometheus retention меньше целевых 30 дней/55 ГБ.
10. В cAdvisor присутствуют многословные Docker Compose labels; перед ростом инфраструктуры требуется drop ненужных labels.
11. Zabbix agent остаётся отдельным внешним контуром провайдера и не заменяет продуктовый monitoring.
12. Production checkout находится на более старом commit, чем канонический GitLab; миграция должна брать конфигурацию только из прошедшего MR/release.

## Решения аудита

- Разворачивать новый стек параллельно на отдельном VPS 8 vCPU/12 ГБ/100 ГБ NVMe.
- Не использовать Runner VPS как observability server.
- Начать новый Prometheus TSDB без переноса истории; старый Prometheus оставить read-only на 72 часа. Текущий объём истории мал, а файловое копирование активного TSDB создаёт лишний риск.
- Хранить Loki chunks/index в отдельном приватном S3 bucket, не смешивая lifecycle логов и пользовательского media bucket.
- Соединить Alloy agents и private ingestion endpoints через WireGuard/private network. Prometheus, Loki и Alertmanager не публиковать в Internet.
- Открыть наружу только SSH, HTTP/HTTPS reverse proxy Grafana. Grafana — с собственной авторизацией, без anonymous access.
- Не удалять текущие контейнеры и volumes до 72 часов стабильной работы нового контура и отдельного backup.

## Данные, которых нет в репозитории

Перед production deployment нужны:

- IP/SSH-доступ отдельного observability VPS;
- DNS-имя Grafana и A-запись на новый VPS;
- отдельный Loki S3 bucket, endpoint/region и credentials с минимальными правами;
- технический webhook Alertmanager либо другой согласованный receiver;
- адреса WireGuard/private network для observability, production и Runner.

Отсутствие этих данных не блокирует подготовку воспроизводимых конфигураций и тестов, но блокирует фактический cutover.

# Runbook observability Vatrushka

## Предварительные условия

- отдельный Ubuntu 24.04 VPS;
- Docker Engine и Compose plugin;
- WireGuard/private network до production и Runner;
- DNS `GRAFANA_DOMAIN` на observability VPS;
- отдельный private S3 bucket Loki;
- runtime secret files с mode `600`;
- технический webhook Alertmanager.

Скопируйте `.env.observability.example` в `.env.observability`, заполните только на сервере. Создайте `secrets/grafana_admin_password`, `secrets/alertmanager_webhook_url`, `secrets/loki_aws_credentials`; не выводите их содержимое в terminal logs.

## Проверка и запуск

```bash
cd /opt/vatrushka/infra/observability/platform
chmod 600 .env.observability secrets/*
./scripts/migrate.sh validate
./scripts/migrate.sh deploy
```

Prometheus/Loki должны bindиться только к `OBSERVABILITY_PRIVATE_BIND_IP`. UFW разрешает 9090/3100 только WireGuard subnet; 9093, 9115, 3000 и 12345 наружу не публикуются.

## Agents

Production:

```bash
cd /opt/vatrushka/infra/observability/agents
cp .env.agent.example .env.agent
docker compose \
  --env-file /opt/vatrushka/.env \
  --env-file .env.agent \
  --profile product --profile docker \
  up -d
```

Runner использует `ALLOY_CONFIG_FILE=runner.alloy`, `OBSERVABILITY_ROLE=gitlab-runner` и только profile `docker`. CI job container logs намеренно не собираются: они могут содержать masked-but-sensitive build context и создают высокий объём. Собираются journald units `gitlab-runner`, `docker`, `ssh`.

## Проверка здоровья

```bash
./scripts/healthcheck.sh
curl -fsS "http://${OBSERVABILITY_PRIVATE_BIND_IP}:9090/api/v1/targets"
curl -fsS "http://${OBSERVABILITY_PRIVATE_BIND_IP}:3100/ready"
curl -fsS "https://${GRAFANA_DOMAIN}/api/health"
```

В Grafana должны присутствовать datasources Prometheus/Loki и provisioned dashboards. Базовый набор включает «Инфраструктура: обзор», «Контейнеры: обзор», «Приложение: обзор», «API: детали HTTP», Prometheus Health, Loki Health и Logs Overview; последующие продуктовые дашборды добавляются без жёсткого ограничения их количества.

## Infrastructure and containers

Дашборды `Инфраструктура: обзор` и `Контейнеры: обзор` используют фильтры contour/region/host/role/container и сохраняют время при переходе в соседние dashboards. `Нет данных` означает отсутствие series, а не нулевую нагрузку. `Наблюдаемые контейнеры` показывает только свежесть cAdvisor, не Docker health.

Пороговые значения синхронизированы с rules:

- CPU host: warning выше 85% в течение 15 минут;
- RAM host: critical выше 90% в течение 10 минут;
- filesystem: warning 80%, critical 90%; inode warning 85%;
- clock skew: warning выше 5 секунд;
- container restarts: warning, если `container_start_time_seconds` изменился более трёх раз за 15 минут;
- container OOM: critical при любом событии за 15 минут.

При срабатывании сначала сузьте host/container, сопоставьте время с `Рестарты и OOM`, CPU throttling, host iowait и disk latency, затем перейдите в логи. Прогноз свободного места на 24 часа — диагностический сигнал по шестичасовому тренду, не самостоятельный alert. После rollout убедитесь, что cAdvisor публикует `container`; прежний `name` сохранён на один release для совместимости.

## API HTTP

1. Откройте «Приложение: обзор» и проверьте readiness, количество 5xx и p95.
2. Перейдите в «API: детали HTTP» с сохранением диапазона времени и фильтров.
3. Если 5xx выше 0,1% десять минут или выше 1% пять минут при RPS больше 0,1, найдите `method + route` в Top 5xx и таблице.
4. Для p95 выше 500 ms десять минут откройте список медленных routes; upload/download оценивайте отдельно от обычного JSON API.
5. Сопоставьте `route`, bounded `error_code` и время с «Логи: обзор». Request ID ищите как поле лога, но не добавляйте в Prometheus labels.

4xx не является серверной аварией само по себе. Warning включается при доле выше 10% пятнадцать минут и RPS больше 0,2; сначала проверьте auth, rate limit и клиентскую версию. `0` на stat-панели означает измеренное отсутствие событий, а «Нет данных» — отсутствие series или scrape.

## Добавление узла или target

1. Добавить WireGuard peer и firewall rule.
2. Выбрать минимальный Alloy config и Compose profiles.
3. Задать стабильный `OBSERVABILITY_HOST`; не использовать user/request/session IDs.
4. Запустить agent и проверить remote metrics/logs.
5. Добавить alert на исчезновение ожидаемого узла и обновить документацию.

## Логи и cardinality

Разрешённые Loki labels: environment, service, host, container, level, region, source. Запрещены request/trace/user/session IDs, email, IP, URL и текст ошибок. Product agent собирает только контейнеры `vatrushka-*` и SSH journal; health-check noise отбрасывается, secrets редактируются.

При росте cardinality проверьте `labelValueCountByLabelName` в Prometheus и active streams/discarded lines Loki. Сначала остановите источник новых labels, затем уменьшайте retention/очищайте данные только по отдельному плану.

## Инциденты

- Disk >80%: определить TSDB/WAL/cache, проверить retention и noisy source; не удалять active TSDB вручную.
- S3 unavailable: проверить DNS/TLS/credentials/policy, следить за Loki WAL и disk; приложение не останавливать.
- Loki ingestion loss: проверить Alloy WAL/positions, private route, discarded metrics и rate limits.
- Prometheus down: проверить volume, WAL/corruption и config; при необходимости запустить чистый TSDB, старый не копировать обычным `cp`.
- Grafana down: проверить SQLite/volume/provisioning; восстановить последний проверенный backup.
- Alert delivery down: проверить `alertmanager_notifications_failed_total` и secret webhook file, отправить controlled test alert.

## Backup, restore, update, rollback

```bash
./scripts/backup.sh --dry-run
./scripts/backup.sh
./scripts/restore.sh --grafana-archive backups/<timestamp>/grafana-volume.tar.gz --dry-run
./scripts/rollback.sh --dry-run
```

Обновление выполняется отдельным MR с pinned image versions, config validation, backup и rollback. `docker compose down -v`, ручное удаление S3 и копирование активной Prometheus TSDB запрещены.

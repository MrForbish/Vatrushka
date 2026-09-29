# Runbook наблюдаемость Vatrushka

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

## Агенты

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

При каждом production release агент пересоздаётся автоматически, если существует `infra/observability/agents/.env.agent`. Если файла нет, продуктовый деплой не падает, но в логе появляется операторское предупреждение; Redis/PostgreSQL/container метрики в этом случае не обновляются.

## Проверка здоровья

```bash
./scripts/healthcheck.sh
curl -fsS "http://${OBSERVABILITY_PRIVATE_BIND_IP}:9090/api/v1/targets"
curl -fsS "http://${OBSERVABILITY_PRIVATE_BIND_IP}:3100/ready"
curl -fsS "https://${GRAFANA_DOMAIN}/api/health"
```

В Grafana должны присутствовать datasources Prometheus/Loki, базовые технические dashboards и `Service Health & SLO`. Базовый набор включает «Инфраструктура: обзор», «Контейнеры: обзор», «Приложение: обзор», «API: детали HTTP», «Prometheus: состояние», «Loki: состояние» и «Логи: обзор». Provisioning расширяемый: новые JSON не требуют ручного импорта.

## Состояние службы и SLO

`Service Health & SLO` — стартовый экран владельца и on-call. Начальные 30-дневные цели:

- публичная API доступность: 99.9%;
- API requests без 5xx: 99.9%;
- не менее 95% обычных JSON API requests быстрее 500 ms; upload/download/attachment routes исключены и анализируются отдельно;
- outbox не удалось = 0, самый старый возраст < 60 с.

Error budget показывает запас над 99.9% относительно допустимых 0.1% ошибок. Ноль означает исчерпание бюджета. Recording rules используют 30-дневное окно и 30-дневный Prometheus retention; после 7–14 дней baseline пороги пересматриваются документированным решением, но не снижаются только ради устранения alert.

`vatrushka_build_info{version,commit}=1` и меняющийся без labels `vatrushka_deployment_timestamp_seconds` создают deployment/restart annotations. Если commit=`unknown`, API был собран без `BUILD_COMMIT`; production deployment должен экспортировать текущий git SHA перед Compose build.

## Prometheus здоровье

Проверяйте не только число `up`, но `Targets up / total` и таблицу down targets. Scrape duration оценивается как доля timeout, rule duration — как доля evaluation interval. Series churn помогает обнаружить новый high-cardinality label. Remote-write pending должен возвращаться к нулю, failures всегда равны нулю. При config/rule failure сначала запустите `promtool check config/rules`, затем смотрите Prometheus logs; не перезапускайте TSDB и не удаляйте WAL вручную.

`VatrushkaProductTelemetryMissing` означает, что за пять минут центральный Prometheus не получил ни одной product-метрики. Это отличается от `VatrushkaApiDown`: при разрыве WireGuard или Alloy remote write API может оставаться доступным, но его series вообще не попадают в Prometheus. Проверьте handshake WireGuard на обеих VPS, затем Alloy WAL и remote-write errors; после восстановления не пытайтесь вручную переигрывать устаревшие samples.

## Инфраструктура и контейнеры

Дашборды `Инфраструктура: обзор` и `Контейнеры: обзор` используют фильтры contour/region/host/role/container и сохраняют время при переходе в соседние dashboards. Контейнерный дашборд использует нативный label cAdvisor `name`: он стабильно присутствует на product-узле. `Нет данных` означает отсутствие series, а не нулевую нагрузку. `Наблюдаемые контейнеры` показывает только свежесть cAdvisor, не Docker health.

Пороговые значения синхронизированы с rules:

- CPU host: warning выше 85% в течение 15 минут;
- RAM host: critical выше 90% в течение 10 минут;
- файловая система: предупреждение 80%, критический 90%; иноуд предупреждение 85%;
- clock skew: warning выше 5 секунд;
- container restarts: warning, если `container_start_time_seconds` изменился более трёх раз за 15 минут;
- container OOM: critical при любом событии за 15 минут.

При срабатывании сначала сузьте host/container, сопоставьте время с `Рестарты и OOM`, ограничением CPU, host iowait и disk latency, затем перейдите в логи. Прогноз свободного места на 24 часа — диагностический сигнал по шестичасовому тренду, не самостоятельный alert.

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

## Журналы и Loki

Alloy разбирает JSON `level` и нормализует только закрытый набор `trace/debug/info/warn/error/fatal/unknown`. Pino numeric levels 10–60 преобразуются в те же значения. `request_id`, `error_code`, `exception_type` и message остаются полями строки: ищите их через query-time `| json`, не превращайте в labels. Неструктурированные journald/Docker строки доступны в явно обозначенной fallback-панели.

`Loki: состояние` использует только TSDB/S3-совместимые и общие request metrics; BoltDB Shipper метрики запрещены. Панели ошибок, для которых Loki не создаёт series до первой ошибки, показывают измеренный ноль; отсутствие readiness/canary series остаётся `Нет данных` и требует диагностики. `loki-canary` — end-to-end проверка: он пишет тестовые строки, читает их обратно и экспортирует latency/missing entries.

При инциденте:

1. Проверьте `Loki up` и `End-to-end canary`.
2. Если canary missing > 0, сопоставьте время с discarded reasons, request 5xx, WAL и compactor.
3. Проверьте Loki container logs, private route и S3 credentials/policy, не выводя secret.
4. Выполните контролируемый LogQL smoke: JSON error line должна появиться по `level=error` и request ID.
5. Если пропал один service, проверьте соответствующий Alloy agent и его remote endpoint; не перезапускайте весь контур без необходимости.

## Инциденты

- Disk >80%: определить TSDB/WAL/cache, проверить retention и noisy source; не удалять active TSDB вручную.
- S3 unavailable: проверить DNS/TLS/credentials/policy, следить за Loki WAL и disk; приложение не останавливать.
- Loki ingestion loss: проверить Alloy WAL/positions, private route, discarded metrics и rate limits.
- Prometheus down: проверить volume, WAL/corruption и config; при необходимости запустить чистый TSDB, старый не копировать обычным `cp`.
- Grafana down: проверить SQLite/volume/provisioning; восстановить последний проверенный backup.
- Alert delivery down: проверить `alertmanager_notifications_failed_total` и secret webhook file, отправить controlled test alert.

## В реальном времени и обмен сообщениями

Откройте дашборд `Realtime и сообщения` (`vatrushka-realtime-messaging`). Для всплеска переподключений сначала проверьте разбивку `event/reason`, затем доступность Redis и логи API. При росте outbox сначала устраните зависимость или ошибку публикации; вручную удалять durable-события запрещено. Значение `chat_outbox_failed` выше нуля требует проверки последней ошибки worker и повторной доставки после устранения причины.

## Голос и демонстрация экрана

Откройте дашборд `Голос и демонстрация экрана` (`vatrushka-voice-screen-share`). Расхождение reconciliation или version gap проверяйте вместе с LiveKit webhook, Redis и WebSocket. Для конфликтов screen-share lease сравните `acquire`, `renew`, `release`, результат и доступность LiveKit; не очищайте lease напрямую до проверки фактического participant/track state.

Панели `Участники в голосе` и `Активные демонстрации` обновляются каждым внутренним scrape API: первый gauge считается по текущей Redis projection, второй — по неистёкшим lease в PostgreSQL. API опрашивается каждые 5 секунд, а Alloy отправляет метрики не позднее чем через секунду, поэтому обычная задержка отображения — около 1–6 секунд. Для проверки подключите тестового пользователя к voice-каналу и сопоставьте значение с `GET /api/v1/servers/:serverId/voice-state`; при устойчивом расхождении сначала проверяйте Redis projection и LiveKit webhook, а не Grafana cache.

## Зависимости и доставка

Откройте дашборд `Зависимости и доставка` (`vatrushka-dependencies-delivery`). Для PostgreSQL проверьте подключения, rollback/deadlock и cache hit. Для Redis — число клиентов, занятые байты памяти, evictions и rejected connections. Ноль в панели ошибок Redis штатен; отсутствие всех Redis-панелей означает проблему Redis exporter, а не автоматически «нулевую нагрузку». Для S3 — операцию, result и p95; затем endpoint, DNS/TLS, credentials и bucket policy. Для почты и входа сопоставьте delivery result и login factor, не добавляя email или user ID в labels и логи.

После развёртывания 0.8.0 накопите минимум семь дней production baseline. До этого пороги новых warning alerts считаются стартовыми и корректируются отдельным MR на основании фактических p95/p99 и частоты событий.

## Резервное копирование, восстановление, обновление, откат

```bash
./scripts/backup.sh --dry-run
./scripts/backup.sh
./scripts/restore.sh --grafana-archive backups/<timestamp>/grafana-volume.tar.gz --dry-run
./scripts/rollback.sh --dry-run
```

Обновление выполняется отдельным MR с pinned image versions, config validation, backup и rollback. `docker compose down -v`, ручное удаление S3 и копирование активной Prometheus TSDB запрещены.

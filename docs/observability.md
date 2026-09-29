# Production наблюдаемость

Канонический production-контур работает на отдельной monitoring VPS: Prometheus,
Grafana, Loki с S3 storage, Alloy, Alertmanager, Blackbox и exporters. Grafana
доступна только через `https://grafana.myvatrushka.ru`; Prometheus, Loki и
exporters принимают ingestion на private bind address. Публичный `/metrics` API
route закрыт.

Операционные действия описаны в [runbook](observability-runbook.md), backup и
восстановление — в [disaster recovery](observability-disaster-recovery.md).
Dashboard/provisioning и alert rules находятся в `infra/observability/platform`.
Для практической трактовки метрик и состояний `0` / `Нет данных` используйте
[руководство по метрикам](observability-metrics-guide.md).

## Компоненты и данные

- API `/metrics`: ограниченные шаблоны маршрутов, метод/класс статуса, гистограмма запросов, готовность, Node.js память/CPU/задержка event-loop, обмен сообщениями/WebSocket/outbox счетчики;
- `node_exporter`: хост CPU, память, диски, сеть и systemd;
- cAdvisor: информация по каждому контейнеру CPU, память, файловая система и сеть;
- PostgreSQL/Redis экспортеры: сигналы подключения, блокировки, транзакции, памяти, клиента, команды и высвобождения;
- экспортер blackbox: общедоступные датчики API/update-feed и LiveKit HTTPS, а также датчик TURN TLS;
- Prometheus: 15-секундный сбор/оценка, стандартное хранение 15 дней/5 ГБ и заранее заданные правила оповещений;
- Grafana: предоставлен источник данных Prometheus и панель управления `Vatrushka Production Overview`.

Метрики не должны содержать адрес электронной почты, идентификаторы пользователей/серверов/каналов, текст сообщений, имена файлов, токены приглашений или произвольные URL. HTTP `route` — это шаблон маршрута Fastify, а не запрашиваемый путь, поэтому UUID не могут создавать неограниченные последовательности.

## Первое развертывание

Запустите процесс проверки canonical `/opt/vatrushka` после того, как обычный PR достиг production:

```bash
cd /opt/vatrushka/infra/observability
umask 077
cp .env.observability.example .env.observability
openssl rand -base64 36
# Put the generated value in GRAFANA_ADMIN_PASSWORD without committing it.

docker compose \
  --env-file ../../.env \
  --env-file .env.observability \
  -f docker-compose.yml config -q

docker compose \
  --env-file ../../.env \
  --env-file .env.observability \
  -f docker-compose.yml up -d
```

production `.env` предоставляет существующие PostgreSQL и Redis учетные данные только их экспортерам. Пароль Grafana остается в игнорируемом `infra/observability/.env.observability` с режимом `600`. Никогда не вставляйте сгенерированный Compose вывод в журналы, потому что он содержит внедренные секреты.

## Частный доступ

Держите этот туннель открытым на рабочей станции:

```powershell
ssh -i C:\Users\Admin\.ssh\id_ed25519_vatrushka_server `
  -N `
  -L 13002:127.0.0.1:3002 `
  -L 19090:127.0.0.1:9090 `
  codex@213.171.7.154
```

Откройте `http://127.0.0.1:13002` для Grafana. Prometheus доступен на `http://127.0.0.1:19090` только для диагностики. Не открывайте порты `3002`, `9090`, `9100`, `8080`, `9187`, `9121` или `9115` в брандмауэре UFW/Timeweb.

## Проверка

```bash
curl -fsS http://127.0.0.1:9090/-/ready
curl -fsS http://127.0.0.1:3002/api/health
curl -fsS http://127.0.0.1:9100/metrics >/dev/null
curl -fsS http://127.0.0.1:9187/metrics >/dev/null
curl -fsS http://127.0.0.1:9121/metrics >/dev/null
curl -fsS https://api.myvatrushka.ru/metrics -o /dev/null -w '%{http_code}\n' # must be 404
```

In Prometheus, `up` must be `1` for all local jobs and `probe_success` must be `1` for HTTP, LiveKit and TURN probes. The deployment healthcheck requires the LiveKit and TURN probe series to exist, so a dashboard cannot silently degrade to `Нет метрик` because a blackbox module or target disappeared. The initial 0.6.3 capacity baseline recorded API/WebSocket/Redis/S3/LiveKit p95 comfortably inside budget; PostgreSQL p95 was `99.8 ms` against the initial `100 ms` budget, so connection/query/disk panels need particular attention.

## Оповещения и доставка

Правила охватывают готовность, API 5xx/p95, outbox сбои/возраст, Redis выселения/память, PostgreSQL насыщение соединений, диск хоста и TLS истечение срока. Они видны сразу в Prometheus/Grafana. Внешняя доставка уведомлений намеренно не настроена до выбора технического назначения (SMTP, Telegram или другой канал дежурного); отсутствие получателя доставки отображается в дорожной карте и не должно восприниматься как отсутствие оценки оповещений.

Пороги являются консервативными начальными значениями. Просмотрите данные production за одну неделю перед их ужесточением. Никогда не скрывайте шумное оповещение без записи измеренной базовой линии и заменяющего порога.

## Резервное копирование, хранение и откат

Срок хранения Prometheus ограничен как по времени, так и по размеру диска. Панели управления и обеспечение источников данных Grafana версионируются в репозитории; только пользователи/настройки живут в `grafana_data`. Резервное копирование этого именованного тома следует выполнять с обычным циклом резервного копирования VPS, если предпочтения, созданные UI, становятся важными.

Откат не затрагивает данные приложения:

```bash
docker compose --env-file ../../.env --env-file .env.observability -f docker-compose.yml down
```

Названные метрические объемы остаются, если они явно не удалены. Никогда не используйте `down -v` во время обычного отката.

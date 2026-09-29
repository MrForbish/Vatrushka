# Наблюдаемость восстановления после катастроф

## Цели

- RPO Grafana database: 24 часа.
- RTO Grafana/Prometheus/Loki control plane: 4 часа после доступности VPS и S3.
- Prometheus history: best effort, полная потеря TSDB допустима и документирована.
- Loki history: определяется versioning/lifecycle S3; локальный WAL может быть потерян.

## Резервируемые данные

- Grafana volume — ежедневный архив с ограниченным окном остановки только Grafana;
- repository configs, dashboards, rules и scripts — GitLab;
- runtime secrets — в отдельном защищённом secret backup, не в общем архиве;
- Caddy state — по возможности; сертификаты могут быть выпущены повторно;
- Loki data — S3 bucket с versioning и lifecycle;
- Prometheus TSDB — не входит в обязательный backup.

## Восстановление

1. Поднять чистый Ubuntu VPS и установить закреплённые Docker/Compose версии.
2. Получить прошедший CI commit/tag из GitLab.
3. Восстановить runtime secrets с mode `600`.
4. Проверить доступ и policy Loki S3.
5. Запустить базовый stack без Grafana traffic.
6. Восстановить Grafana volume через `restore.sh`.
7. Запустить Grafana, Prometheus и Loki; проверить health и datasources.
8. Разрешить private traffic от Alloy agents.
9. Выполнить smoke tests и только затем переключить DNS.

Restore Grafana должен ежемесячно проверяться на тестовом Compose project с отдельным volume. Успех фиксируется датой, SHA backup, длительностью и результатом Grafana API health/search.

## Ответственность и секреты

Владелец инфраструктуры утверждает DNS, S3 policy, firewall и secret restore. Codex/оператор выполняет воспроизводимые проверки и не выводит secret contents. При отсутствии назначенного on-call технический receiver Alertmanager должен принадлежать владельцу проекта.

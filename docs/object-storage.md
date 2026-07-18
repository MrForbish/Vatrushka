# Приватное объектное хранилище

Вложения текстовых каналов и личных сообщений могут храниться в S3-совместимом приватном бакете. Production-конфигурация проекта рассчитана на Timeweb Cloud:

```dotenv
MEDIA_STORAGE_DRIVER=s3
S3_ENDPOINT=https://s3.twcstorage.ru
S3_REGION=ru-1
S3_BUCKET=media-vatrushka
S3_ACCESS_KEY_ID=<access-key>
S3_SECRET_ACCESS_KEY=<secret-key>
S3_FORCE_PATH_STYLE=true
S3_KEY_PREFIX=prod
```

Ключи S3 и имя бакета являются server-only настройками. Их нельзя добавлять в `apps/desktop/.env*`, renderer или публичные API-контракты. Бакет остаётся приватным. Canonical messaging получает короткоживущие presigned PUT/GET только после backend auth/permission checks; S3 credentials в desktop не попадают. Legacy attachment endpoint продолжает проксировать байты через Fastify на период совместимости.

## Раскладка объектов

Новые ключи детерминированы и не содержат пользовательские имена файлов:

```text
prod/attachments/channels/<message-id>/<attachment-id>
prod/attachments/direct/<message-id>/<attachment-id>
prod/messages/<uploader-user-id>/<attachment-id>
prod/health/<random-id>
```

Последний префикс используется только canary-проверкой и удаляется сразу после неё. Для отдельного окружения задавайте другой `S3_KEY_PREFIX`, например `staging`.

## Безопасный переход с PostgreSQL

Миграция `0014_simple_molly_hayes.sql` только добавляет nullable `storage_key`; колонка `content` на первом этапе остаётся обязательной. Это expand-фаза:

1. новый API сначала записывает объект в S3, затем сохраняет запись и резервную копию байтов в PostgreSQL;
2. чтение предпочитает S3 и при временной ошибке использует резервную копию из БД;
3. при недоступном S3 readiness возвращает `503`, новые загрузки получают `MEDIA_STORAGE_UNAVAILABLE`, но существующие вложения продолжают читаться из БД;
4. удаление сообщения/вложения сначала фиксируется в БД, затем best-effort удаляет объект;
5. старый API-образ можно вернуть без обратной миграции данных.

После стабильной работы production отдельная contract-миграция сможет сделать S3 единственным хранилищем контента и удалить `content`. До этого момента PostgreSQL backup должен включать байты вложений.

## Проверка и backfill

Перед переключением API проверьте credentials, `HeadBucket`, запись, чтение и удаление тестового объекта:

```bash
docker compose --env-file .env -f infra/docker/docker-compose.yml run --rm --no-deps api \
  npm run media:verify:s3:prod -w @vatrushka/api
```

После применения additive-миграции скопируйте старые вложения в S3:

```bash
docker compose --env-file .env -f infra/docker/docker-compose.yml run --rm api \
  npm run media:migrate:s3:prod -w @vatrushka/api
```

Backfill идемпотентен: он выбирает только записи без `storage_key`, загружает объект под детерминированным ключом и затем сохраняет ключ. Повторный запуск продолжает незавершённую миграцию и не создаёт дополнительные записи. Не удаляйте старые данные из PostgreSQL в этой фазе.

После запуска проверьте:

```bash
curl -fsS https://api.myvatrushka.ru/health/ready
docker compose --env-file .env -f infra/docker/docker-compose.yml logs --tail=200 api
```

Также вручную загрузите, откройте и удалите по одному изображению и обычному файлу в канале и личной переписке. Canonical upload использует intent → presigned PUT → finalize metadata check → message binding. Незавершённый intent не может быть присоединён к сообщению.

## Lifecycle и garbage collection

Миграция `0022_square_luminals` добавляет durable `object_deletion_jobs`. При удалении canonical-вложения PostgreSQL в одной транзакции удаляет metadata и создаёт job; только после commit worker удаляет объект. Ошибки S3 получают exponential backoff, после восьми попыток job остаётся в `failed_at` для операторского разбора.

Worker также переводит в очередь:

- незавершённые upload intents старше `MEDIA_CLEANUP_UNFINISHED_HOURS`;
- объекты сообщений, удалённых раньше retention cutoff;
- временные preview objects.

Период запуска задаёт `MEDIA_CLEANUP_INTERVAL_SECONDS`. Значения по умолчанию — 24 часа и 60 секунд. Для проверки:

```sql
select attempts, available_at, completed_at, failed_at, reason
from object_deletion_jobs
order by created_at desc
limit 50;
```

Не удаляйте failed jobs вручную до сверки с бакетом. Повторную попытку можно безопасно инициировать, очистив `failed_at`, обнулив `attempts` и выставив `available_at = now()` в согласованном maintenance window.

## Откат

Для отката expand-релиза верните предыдущий API-образ и установите `MEDIA_STORAGE_DRIVER=database`. Колонки `storage_key` не мешают старому коду, а все байты по-прежнему находятся в `content`. Не откатывайте schema вручную и не очищайте бакет до подтверждения, что старый образ стабилен.

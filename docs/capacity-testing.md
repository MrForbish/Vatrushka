# Capacity and dependency checks

`npm run capacity:check` выполняет управляемый read/write baseline для API, authenticated WebSocket, PostgreSQL, Redis, приватного S3 и control plane LiveKit. Он не является генератором реального WebRTC-медиа: голос, loopback и screen share по-прежнему проверяются отдельной двухмашинной матрицей.

## Защита от случайного запуска

Команда всегда требует точное подтверждение:

```powershell
$env:CAPACITY_CONFIRM = 'I_UNDERSTAND_VATRUSHKA_CAPACITY_TEST'
```

Любая не-localhost цель дополнительно требует `CAPACITY_ALLOW_REMOTE=true`; `*.myvatrushka.ru` и production IPv4 — ещё и `CAPACITY_ALLOW_PRODUCTION=true`. По умолчанию обязательны все шесть компонентов. Для локальной проверки одного адаптера явно задайте `CAPACITY_REQUIRE_ALL=false`. Секреты в JSON-отчёт не записываются.

## Переменные

| Компонент | Переменные |
| --- | --- |
| API | `CAPACITY_API_URL`, опционально `CAPACITY_HTTP_PATH` |
| WebSocket | `CAPACITY_WS_URL`, короткоживущий `CAPACITY_ACCESS_TOKEN` |
| PostgreSQL | `CAPACITY_DATABASE_URL` |
| Redis | `CAPACITY_REDIS_URL` |
| S3 | `CAPACITY_S3_ENDPOINT`, `CAPACITY_S3_REGION`, `CAPACITY_S3_BUCKET`, `CAPACITY_S3_ACCESS_KEY_ID`, `CAPACITY_S3_SECRET_ACCESS_KEY`, опционально `CAPACITY_S3_FORCE_PATH_STYLE` |
| LiveKit | `CAPACITY_LIVEKIT_HTTP_URL`, `CAPACITY_LIVEKIT_API_KEY`, `CAPACITY_LIVEKIT_API_SECRET` |

Не сохраняйте эти значения в репозитории или shell history. На VPS формируйте их из уже защищённого `.env` внутри текущей shell-сессии и удаляйте сессию после теста. Для WebSocket используйте отдельный тестовый аккаунт и краткоживущий access token, не refresh token.

## Профили и бюджеты

- `CAPACITY_PROFILE=smoke`: 5 операций, concurrency 2;
- `CAPACITY_PROFILE=baseline`: 100 операций, concurrency 10;
- `CAPACITY_ITERATIONS` и `CAPACITY_CONCURRENCY` позволяют выполнить ступенчатый прогон, но имеют hard limits 100000/1000;
- `CAPACITY_REPORT_PATH` задаёт путь JSON evidence; по умолчанию используется `artifacts/capacity/`.

Начальные blocking p95 budgets baseline: API 500 ms, WebSocket 1000 ms, PostgreSQL 100 ms, Redis 75 ms, S3 1500 ms, LiveKit control 1000 ms. Любая ошибка операции проваливает компонент. Эти значения — эксплуатационный SLO baseline, а не обещание максимального числа пользователей.

## Безопасная последовательность

1. Выполнить `smoke` на изолированном окружении и проверить cleanup ключей `vatrushka:capacity:*` и объектов `capacity/*`.
2. Выполнить `baseline`; сохранить JSON вместе с версией приложения, характеристиками VPS и временем теста.
3. Повторять ступени concurrency 10 → 25 → 50 только вне пикового времени. Остановиться при первом нарушении p95, error rate > 0 или ресурсах host/PostgreSQL/Redis выше 80%.
4. Зафиксировать последнюю зелёную ступень как tested capacity, оставляя минимум 30% headroom для production.
5. Для media plane провести два Windows-клиента через voice/screen matrix, затем отдельный контролируемый LiveKit synthetic-media прогон; control-plane `listRooms` не подтверждает качество WebRTC.

Harness создаёт только TTL Redis keys и S3 objects с отдельными префиксами и удаляет их после каждой операции. PostgreSQL probe выполняет `select 1`; LiveKit probe — `listRooms`; API probe по умолчанию — `/health/live`.

# Домашняя панель

Home — персональная стартовая панель после авторизации. Она использует существующий общий `AppShell`, но отдельный `home`-variant: 272 px для навигации, гибкая центральная область и профильный rail 224 px. При ширине меньше 1280 px профиль открывается drawer-ом; минимальная ширина Electron-окна — 1100 px.

## Данные

`GET /api/v1/home` одним запросом возвращает профиль, состояние LiveKit, серверы с unread/voice-счётчиками, до двух Continue items, до четырёх Active Spaces, до пяти событий и onboarding. API строит присутствие только по фактическим LiveKit identities и учитывает channel permissions. Значимые действия записываются в `user_activity`; технические reconnect/track события в историю не попадают.

Renderer использует query key `['home-dashboard', userId]`. Последний успешный ответ сохраняется локально для offline-состояния, запрос повторяется при открытии Home и каждые 15 секунд, пока Home видим. Изменение server list, активного voice channel или состава LiveKit participants инвалидирует query немедленно. Активный локальный звонок подмешивается в Continue с наивысшим приоритетом и возвращает пользователя в уже открытую media session.

## Аудиоготовность

Списки ввода/вывода состоят только из реальных `MediaDeviceInfo`, которые вернул Chromium/Windows. Кнопка проверки запрашивает разрешение, после чего analyser обновляет meter не чаще 25 раз в секунду и различает denied/busy/no signal. Во время активного LiveKit-звонка второй `getUserMedia` не открывается: Home использует уровень локального participant из текущей media session. Выбор устройства сохраняется через типизированный Electron bridge и применяется к активному звонку без перезапуска.

## Приглашения и удалённые модели

Home не содержит route, modal, input, action или API для ручного кода. Приглашение — только короткая HTTPS-ссылка, которая переводится в проверенный `vatrushka://invite/<opaque-token>`. Standalone rooms, guest sessions и старые room leases удалены contract-миграцией `0012`; голос и screen share работают только внутри постоянного server voice channel.

## Проверка

- `npm run typecheck`
- `npm run test`
- `npm run build-storybook -w @vatrushka/desktop`
- `npm run test:storybook`
- `npm run test:visual`
- `npm run db:check`

Перед релизом вручную проверить новый/возвращающийся аккаунт, offline cache, профильный drawer при 1100–1279 px, реальные длинные имена Windows-устройств и возврат в активный звонок.

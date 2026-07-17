# Media

## Voice

LiveKit JS SDK подключается с auto-subscribe, echo cancellation, noise suppression и auto gain control. Отказ микрофона не выбрасывает пользователя из голосового канала: клиент остаётся muted и показывает понятную ошибку. `devicechange` обновляет списки. `Room.switchActiveDevice` немедленно переключает input/output.

После авторизации renderer делает audio-only `getUserMedia`, затем `enumerateDevices`; Electron main разрешает его только главному доверенному frame. Поэтому custom-select показывает реальные labels Windows, а не сгенерированные «Микрофон 1»/«Динамики 1». Псевдоустройство `communications` скрывается, `default` остаётся отдельным пунктом с названием текущего системного устройства. Если Windows не раскрыла label, UI прямо сообщает об этом и предлагает повторно запросить доступ.

Пользователь явно выбирает устройство записи и воспроизведения. Выбор доступен на главной и в компактном popover голосового dock, сохраняется локально и применяется к активной LiveKit-сессии сразу. Подключение к голосу не заменяет экран сервера: workspace rail, список текстовых/голосовых каналов и участники остаются доступны. В постоянном голосовом канале права `SPEAK`, `STREAM_SCREEN` и `STREAM_APPLICATION_AUDIO` отражаются не только в UI: API выпускает LiveKit-токен без соответствующих publish sources, если роль запрещает микрофон, изображение демонстрации или звук приложения.

Participant UI показывает имя, владельца/администратора, mute текстом и icon, speaking текстом и visual outline, connection quality и screen badge. Гостевых media identities больше нет. Удалённые audio tracks attach/detach явно; autoplay gate вызывает `Room.startAudio` только из user gesture.

## Screen capture

1. API atomically выдаёт 30-секундную lease.
2. Main process сериализует `desktopCapturer.getSources` без Node objects.
3. Renderer группирует подписанные превью в «Весь экран» и «Окна приложений», показывает имя окна/приложения и выбирает source.
4. Main проверяет source повторно и разрешает его ровно одному следующему `getDisplayMedia` request.
5. На Windows `audio: loopback` добавляется только по checkbox; `restrictOwnAudio` исключает вывод самой «Ватрушки», чтобы не удваивать голоса участников.
6. LiveKit публикует максимум 1920×1080/30 FPS с ориентиром 3.5 Mbps.
7. Heartbeat идёт каждые 10 секунд; failure останавливает local track.

Удалённый `ScreenShareAudio` имеет отдельные mute и volume, не влияющие на громкость голосов участников. Координация выполняется channel lease в PostgreSQL.

Cancel, publish failure, normal stop, channel leave, window close, `participant_left`, screen `track_unpublished`, LiveKit room finish и lease expiry освобождают ресурс. При ошибочном появлении нескольких screen tracks клиент логирует диагностику и показывает первый.

## Provider switching

Код не различает Cloud и self-hosted. Меняются только `LIVEKIT_URL`, `LIVEKIT_HTTP_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.

# Media

## Voice

LiveKit JS SDK подключается с auto-subscribe, echo cancellation, noise suppression и auto gain control. Отказ микрофона не выбрасывает пользователя из комнаты: клиент остаётся muted и показывает понятную ошибку. `devicechange` обновляет списки. `Room.switchActiveDevice` переключает input/output по установленным SDK types.

Participant UI показывает имя, guest/owner, mute текстом и icon, speaking текстом и visual outline, connection quality и screen badge. Удалённые audio tracks attach/detach явно; autoplay gate вызывает `Room.startAudio` только из user gesture.

## Screen capture

1. API atomically выдаёт 30-секундную lease.
2. Main process сериализует `desktopCapturer.getSources` без Node objects.
3. Renderer показывает focusable modal и выбирает source.
4. Main проверяет source повторно и разрешает его ровно одному следующему `getDisplayMedia` request.
5. На Windows `audio: loopback` добавляется только по checkbox.
6. LiveKit публикует максимум 1920×1080/30 FPS с ориентиром 3.5 Mbps.
7. Heartbeat идёт каждые 10 секунд; failure останавливает local track.

Cancel, publish failure, normal stop, room leave, window close, `participant_left`, screen `track_unpublished`, room finish и lease expiry освобождают ресурс. При ошибочном появлении нескольких screen tracks клиент логирует диагностику и показывает первый.

## Provider switching

Код не различает Cloud и self-hosted. Меняются только `LIVEKIT_URL`, `LIVEKIT_HTTP_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.

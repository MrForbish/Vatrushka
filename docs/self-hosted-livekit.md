# Self-hosted LiveKit: одна Ubuntu VM

Этот профиль необязателен и не включён в основной compose. Он не использует Redis, Kubernetes, Egress, Ingress, SIP, recording или transcoding. Это разумно для небольшой инсталляции с несколькими активными голосовыми каналами на машине с достаточной исходящей полосой.

LiveKit рекомендует host networking для VM и предупреждает, что WebRTC требует публичного IP, trusted certificates и открытых UDP ports. Для production-first установки предпочтителен официальный `livekit/generate`; файлы здесь дают проверяемую минимальную конфигурацию проекта.

## DNS и certificates

- `api.example.com` → public IPv4 (Fastify/Caddy);
- `livekit.example.com` → тот же IPv4 (WSS через Caddy → host:7880);
- `turn.example.com` → тот же IPv4 (embedded TURN).

Создайте trusted certificate для TURN domain (например certbot DNS/standalone) и убедитесь, что `/etc/letsencrypt/live/$TURN_DOMAIN/fullchain.pem` и `privkey.pem` доступны контейнеру. Self-signed certificate не подходит WebRTC clients.

В данной минимальной схеме Caddy занимает 443/TCP, поэтому TURN/TLS использует отдельный 5349/TCP. Мы намеренно не пытаемся разделить один 443 между HTTP reverse proxy и TURN без L4/SNI routing. Для максимальной совместимости корпоративных сетей используйте официальный VM generator, который создаёт корректную Caddy/L4 схему, или отдельный public IP/load balancer для TURN/TLS:443.

## Настройка

1. Замените key/secret, TURN domain и webhook URL в `infra/livekit/livekit.yaml`.
2. Они должны совпадать с backend `LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET`.
3. Установите:

   ```env
   LIVEKIT_URL=wss://livekit.example.com
   LIVEKIT_HTTP_URL=https://livekit.example.com
   ```

4. Откройте provider firewall и UFW:

   ```bash
   sudo bash infra/scripts/configure-ufw.sh
   ```

   Реальная конфигурация использует 80/TCP, 443/TCP+UDP (Caddy HTTP/3), 7881/TCP, 3478/UDP, 5349/TCP и 50000–60000/UDP.

5. Запустите основной stack, затем LiveKit:

   ```bash
   docker compose --env-file .env -f infra/docker/docker-compose.yml up -d postgres api caddy
   VATRUSHKA_APP_ENV_FILE=/etc/vatrushka/app.env docker compose --env-file /etc/vatrushka/app.env -f infra/livekit/docker-compose.self-hosted.yml up -d
   ```

The root-owned runtime environment must set `LIVEKIT_WEBHOOK_URL` to
`https://<api-domain>/api/v1/integrations/livekit/webhook`, `TURN_DOMAIN`, and
`TURN_CERT_DIRECTORY`. Staging values must use staging domains only; do not
reuse the production API, TURN domain or certificate path.

## Диагностика

```bash
dig +short livekit.example.com A
dig +short turn.example.com A
curl -4 https://api.ipify.org
openssl s_client -connect turn.example.com:5349 -servername turn.example.com
docker compose -f infra/livekit/docker-compose.self-hosted.yml logs -f --tail=200 livekit
sudo ss -lntup | grep -E '7880|7881|3478|5349'
sudo tcpdump -ni any udp portrange 50000-60000
```

Проверяйте UDP с внешней сети; `nc -u` не подтверждает полноценный ICE path. В LiveKit Cloud/Meet connection test убедитесь, что UDP preferred и TCP/TURN fallback доступны.

## Upgrade и rollback

1. Зафиксируйте текущий image digest: `docker image inspect livekit/livekit-server:v1.13.1`.
2. Измените tag на проверенный release, `docker compose pull livekit`, `up -d livekit`.
3. Проверьте новый тестовый голосовой канал и logs.
4. Для rollback верните прежний tag/digest и снова `up -d livekit`.

Остановка LiveKit разрывает активные голосовые каналы; rolling update для одной node отсутствует.

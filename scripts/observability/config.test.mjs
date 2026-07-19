import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('observability services are pinned and bound to loopback', async () => {
  const compose = await read('infra/observability/docker-compose.yml');
  const images = [...compose.matchAll(/^\s+image:\s+(\S+)$/gmu)].map((match) => match[1]);
  assert.equal(images.length, 7);
  assert.ok(images.every((image) => !image.endsWith(':latest') && /:v?\d+\.\d+\.\d+$/u.test(image)), images.join('\n'));
  assert.doesNotMatch(compose, /^\s+ports:/mu);
  for (const port of ['9090', '9100', '9187', '9121', '9115']) assert.match(compose, new RegExp(`127\\.0\\.0\\.1:${port}`, 'u'));
  assert.match(compose, /GF_SERVER_HTTP_ADDR: 127\.0\.0\.1/u);
  assert.match(compose, /GF_SERVER_HTTP_PORT: 3002/u);
  assert.match(compose, /--listen_ip=127\.0\.0\.1[\s\S]+--port=8080/u);
});

test('prometheus scrapes every required local component and loads alert rules', async () => {
  const prometheus = await read('infra/observability/prometheus/prometheus.yml');
  for (const job of ['vatrushka-api', 'node', 'cadvisor', 'postgres', 'redis', 'blackbox-http', 'blackbox-turn']) assert.match(prometheus, new RegExp(`job_name: ${job}`, 'u'));
  assert.match(prometheus, /\/etc\/prometheus\/alerts\.yml/u);

  const alerts = await read('infra/observability/prometheus/alerts.yml');
  for (const alert of ['VatrushkaPublicReadinessDown', 'VatrushkaOutboxFailed', 'VatrushkaRedisPublishErrors', 'VatrushkaMessageCreateErrors', 'VatrushkaRedisEvictions', 'VatrushkaPostgresConnectionsHigh', 'VatrushkaHostDiskLow', 'VatrushkaCertificateExpiresSoon']) assert.match(alerts, new RegExp(`alert: ${alert}`, 'u'));
});

test('grafana dashboard is valid JSON with the production datasource and critical panels', async () => {
  const dashboard = JSON.parse(await read('infra/observability/grafana/dashboards/vatrushka-overview.json'));
  assert.equal(dashboard.uid, 'vatrushka-production-overview');
  assert.ok(dashboard.panels.length >= 12);
  assert.ok(dashboard.panels.every((panel) => panel.datasource?.uid === 'prometheus'));
  const titles = new Set(dashboard.panels.map((panel) => panel.title));
  for (const title of ['API latency', 'Host CPU', 'Redis / host RAM', 'PostgreSQL connections', 'Messaging mean latency']) assert.ok(titles.has(title), title);
});

test('public Caddy endpoint does not proxy Prometheus metrics', async () => {
  const caddy = await read('infra/caddy/Caddyfile');
  assert.match(caddy, /@private_metrics path \/metrics/u);
  assert.match(caddy, /respond @private_metrics 404/u);
});

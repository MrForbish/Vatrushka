import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('legacy stack remains private and available for rollback', async () => {
  const compose = await read('infra/observability/docker-compose.yml');
  const images = [...compose.matchAll(/^\s+image:\s+(\S+)$/gmu)].map((match) => match[1]);
  assert.equal(images.length, 7);
  assert.ok(images.every((image) => !image.endsWith(':latest')), images.join('\n'));
  assert.doesNotMatch(compose, /^\s+ports:/mu);
  for (const port of ['9090', '9100', '9187', '9121', '9115']) assert.match(compose, new RegExp(`127\\.0\\.0\\.1:${port}`, 'u'));
});

test('new platform pins services and exposes only Grafana plus private ingestion', async () => {
  const compose = await read('infra/observability/platform/docker-compose.yml');
  const images = [...compose.matchAll(/^\s+image:\s+(\S+)$/gmu)].map((match) => match[1]);
  assert.equal(images.length, 8);
  assert.ok(images.every((image) => image.includes(':') && !image.endsWith(':latest')), images.join('\n'));
  assert.match(compose, /GRAFANA_BIND_ADDRESS[^\n]+:80:80/u);
  assert.match(compose, /GRAFANA_BIND_ADDRESS[^\n]+:443:443/u);
  assert.match(compose, /OBSERVABILITY_PRIVATE_BIND_IP[^\n]+:9090:9090/u);
  assert.match(compose, /OBSERVABILITY_PRIVATE_BIND_IP[^\n]+:3100:3100/u);
  assert.doesNotMatch(compose, /:9093:9093|:9115:9115|:3000:3000|:12345:12345/u);
  assert.match(compose, /GF_AUTH_ANONYMOUS_ENABLED: "false"/u);
  assert.match(compose, /loki_aws_credentials/u);
  assert.match(compose, /NO_PROXY: [^\n]*0\.0\.0\.0[^\n]*loki/u);
  assert.doesNotMatch(compose, /--collector\.systemd/u);
  assert.doesNotMatch(compose, /aws_secret_access_key\s*[:=]\s*[^$]/iu);
});

test('prometheus has remote write, alertmanager, external labels and separated rules', async () => {
  const compose = await read('infra/observability/platform/docker-compose.yml');
  const prometheus = await read('infra/observability/platform/prometheus/prometheus.yml');
  assert.match(compose, /--storage\.tsdb\.retention\.time=\$\{PROMETHEUS_RETENTION_TIME:-30d\}/u);
  assert.match(compose, /--storage\.tsdb\.retention\.size=\$\{PROMETHEUS_RETENTION_SIZE:-55GB\}/u);
  assert.match(compose, /--web\.enable-remote-write-receiver/u);
  assert.match(prometheus, /external_labels:[\s\S]+monitoring_cluster: primary/u);
  assert.match(prometheus, /targets: \[alertmanager:9093\]/u);
  assert.match(prometheus, /\/etc\/prometheus\/rules\/\*\.yml/u);
  assert.match(prometheus, /job_name: blackbox-turn[\s\S]+module: \[tcp_tls\]/u);

  const rules = await Promise.all(['infrastructure', 'applications', 'observability'].map((name) => read(`infra/observability/platform/prometheus/rules/${name}.yml`)));
  const merged = rules.join('\n');
  for (const alert of ['HostCpuHigh', 'HostMemoryCritical', 'HostDiskCritical', 'VatrushkaPublicReadinessDown', 'VatrushkaApiUnhandledErrors', 'VatrushkaScreenShareHeartbeatFailures', 'VatrushkaOutboxFailed', 'PrometheusTargetDown', 'LokiDiscardedLogs', 'AlertmanagerNotificationsFailing']) {
    assert.match(merged, new RegExp(`alert: ${alert}`, 'u'));
  }
});

test('loki uses S3 TSDB schema and bounded 30-day ingestion', async () => {
  const loki = await read('infra/observability/platform/loki/loki.yml');
  assert.match(loki, /object_store: s3/u);
  assert.match(loki, /schema: v13/u);
  assert.match(loki, /retention_period: 744h/u);
  assert.match(loki, /grpc_listen_address: 0\.0\.0\.0/u);
  assert.match(loki, /ingestion_rate_mb: 4/u);
  assert.match(loki, /max_global_streams_per_user: 5000/u);
  assert.match(loki, /reporting_enabled: false/u);
});

test('alloy agents sanitize logs and runner excludes CI job container logs', async () => {
  const platform = await read('infra/observability/platform/alloy/platform.alloy');
  const product = await read('infra/observability/agents/alloy/product.alloy');
  const runner = await read('infra/observability/agents/alloy/runner.alloy');
  for (const config of [platform, product, runner]) {
    assert.match(config, /stage\.replace/u);
    assert.match(config, /\[REDACTED\]/u);
    assert.doesNotMatch(config, /target_label\s*=\s*"(request_id|trace_id|user_id|session_id|email|ip)"/u);
  }
  assert.match(product, /values = \["vatrushka-\*"\]/u);
  assert.match(runner, /_SYSTEMD_UNIT=gitlab-runner\.service/u);
  assert.doesNotMatch(runner, /loki\.source\.docker/u);
});

test('grafana provisions Prometheus, Loki and the six required dashboards', async () => {
  const datasource = await read('infra/observability/platform/grafana/provisioning/datasources/datasources.yml');
  assert.match(datasource, /uid: prometheus/u);
  assert.match(datasource, /uid: loki/u);

  const directory = new URL('../../infra/observability/platform/grafana/dashboards/', import.meta.url);
  const files = (await readdir(directory)).filter((file) => file.endsWith('.json'));
  assert.equal(files.length, 6);
  const dashboards = await Promise.all(files.map(async (file) => JSON.parse(await read(`infra/observability/platform/grafana/dashboards/${file}`))));
  const titles = new Set(dashboards.map((dashboard) => dashboard.title));
  for (const title of ['Infrastructure Overview', 'Containers Overview', 'Application Overview', 'Prometheus Health', 'Loki Health', 'Logs Overview']) assert.ok(titles.has(title), title);
  assert.ok(dashboards.every((dashboard) => dashboard.uid && dashboard.panels.length >= 3));
});

test('migration and recovery scripts preserve old metrics and secrets', async () => {
  const backup = await read('infra/observability/platform/scripts/backup.sh');
  const restore = await read('infra/observability/platform/scripts/restore.sh');
  const rollback = await read('infra/observability/platform/scripts/rollback.sh');
  assert.match(backup, /--exclude='\.\/secrets'/u);
  assert.match(backup, /--dry-run/u);
  assert.match(restore, /--dry-run/u);
  assert.doesNotMatch(rollback, /down\s+-v|volume\s+rm|s3.*delete/iu);
});

test('public product Caddy endpoint does not proxy Prometheus metrics', async () => {
  const caddy = await read('infra/caddy/Caddyfile');
  assert.match(caddy, /handle \/metrics\s*\{\s*respond 404\s*\}/u);
});

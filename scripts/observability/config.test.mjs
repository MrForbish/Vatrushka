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

test('grafana provisions valid, linked and extensible dashboards', async () => {
  const datasource = await read('infra/observability/platform/grafana/provisioning/datasources/datasources.yml');
  assert.match(datasource, /uid: prometheus/u);
  assert.match(datasource, /uid: loki/u);

  const directory = new URL('../../infra/observability/platform/grafana/dashboards/', import.meta.url);
  const files = (await readdir(directory)).filter((file) => file.endsWith('.json'));
  assert.ok(files.length >= 7, `expected at least 7 dashboards, got ${files.length}`);
  const dashboards = await Promise.all(files.map(async (file) => JSON.parse(await read(`infra/observability/platform/grafana/dashboards/${file}`))));
  const titles = new Set(dashboards.map((dashboard) => dashboard.title));
  for (const title of ['Инфраструктура: обзор', 'Контейнеры: обзор', 'Приложение: обзор', 'API: детали HTTP', 'Prometheus Health', 'Loki Health', 'Logs Overview']) assert.ok(titles.has(title), title);
  assert.ok(dashboards.every((dashboard) => dashboard.uid && dashboard.panels.length >= 3));

  const uids = dashboards.map((dashboard) => dashboard.uid);
  assert.equal(new Set(uids).size, uids.length, 'dashboard UID values must be unique');
  for (const dashboard of dashboards) {
    const ids = dashboard.panels.map((panel) => panel.id);
    assert.equal(new Set(ids).size, ids.length, `${dashboard.uid}: panel IDs must be unique`);
    for (let left = 0; left < dashboard.panels.length; left += 1) {
      const a = dashboard.panels[left]?.gridPos;
      if (!a) continue;
      for (let right = left + 1; right < dashboard.panels.length; right += 1) {
        const b = dashboard.panels[right]?.gridPos;
        if (!b) continue;
        const overlaps = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
        assert.equal(overlaps, false, `${dashboard.uid}: panels ${dashboard.panels[left].id} and ${dashboard.panels[right].id} overlap`);
      }
    }
    for (const link of dashboard.links ?? []) {
      const linkedUid = /^\/d\/([^/?]+)/u.exec(link.url)?.[1];
      if (linkedUid) assert.ok(uids.includes(linkedUid), `${dashboard.uid}: unknown linked dashboard ${linkedUid}`);
    }
  }
});

test('HTTP dashboards explain panels and use adaptive bounded queries', async () => {
  const application = JSON.parse(await read('infra/observability/platform/grafana/dashboards/application-overview.json'));
  const details = JSON.parse(await read('infra/observability/platform/grafana/dashboards/api-http-details.json'));
  for (const dashboard of [application, details]) {
    assert.ok(dashboard.description, `${dashboard.uid}: missing dashboard description`);
    assert.ok(dashboard.panels.every((panel) => panel.description), `${dashboard.uid}: every panel needs a description`);
    const serialized = JSON.stringify(dashboard);
    assert.doesNotMatch(serialized, /\[5m\]/u);
    assert.doesNotMatch(serialized, /(user|server|channel|request|session)_id\s*=~/u);
    for (const variable of ['environment', 'method', 'route', 'status_class'])
      assert.ok(dashboard.templating.list.some((item) => item.name === variable), `${dashboard.uid}: missing $${variable}`);
  }

  const detailTitles = new Set(details.panels.map((panel) => panel.title));
  for (const title of ['Ответы 2xx', 'Ответы 3xx', 'Ответы 4xx', 'Ответы 5xx', 'Доля 4xx', 'Доля 5xx', 'Top routes по 4xx', 'Top routes по 5xx', 'Route / method / status: сводная таблица'])
    assert.ok(detailTitles.has(title), title);
});

test('HTTP recording rules and alerts enforce the documented initial SLOs', async () => {
  const rules = await read('infra/observability/platform/prometheus/rules/applications.yml');
  for (const record of [
    'vatrushka:api_requests:rate5m',
    'vatrushka:api_4xx_ratio:rate5m',
    'vatrushka:api_5xx_ratio:rate5m',
    'vatrushka:api_request_duration_seconds:p50_5m',
    'vatrushka:api_request_duration_seconds:p95_5m',
    'vatrushka:api_request_duration_seconds:p99_5m',
    'vatrushka:api_route_request_duration_seconds:p95_5m',
  ])
    assert.match(rules, new RegExp(`record: ${record}`, 'u'));

  assert.match(rules, /alert: VatrushkaApiFiveXxRatioHigh[\s\S]+vatrushka:api_5xx_ratio:rate5m > 0\.001/u);
  assert.match(rules, /alert: VatrushkaApiFiveXxRatioCritical[\s\S]+vatrushka:api_5xx_ratio:rate5m > 0\.01/u);
  assert.match(rules, /alert: VatrushkaApiFourXxRatioHigh[\s\S]+vatrushka:api_4xx_ratio:rate5m > 0\.1/u);
  assert.match(rules, /alert: VatrushkaApiLatencyHigh[\s\S]+vatrushka:api_request_duration_seconds:p95_5m > 0\.5/u);
});

test('infrastructure dashboards cover required diagnostics without fixed rate windows', async () => {
  const infrastructure = JSON.parse(await read('infra/observability/platform/grafana/dashboards/infrastructure-overview.json'));
  const containers = JSON.parse(await read('infra/observability/platform/grafana/dashboards/containers-overview.json'));
  for (const dashboard of [infrastructure, containers]) {
    assert.ok(dashboard.description, `${dashboard.uid}: missing dashboard description`);
    assert.ok(dashboard.panels.every((panel) => panel.description), `${dashboard.uid}: every panel needs a description`);
    assert.doesNotMatch(JSON.stringify(dashboard), /\[5m\]/u);
    const ids = dashboard.panels.map((panel) => panel.id);
    assert.equal(new Set(ids).size, ids.length, `${dashboard.uid}: panel IDs must be unique`);
    for (let left = 0; left < dashboard.panels.length; left += 1) {
      const a = dashboard.panels[left].gridPos;
      for (let right = left + 1; right < dashboard.panels.length; right += 1) {
        const b = dashboard.panels[right].gridPos;
        const overlaps = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
        assert.equal(overlaps, false, `${dashboard.uid}: panels ${dashboard.panels[left].id} and ${dashboard.panels[right].id} overlap`);
      }
    }
  }

  for (const variable of ['environment', 'region', 'host', 'role']) assert.ok(infrastructure.templating.list.some((item) => item.name === variable));
  for (const variable of ['environment', 'host', 'role', 'container']) assert.ok(containers.templating.list.some((item) => item.name === variable));

  const infrastructureTitles = new Set(infrastructure.panels.map((panel) => panel.title));
  for (const title of ['CPU и iowait', 'Load1 на CPU', 'RAM и swap', 'Диски и inode', 'Disk throughput', 'Disk IOPS и latency', 'Сетевые ошибки и drops', 'Uptime и часы']) assert.ok(infrastructureTitles.has(title), title);
  const containerTitles = new Set(containers.panels.map((panel) => panel.title));
  for (const title of ['Контейнеры: состояние и события', 'CPU throttling', 'Рестарты и OOM', 'Сеть контейнеров', 'Filesystem throughput', 'Container filesystem usage']) assert.ok(containerTitles.has(title), title);
});

test('cAdvisor labels and restart alerts use bounded container semantics', async () => {
  const product = await read('infra/observability/agents/alloy/product.alloy');
  const rules = await read('infra/observability/platform/prometheus/rules/infrastructure.yml');
  assert.match(product, /prometheus\.relabel "cadvisor"/u);
  assert.match(product, /target_label\s*=\s*"container"/u);
  assert.match(product, /container_label_com_docker_compose_/u);
  assert.match(rules, /alert: ContainerRestarting[\s\S]+changes\(container_start_time_seconds\{container!=""\}\[15m\]\) > 3/u);
  assert.doesNotMatch(rules, /increase\(container_start_time_seconds/u);
  for (const record of ['vatrushka:host_cpu_utilization:ratio5m', 'vatrushka:host_memory_utilization:ratio', 'vatrushka:host_filesystem_utilization:ratio', 'vatrushka:host_inode_utilization:ratio']) assert.match(rules, new RegExp(`record: ${record}`, 'u'));
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

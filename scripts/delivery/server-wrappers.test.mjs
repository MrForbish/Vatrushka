import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

const root = new URL("../../ops/server-wrappers/", import.meta.url);
const bin = new URL("bin/", root);
const wrappers = [
  "vatrushka-preflight",
  "vatrushka-deploy",
  "vatrushka-rollback",
  "vatrushka-observability-deploy",
  "vatrushka-runtime-status",
  "vatrushka-production-readiness",
  "vatrushka-postgresql-backup",
];

test("server wrappers are fail-closed and avoid arbitrary shell entry points", async () => {
  const common = await readFile(
    new URL("vatrushka-wrapper-common.sh", bin),
    "utf8",
  );
  assert.match(
    common,
    /readonly VATRUSHKA_MANIFEST_ROOT=\/var\/lib\/vatrushka\/manifests/,
  );
  assert.match(
    common,
    /readonly VATRUSHKA_INBOX_ROOT=\/var\/lib\/vatrushka\/inbox/,
  );
  assert.match(
    common,
    /readonly VATRUSHKA_SOURCE_ROOT=\/var\/lib\/vatrushka\/sources/,
  );
  assert.match(
    common,
    /readonly VATRUSHKA_ACTIVE_CANDIDATE_FILE=\/var\/lib\/vatrushka\/manifests\/active-candidate/,
  );
  assert.match(common, /PATH=\/usr\/sbin:\/usr\/bin:\/sbin:\/bin/);
  assert.match(common, /Manifest path is not allowlisted/);
  assert.match(common, /Manifest checksum does not match/);
  assert.match(common, /Candidate manifest path is not allowlisted/);
  assert.match(common, /Candidate manifest must not be a symlink/);
  assert.match(common, /Candidate source archive must not be a symlink/);
  assert.match(
    common,
    /Candidate source archive checksum does not match manifest/,
  );
  assert.match(common, /Candidate source archive contains an unsafe entry/);
  assert.match(common, /candidate-\$checksum\.json/);
  assert.match(common, /root:root:640/);
  assert.doesNotMatch(common, /eval\b|sh -c|bash -c/);

  for (const name of wrappers) {
    const content = await readFile(new URL(name, bin), "utf8");
    assert.match(content, /^#!\/usr\/bin\/env sh\r?\nset -eu/m);
    assert.match(content, /vatrushka-wrapper-common\.sh/);
  }
});

test("installer grants no shell or docker authority to the deploy account", async () => {
  const installer = await readFile(new URL("install.sh", root), "utf8");
  assert.match(installer, /visudo -cf \/etc\/sudoers\.d\/vatrushka-deploy/);
  assert.match(installer, /vatrushka-preflight \*/);
  assert.match(installer, /vatrushka-deploy \*/);
  assert.match(installer, /vatrushka-rollback \*/);
  assert.match(installer, /vatrushka-publish-updater \*/);
  assert.match(installer, /\/var\/lib\/vatrushka\/inbox/);
  assert.match(installer, /\/var\/lib\/vatrushka\/sources/);
  assert.match(installer, /drivers\/compose-digest-deploy/);
  assert.match(installer, /verify-host-bootstrap\.sh/);
  assert.match(
    installer,
    /install -m 0750 -o root -g root "\$driver_dir\/compose-digest-deploy"/,
  );
  assert.match(
    installer,
    /install -m 0750 -o root -g root "\$driver_dir\/compose-digest-rollback"/,
  );
  assert.match(
    installer,
    /install -m 0750 -o root -g root "\$driver_dir\/runtime-status"/,
  );
  assert.match(
    installer,
    /install -m 0750 -o root -g root "\$driver_dir\/observability-deploy"/,
  );
  assert.match(installer, /vatrushka-postgresql-backup/);
  assert.match(installer, /\$root\/vatrushka-postgresql-backup/);
  assert.match(installer, /vatrushka-production-readiness/);
  assert.match(installer, /\$root\/vatrushka-production-readiness/);
  assert.match(installer, /drivers\/postgresql-backup\.py/);
  assert.match(installer, /vatrushka-postgresql-backup\.timer/);
  assert.match(installer, /vatrushka-observability-deploy \*/);
  assert.doesNotMatch(installer, /NOPASSWD:\s*ALL/);
  assert.doesNotMatch(
    installer,
    /Cmnd_Alias VATRUSHKA_WRAPPERS[\s\S]*\/(?:bin\/)?(?:sh|bash|docker|docker-compose)\b/,
  );
});

test("production readiness is root-only, redacted and requires S3 plus TURN certificates", async () => {
  const wrapper = await readFile(
    new URL("bin/vatrushka-production-readiness", root),
    "utf8",
  );
  const driver = await readFile(
    new URL("drivers/production-runtime-readiness.py", root),
    "utf8",
  );
  assert.match(wrapper, /Production readiness does not accept arguments/);
  assert.match(wrapper, /production-runtime-readiness\.py/);
  assert.match(driver, /\/etc\/vatrushka\/runtime\.env/);
  assert.match(driver, /MEDIA_STORAGE_DRIVER/);
  assert.doesNotMatch(driver, /NODE_ENV/);
  assert.match(driver, /S3_SECRET_ACCESS_KEY/);
  assert.match(driver, /S3_BUCKET"\) != "media-vatrushka"/);
  assert.match(driver, /S3_FORCE_PATH_STYLE"\) != "true"/);
  assert.match(driver, /S3_KEY_PREFIX"\) != "uploads"/);
  assert.match(driver, /client\.put_object/);
  assert.match(driver, /client\.head_object/);
  assert.match(driver, /client\.delete_object/);
  assert.match(driver, /Production media storage probe failed/);
  assert.match(driver, /TURN_CERT_DIRECTORY/);
  assert.match(driver, /fullchain\.pem/);
  assert.match(driver, /privkey\.pem/);
  assert.match(driver, /Production application configuration is incomplete/);
  assert.match(driver, /Production application configuration is invalid/);
  assert.match(driver, /runtime_preflight=ready environment=production/);
  assert.doesNotMatch(
    driver,
    /print\([^\n]*(ACCESS_KEY|SECRET|PASSWORD|TOKEN)/,
  );
});

test("PostgreSQL backup is root-only, encrypted and has a fixed CI invocation boundary", async () => {
  const wrapper = await readFile(
    new URL("bin/vatrushka-postgresql-backup", root),
    "utf8",
  );
  const driver = await readFile(
    new URL("drivers/postgresql-backup.py", root),
    "utf8",
  );
  const timer = await readFile(
    new URL("systemd/vatrushka-postgresql-backup.timer", root),
    "utf8",
  );
  const service = await readFile(
    new URL("systemd/vatrushka-postgresql-backup.service", root),
    "utf8",
  );
  const example = await readFile(new URL("backup.env.example", root), "utf8");
  assert.match(wrapper, /PostgreSQL backup does not accept arguments/);
  assert.match(wrapper, /postgresql-backup\.py/);
  assert.match(driver, /\/etc\/vatrushka\/backup\.env/);
  assert.match(driver, /pg_dump --format=custom --compress=9/);
  assert.match(driver, /\[age, "-r", backup\["BACKUP_AGE_RECIPIENT"\]/);
  assert.match(driver, /import boto3/);
  assert.match(
    driver,
    /aws_secret_access_key=backup\["BACKUP_AWS_SECRET_ACCESS_KEY"\]/,
  );
  assert.match(driver, /daily\/\{backup_id\}/);
  assert.match(driver, /weekly\/\{backup_id\}/);
  assert.match(driver, /shutil\.rmtree\(workspace, ignore_errors=True\)/);
  assert.match(driver, /backup=not-required environment=production reason=runtime-inactive/);
  assert.match(driver, /Production runtime is invalid/);
  assert.doesNotMatch(
    driver,
    /print\([^\n]*(ACCESS_KEY|SECRET|PASSWORD|TOKEN)/,
  );
  assert.match(timer, /OnCalendar=\*-\*-\* 03:17:00 UTC/);
  assert.match(timer, /Persistent=true/);
  assert.match(service, /User=root/);
  assert.match(service, /NoNewPrivileges=true/);
  assert.match(example, /BACKUP_S3_BUCKET=backups-vatrushka/);
  assert.match(example, /BACKUP_AGE_RECIPIENT=/);
});

test("updater publication imports only checksum-bound inbox assets and publishes latest last", async () => {
  const wrapper = await readFile(
    new URL("bin/vatrushka-publish-updater", root),
    "utf8",
  );
  const example = await readFile(new URL("runtime.env.example", root), "utf8");
  assert.match(wrapper, /Updater manifest path is not allowlisted/);
  assert.match(wrapper, /Updater file checksum does not match/);
  assert.match(wrapper, /Updater latest manifest version does not match/);
  assert.match(wrapper, /VATRUSHKA_UPDATE_FEED_DIR/);
  assert.match(
    wrapper,
    /mv -f -- "\$staging\/latest\.yml" "\$update_dir\/latest\.yml"/,
  );
  assert.doesNotMatch(wrapper, /eval\b|sh -c|bash -c|docker compose/);
  assert.match(example, /VATRUSHKA_UPDATE_FEED_DIR=\/opt\/vatrushka\/updates/);
});

test("bootstrap verifier checks least privilege without printing runtime secrets", async () => {
  const verifier = await readFile(
    new URL("verify-host-bootstrap.sh", root),
    "utf8",
  );
  assert.match(verifier, /Run this bootstrap verifier as root/);
  assert.match(verifier, /Deploy user must not be in the Docker group/);
  assert.match(verifier, /vatrushka-wrapper-common\.sh/);
  assert.match(verifier, /\/etc\/vatrushka\/runtime\.env/);
  assert.match(verifier, /\/etc\/vatrushka\/app\.env/);
  assert.match(verifier, /\/etc\/vatrushka\/observability\.env/);
  assert.match(verifier, /VATRUSHKA_REGISTRY_AUTH_DIR/);
  assert.match(verifier, /bootstrap=ready environment=/);
  assert.doesNotMatch(verifier, /cat "?\$?\{?registry|printenv|env\s*$/mu);
});

test("digest deployment driver is root-configured and fails closed", async () => {
  const driver = await readFile(
    new URL("drivers/compose-digest-deploy", root),
    "utf8",
  );
  const example = await readFile(new URL("runtime.env.example", root), "utf8");
  assert.match(
    driver,
    /readonly RUNTIME_CONFIG=\/etc\/vatrushka\/runtime\.env/,
  );
  assert.match(driver, /Manifest path is not canonical/);
  assert.match(
    driver,
    /Manifest environment does not match runtime environment/,
  );
  assert.match(driver, /Manifest requires manual migration review/);
  assert.match(driver, /Runtime source does not match candidate manifest/);
  assert.match(
    driver,
    /Stored source archive does not match candidate manifest/,
  );
  assert.match(
    driver,
    /Runtime dependency lock does not match candidate manifest/,
  );
  assert.match(driver, /Runtime application path must be a symlink/);
  assert.match(driver, /Runtime LiveKit Compose file is missing/);
  assert.match(driver, /Runtime LiveKit configuration is invalid/);
  assert.match(driver, /validate_production_application_config/);
  assert.match(driver, /production-runtime-readiness\.py/);
  assert.match(driver, /Production application configuration is invalid/);
  assert.match(driver, /health\/live/);
  assert.match(driver, /health\/ready/);
  assert.match(driver, /-p vatrushka-livekit/);
  assert.match(driver, /LiveKit did not reach the running state/);
  assert.match(
    driver,
    /tar -xzf "\$SOURCE_ROOT\/\$source_archive_sha\.tar\.gz"/,
  );
  assert.match(driver, /VATRUSHKA_APP_ENV_FILE="\$env_file"/);
  assert.match(driver, /-p vatrushka/);
  assert.match(driver, /\.vatrushka-source\.sha256/);
  assert.match(
    driver,
    /docker --config "\$registry_auth_dir" pull "\$api_image"/,
  );
  assert.match(driver, /docker compose[\s\S]*up -d --no-build/);
  assert.match(driver, /rollback-\$manifest_checksum\.json/);
  assert.match(driver, /VATRUSHKA_DEPLOY_OPERATION/);
  assert.doesNotMatch(driver, /eval\b|sh -c|bash -c|--build/);
  assert.match(example, /VATRUSHKA_RUNTIME_ENVIRONMENT=staging/);
  assert.match(example, /VATRUSHKA_API_IMAGE_REPOSITORY=/);
  assert.match(
    example,
    /VATRUSHKA_RUNTIME_RELEASES_DIR=\/opt\/vatrushka\/releases/,
  );
  assert.match(example, /VATRUSHKA_ENV_FILE=\/etc\/vatrushka\/app\.env/);
  assert.doesNotMatch(
    example,
    /(PASSWORD|TOKEN|SECRET|PRIVATE_KEY|ACCESS_KEY)=/,
  );

  const compose = await readFile(
    new URL("../../infra/docker/docker-compose.yml", import.meta.url),
    "utf8",
  );
  assert.match(
    compose,
    /env_file: \$\{VATRUSHKA_APP_ENV_FILE:-\.\.\/\.\.\/\.env\}/,
  );
});

test("rollback driver can restore only a checksum-verified prior candidate", async () => {
  const driver = await readFile(
    new URL("drivers/compose-digest-rollback", root),
    "utf8",
  );
  assert.match(driver, /rollback-\[0-9a-f\]\*\.json/);
  assert.match(driver, /candidate-\$previous_checksum\.json/);
  assert.match(driver, /Rollback target does not match its candidate/);
  assert.match(driver, /VATRUSHKA_DEPLOY_OPERATION=rollback/);
  assert.doesNotMatch(
    driver,
    /eval\b|sh -c|bash -c|docker compose|down migration/,
  );
});

test("runtime status driver only reports the active root-owned release", async () => {
  const driver = await readFile(
    new URL("drivers/runtime-status", root),
    "utf8",
  );
  assert.match(driver, /Runtime status does not accept arguments/);
  assert.match(
    driver,
    /readonly runtime_config=\/etc\/vatrushka\/runtime\.env/,
  );
  assert.match(driver, /Runtime application path is not a symlink/);
  assert.match(driver, /health\/ready/);
  assert.match(driver, /ps --status running --services/);
  assert.match(
    driver,
    /Runtime application path is outside the release directory/,
  );
  assert.doesNotMatch(driver, /eval\b|sh -c|bash -c/);
});

test("observability driver starts only the active candidate through private collector endpoints", async () => {
  const driver = await readFile(
    new URL("drivers/observability-deploy", root),
    "utf8",
  );
  const example = await readFile(
    new URL("observability.env.example", root),
    "utf8",
  );
  assert.match(
    driver,
    /Observability manifest is not the active runtime candidate/,
  );
  assert.match(driver, /\/etc\/vatrushka\/observability\.env/);
  assert.match(driver, /http:\/\/10\\\.90\\\.0\\\.1:9090\/api\/v1\/write/);
  assert.match(driver, /http:\/\/10\\\.90\\\.0\\\.1:3100\/loki\/api\/v1\/push/);
  assert.match(driver, /-p vatrushka-observability-agent/);
  assert.match(driver, /--profile product --profile docker up -d --no-build/);
  assert.match(
    driver,
    /for service in alloy node-exporter cadvisor postgres-exporter redis-exporter/,
  );
  assert.doesNotMatch(driver, /eval\b|sh -c|bash -c/);
  assert.match(example, /OBSERVABILITY_ENVIRONMENT=production/);
  assert.match(
    example,
    /PROMETHEUS_REMOTE_WRITE_URL=http:\/\/10\.90\.0\.1:9090\/api\/v1\/write/,
  );
});

test("observer verification has a separate fixed, read-only sudo boundary", async () => {
  const observerRoot = new URL("../../ops/observer-wrappers/", import.meta.url);
  const wrapper = await readFile(
    new URL("vatrushka-observability-verify", observerRoot),
    "utf8",
  );
  const installer = await readFile(new URL("install.sh", observerRoot), "utf8");
  assert.match(wrapper, /^#!\/usr\/bin\/env sh\r?\nset -eu/m);
  assert.match(wrapper, /Only the production observer environment is allowed/);
  assert.match(
    wrapper,
    /label=com\.docker\.compose\.project=\$OBSERVABILITY_PROJECT/,
  );
  assert.match(wrapper, /label=com\.docker\.compose\.service=\$service/);
  assert.match(
    wrapper,
    /for service in caddy grafana prometheus alertmanager loki alloy/,
  );
  assert.match(wrapper, /10\.90\.0\.1:3000\/api\/health/);
  assert.match(wrapper, /10\.90\.0\.1:9090\/-\/ready/);
  assert.match(wrapper, /10\.90\.0\.1:3100\/ready/);
  assert.match(wrapper, /Product Alloy telemetry did not reach Prometheus/);
  assert.match(wrapper, /PRODUCT_OBSERVABILITY_HOST=vtr-prod-1/);
  assert.match(wrapper, /job=\\"alloy-agent\\"/);
  assert.match(wrapper, /attempt=\$\(\(attempt \+ 1\)\)/);
  assert.doesNotMatch(wrapper, /eval\b|sh -c|bash -c|up -d|restart|down/);
  assert.match(installer, /vatrushka-observability-verify production/);
  assert.doesNotMatch(
    installer,
    /NOPASSWD:\s*ALL|docker|compose|\/(?:bin\/)?(?:sh|bash)\b/,
  );
});

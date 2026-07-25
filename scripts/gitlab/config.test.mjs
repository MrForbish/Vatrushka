import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';

const rootFile = (path) => new URL(`../../${path}`, import.meta.url);
const read = (path) => readFile(rootFile(path), 'utf8');

test('GitLab pipeline preserves Linux, integration and Windows quality gates', async () => {
  const pipeline = await read('.gitlab-ci.yml');
  for (const job of ['merge-request-policy', 'verify', 'integration', 'desktop-behavior', 'visual-regression']) {
    assert.match(pipeline, new RegExp(`^${job}:`, 'mu'), job);
  }
  assert.match(pipeline, /postgres:17-alpine/u);
  assert.match(pipeline, /redis:8-alpine/u);
  assert.match(pipeline, /CI_DEPENDENCY_PROXY_GROUP_IMAGE_PREFIX/u);
  assert.match(
    pipeline,
    /\.production-ssh:[\s\S]*name: \$\{CI_DEPENDENCY_PROXY_GROUP_IMAGE_PREFIX\}\/alpine:3\.22/u,
  );
  assert.match(
    pipeline,
    /\.production-ssh:[\s\S]*environment:[\s\S]*name: production/u,
  );
  assert.equal(pipeline.match(/name: \$\{CI_DEPENDENCY_PROXY_GROUP_IMAGE_PREFIX\}\/postgres:17-alpine/gu)?.length, 2);
  assert.match(pipeline, /pull_policy: if-not-present/u);
  assert.match(pipeline, /tags: \[vatrushka-linux\]/u);
  assert.match(pipeline, /tags: \[vatrushka-windows\]/u);
  assert.match(
    pipeline,
    /desktop-behavior:[\s\S]*prepare-windows-browser-tests\.ps1/u,
  );
  assert.match(pipeline, /visual-regression:[\s\S]*prepare-windows-browser-tests\.ps1[\s\S]*after_script:[\s\S]*Get-NetTCPConnection -LocalPort 6006/u);
  const windowsPreflight = await read('scripts/ci/prepare-windows-browser-tests.ps1');
  assert.match(windowsPreflight, /taskkill\.exe[\s\S]*\/T[\s\S]*\/F/u);
  assert.match(windowsPreflight, /Get-NetTCPConnection -LocalPort 6006/u);
  assert.match(pipeline, /CI_PIPELINE_SOURCE == "merge_request_event"/u);
  assert.match(pipeline, /ELECTRON_BUILDER_CACHE: '\$CI_PROJECT_DIR\/\.cache\/electron-builder'/u);
  assert.match(pipeline, /\.cache\/electron-dist\//u);
});

test('develop produces an immutable staging candidate without exposing an updater feed', async () => {
  const pipeline = await read('.gitlab-ci.yml');
  const imageBuild = pipeline.slice(
    pipeline.indexOf('build-api-immutable-image:'),
    pipeline.indexOf('create-staging-candidate-manifest:'),
  );
  const manifest = pipeline.slice(
    pipeline.indexOf('create-staging-candidate-manifest:'),
    pipeline.indexOf('deploy-staging-candidate:'),
  );
  assert.match(pipeline, /CI_PIPELINE_SOURCE == "push" && \$CI_COMMIT_BRANCH == "develop"/u);
  assert.match(imageBuild, /docker buildx build[\s\S]*--push/u);
  assert.match(imageBuild, /docker context create vatrushka-dind[\s\S]*ca=\$DOCKER_CERT_PATH\/ca\.pem/u);
  assert.match(imageBuild, /docker buildx create --name vatrushka-candidate --driver docker-container --use vatrushka-dind/u);
  assert.match(imageBuild, /CI_REGISTRY_IMAGE\/api:\$CI_COMMIT_SHA/u);
  assert.match(imageBuild, /containerimage\.digest/u);
  assert.match(manifest, /SOURCE_ARCHIVE_SHA256/u);
  assert.match(manifest, /candidate\/\$SOURCE_ARCHIVE_SHA256\.tar\.gz/u);
  assert.match(manifest, /--migration-required/u);
  assert.match(manifest, /--migration-compatibility/u);
  assert.match(manifest, /--channel beta/u);
  assert.match(manifest, /--api-environment staging/u);
  assert.doesNotMatch(manifest, /latest\.yml|scp|ssh/u);

  const stagingDeploy = pipeline.slice(
    pipeline.indexOf('deploy-staging-candidate:'),
    pipeline.indexOf('merge-request-policy:'),
  );
  assert.doesNotMatch(stagingDeploy, /when: manual|allow_failure: true/u);
  assert.match(pipeline, /STAGING_SSH_PRIVATE_KEY_B64/u);
  assert.match(pipeline, /STAGING_SSH_HOST_KEY/u);
  assert.match(pipeline, /printf '%s' "\$STAGING_SSH_PRIVATE_KEY_B64" \| base64 -d > ~\/\.ssh\/id_ed25519/u);
  assert.match(pipeline, /ssh-keygen -lf ~\/\.ssh\/id_ed25519/u);
  assert.match(stagingDeploy, /vatrushka-preflight/u);
  assert.match(stagingDeploy, /vatrushka-deploy/u);
  assert.match(stagingDeploy, /vatrushka-runtime-status/u);
  assert.match(stagingDeploy, /vatrushka-observability-deploy/u);
  assert.doesNotMatch(stagingDeploy, /StrictHostKeyChecking=no|ssh-keyscan/u);
  assert.doesNotMatch(stagingDeploy, /PRODUCTION_SSH_|sudo -n sh|docker compose|--build/u);
});

test('protected tags promote an existing immutable image through the root-owned runtime wrapper', async () => {
  const pipeline = await read('.gitlab-ci.yml');
  const resolver = pipeline.slice(
    pipeline.indexOf('resolve-production-api-image:'),
    pipeline.indexOf('create-production-candidate-manifest:'),
  );
  const manifest = pipeline.slice(
    pipeline.indexOf('create-production-candidate-manifest:'),
    pipeline.indexOf('.production-ssh:'),
  );
  const productionDeploy = pipeline.slice(
    pipeline.indexOf('deploy-production-runtime:'),
    pipeline.indexOf('verify-production-observability:'),
  );
  const observerVerification = pipeline.slice(
    pipeline.indexOf('verify-production-observability:'),
    pipeline.indexOf('rollback-production-runtime:'),
  );
  const observabilityAgent = pipeline.slice(
    pipeline.indexOf('deploy-production-observability-agent:'),
    pipeline.indexOf('verify-production-observability:'),
  );
  const rollback = pipeline.slice(
    pipeline.indexOf('rollback-production-runtime:'),
    pipeline.indexOf('windows-production-package:'),
  );
  assert.match(pipeline, /\.release-candidate-rules:/u);
  assert.match(resolver, /vatrushka-release-candidate/u);
  assert.match(resolver, /RELEASE_CANDIDATE_SHA/u);
  assert.match(manifest, /channel == "stable"/u);
  assert.match(manifest, /apiEnvironment == "production"/u);
  assert.match(pipeline, /^resolve-production-desktop-package:[\s\S]*packages\/generic\/vatrushka-production-desktop/mu);
  assert.match(pipeline, /^resolve-production-desktop-package:[\s\S]*tr -d '\\r' < "\$archive\.sha256" \| sha256sum -c -/mu);
  assert.match(pipeline, /\.production-ssh:[\s\S]*tr -d '\\r' < "\$PRODUCTION_SSH_PRIVATE_KEY"/u);
  assert.match(pipeline, /\.production-ssh:[\s\S]*ssh-keygen -lf ~\/\.ssh\/id_ed25519/u);
  assert.match(pipeline, /\.production-ssh:[\s\S]*ssh-keygen -F "\$PRODUCTION_SSH_HOST" -f ~\/\.ssh\/known_hosts/u);
  assert.match(productionDeploy, /when: manual[\s\S]*allow_failure: false/u);
  assert.match(productionDeploy, /job: preflight-production-runtime/u);
  assert.match(productionDeploy, /job: backup-production-postgresql/u);
  assert.match(productionDeploy, /vatrushka-preflight/u);
  assert.match(productionDeploy, /vatrushka-deploy/u);
  assert.match(productionDeploy, /vatrushka-runtime-status/u);
  assert.doesNotMatch(productionDeploy, /sudo -n sh|apply-product-release|docker compose|--build/u);
  assert.match(observabilityAgent, /job: deploy-production-runtime/u);
  assert.match(observabilityAgent, /job: create-production-candidate-manifest/u);
  assert.match(observabilityAgent, /vatrushka-observability-deploy/u);
  assert.doesNotMatch(observabilityAgent, /when: manual|docker compose|--build/u);
  assert.doesNotMatch(observerVerification, /when: manual/u);
  assert.match(rollback, /when: manual[\s\S]*allow_failure: true/u);
  assert.match(rollback, /vatrushka-rollback/u);
  assert.match(rollback, /rollback-\$manifest_checksum\.json/u);
  assert.match(rollback, /vatrushka-runtime-status/u);
  const backup = pipeline.slice(
    pipeline.indexOf('backup-production-postgresql:'),
    pipeline.indexOf('deploy-production-observability-agent:'),
  );
  assert.match(backup, /CI_COMMIT_TAG =~/u);
  assert.match(backup, /job: preflight-production-runtime/u);
  assert.match(backup, /vatrushka-postgresql-backup/u);
  assert.doesNotMatch(backup, /when: manual|docker compose|--build/u);
  const preflight = pipeline.slice(
    pipeline.indexOf('preflight-production-runtime:'),
    pipeline.indexOf('deploy-production-observability-agent:'),
  );
  assert.match(preflight, /CI_COMMIT_TAG =~/u);
  assert.match(preflight, /vatrushka-production-readiness/u);
  assert.doesNotMatch(preflight, /when: manual|docker compose|--build/u);
});

test('Windows packaging uses verified local Electron and builder archives', async () => {
  const desktopPackage = JSON.parse(await read('apps/desktop/package.json'));
  const packaging = await read('infra/scripts/package-win.ps1');
  const pipeline = await read('.gitlab-ci.yml');
  const toolchain = JSON.parse(await read('infra/windows-toolchain-lock.json'));
  assert.match(desktopPackage.scripts['package:win'], /infra\/scripts\/package-win\.ps1/u);
  assert.match(packaging, /'--fail', '--location', '--retry', '5', '--retry-all-errors'/u);
  assert.match(packaging, /& curl\.exe @curlArguments/u);
  assert.match(packaging, /Get-FileHash -Algorithm SHA256/u);
  assert.match(packaging, /--config\.electronDist=\$electronZip/u);
  assert.match(packaging, /desktop-delivery-config\.mjs/u);
  assert.match(packaging, /--config\.publish\.url=\$\(\$delivery\.updateFeed\)/u);
  assert.match(packaging, /--config\.extraMetadata\.version=\$\(\$delivery\.version\)/u);
  assert.match(packaging, /JOB-TOKEN: \$env:CI_JOB_TOKEN/u);
  assert.match(packaging, /windows-toolchain-lock\.json/u);
  assert.match(pipeline, /WINDOWS_TOOLCHAIN_MIRROR:/u);
  assert.match(pipeline, /key: windows-toolchain-43-1-1/u);
  assert.equal(toolchain.electron.version, desktopPackage.devDependencies.electron);
  for (const artifact of ['winCodeSign-2.6.0.7z', 'nsis-3.0.4.1.7z', 'nsis-resources-3.4.1.7z']) {
    assert.ok(toolchain.builderArtifacts.some((item) => item.file === artifact), artifact);
  }
});

test('runtime keeps local builds separate from immutable delivery images', async () => {
  const compose = await read('infra/docker/docker-compose.yml');
  const runtimeGuide = await read('infra/docker/README.md');
  assert.match(compose, /image: \$\{API_IMAGE:-vatrushka-api:local\}/u);
  assert.match(compose, /api:[\s\S]*image: \$\{API_IMAGE:-vatrushka-api:local\}[\s\S]*build:/u);
  assert.match(runtimeGuide, /--no-build/u);
  assert.match(runtimeGuide, /@sha256/u);
  assert.match(runtimeGuide, /must not contain registry credentials/u);
});

test('observability validation runs only for observability changes with pinned tools', async () => {
  const pipeline = await read('.gitlab-ci.yml');
  for (const job of ['observability-compose', 'observability-prometheus', 'observability-alertmanager', 'observability-loki', 'observability-alloy', 'observability-caddy']) {
    assert.match(pipeline, new RegExp(`^${job}:`, 'mu'), job);
  }
  assert.match(pipeline, /changes: \[infra\/observability\/\*\*\/\*, scripts\/observability\/\*\*\/\*\]/u);
  assert.match(pipeline, /docker compose[\s\S]+config -q/u);
  assert.match(pipeline, /promtool check config/u);
  assert.match(pipeline, /amtool check-config/u);
  assert.match(pipeline, /loki -verify-config=true/u);
  assert.match(pipeline, /alloy validate/u);
  assert.match(pipeline, /caddy validate/u);
});

test('production publication is tag-only and uses protected file variables', async () => {
  const pipeline = await read('.gitlab-ci.yml');
  const publish = pipeline.slice(pipeline.indexOf('publish-production:'));
  const authSmoke = pipeline.slice(pipeline.indexOf('release-auth-smoke:'), pipeline.indexOf('.production-ssh:'));
  assert.match(authSmoke, /CI_MERGE_REQUEST_TARGET_BRANCH_NAME == "main"/u);
  assert.match(authSmoke, /GLAB_ENABLE_CI_AUTOLOGIN: 'true'/u);
  assert.match(authSmoke, /glab release view v0\.6\.6/u);
  assert.match(publish, /CI_COMMIT_TAG =~ \/\^v\[0-9\]/u);
  assert.match(pipeline, /^deploy-production-runtime:[\s\S]*PRODUCTION_SSH_PRIVATE_KEY/mu);
  assert.match(pipeline, /^verify-production-observability:[\s\S]*vatrushka-observability-verify/mu);
  assert.match(
    pipeline,
    /^verify-production-observability:[\s\S]*needs:[\s\S]*job: deploy-production-observability-agent/mu,
  );
  assert.match(pipeline, /OBSERVER_SSH_PRIVATE_KEY/u);
  assert.match(pipeline, /OBSERVER_SSH_HOST_KEY/u);
  assert.match(pipeline, /tr -d '\\r' < "\$OBSERVER_SSH_PRIVATE_KEY"/u);
  assert.match(pipeline, /ssh-keygen -lf ~\/\.ssh\/id_ed25519/u);
  assert.match(pipeline, /ssh-keygen -F "\$OBSERVER_SSH_HOST"/u);
  assert.doesNotMatch(pipeline, /root@\$OBSERVABILITY_SSH_HOST/u);
  assert.doesNotMatch(pipeline, /5\.42\.107\.9/u);
  assert.match(publish, /GLAB_ENABLE_CI_AUTOLOGIN: 'true'/u);
  assert.doesNotMatch(publish, /GITLAB_TOKEN:/u);
  assert.doesNotMatch(publish, /GITLAB_RELEASE_TOKEN/u);
  assert.match(publish, /resource_group: 'production-\$CI_COMMIT_TAG'/u);
  assert.doesNotMatch(publish, /mapfile|<\s*<\s*\(/u);
  assert.match(publish, /find production-desktop\/release[\s\S]+-exec glab release upload/u);
  assert.match(publish, /vatrushka-publish-updater/u);
  assert.match(publish, /\/var\/lib\/vatrushka\/inbox/u);
  assert.match(publish, /chmod 0644 "\$setup" "\$blockmap" "\$latest" "\$checksums" "\$metadata"/u);
  assert.doesNotMatch(publish, /PRODUCTION_UPDATE_PATH|latest\.yml\.next/u);
  assert.match(pipeline, /verify-production-observability:[\s\S]*deploy-production-runtime/u);
  const windowsPackage = pipeline.slice(pipeline.indexOf('windows-production-package:'), pipeline.indexOf('resolve-production-desktop-package:'));
  assert.match(pipeline, /windows-production-package:[\s\S]*\.release-candidate-rules/u);
  assert.match(pipeline, /windows-production-package:[\s\S]*packages\/generic\/vatrushka-production-desktop/u);
  assert.doesNotMatch(windowsPackage, /CI_COMMIT_TAG =~/u);
  assert.match(pipeline, /resolve-production-desktop-package:[\s\S]*CI_COMMIT_TAG =~/u);
  assert.doesNotMatch(windowsPackage, /deploy-observability-runtime/u);
  assert.match(windowsPackage, /\[string\]::IsNullOrWhiteSpace\(\$env:HAWK_DESKTOP_MAIN_TOKEN\)/u);
  assert.match(windowsPackage, /Write-Error 'HAWK_DESKTOP_MAIN_TOKEN must be configured/u);
  assert.match(windowsPackage, /\[string\]::IsNullOrWhiteSpace\(\$env:HAWK_DESKTOP_RENDERER_TOKEN\)/u);
  assert.match(windowsPackage, /Write-Error 'HAWK_DESKTOP_RENDERER_TOKEN must be configured/u);
  assert.match(windowsPackage, /function Test-HawkIntegrationToken/u);
  assert.match(windowsPackage, /HAWK_DESKTOP_MAIN_TOKEN must be a valid Hawk integration token/u);
  assert.match(windowsPackage, /HAWK_DESKTOP_RENDERER_TOKEN must be a valid Hawk integration token/u);
  assert.match(windowsPackage, /\$env:VITE_HAWK_DESKTOP_RENDERER_TOKEN = \$env:HAWK_DESKTOP_RENDERER_TOKEN/u);
  assert.match(windowsPackage, /\$env:VITE_HAWK_DESKTOP_RELEASE = \$release/u);
  assert.doesNotMatch(windowsPackage, /HAWK_DESKTOP_MAIN_TOKEN: '\$HAWK_DESKTOP_MAIN_TOKEN'/u);
  assert.doesNotMatch(windowsPackage, /HAWK_DESKTOP_RENDERER_TOKEN: '\$HAWK_DESKTOP_RENDERER_TOKEN'/u);
  assert.doesNotMatch(windowsPackage, /\$HAWK_INTEGRATION_TOKEN/u);
  assert.doesNotMatch(windowsPackage, /test -n "\$HAWK_INTEGRATION_TOKEN"/u);

  const viteConfig = await read('apps/desktop/electron.vite.config.ts');
  const sourceMapPlugin = await read('apps/desktop/scripts/hawk-source-map-plugin.mjs');
  assert.match(viteConfig, /hawkSourceMapPlugin\(\{ token: hawkMainToken, release: hawkRelease \}\)/u);
  assert.match(viteConfig, /hawkSourceMapPlugin\(\{ token: hawkRendererToken, release: hawkRelease \}\)/u);
  assert.match(sourceMapPlugin, /Hawk source-map upload failed with HTTP/u);
  assert.match(sourceMapPlugin, /if \(removeSourceMaps\) await rm\(filePath\)/u);
});

test('GitLab repository metadata replaces GitHub automation', async () => {
  const codeowners = await read('.gitlab/CODEOWNERS');
  const agentRules = await read('AGENTS.md');
  const releaseProcess = await read('docs/release-process.md');
  const hotfixTemplate = await read('.gitlab/merge_request_templates/hotfix.md');
  assert.match(codeowners, /@MrForbish/u);
  assert.match(agentRules, /GLAB_ENABLE_CI_AUTOLOGIN=true/u);
  assert.match(agentRules, /Do not create a new branch\/MR for a failed pre-merge pipeline/u);
  assert.match(agentRules, /Immediately set and read back `squash=false`/u);
  assert.match(releaseProcess, /release-auth-smoke/u);
  assert.match(releaseProcess, /последним[\s\S]*latest\.yml/u);
  assert.match(releaseProcess, /assemble\/X\.Y\.Z/u);
  assert.match(releaseProcess, /Tag pipeline не пересобирает API или Windows installer/u);
  assert.match(hotfixTemplate, /^## Release evidence$/mu);
  assert.match(hotfixTemplate, /^## Rollback$/mu);
  assert.match(hotfixTemplate, /^## Миграции и совместимость$/mu);
  for (const template of ['feature', 'release', 'hotfix', 'sync']) await access(rootFile(`.gitlab/merge_request_templates/${template}.md`));
  await assert.rejects(access(rootFile('.github/workflows/pr-checks.yml')));
  await assert.rejects(access(rootFile('.github/scripts/pr-policy.mjs')));
});

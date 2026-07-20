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
    /visual-regression:[\s\S]*Get-NetTCPConnection -LocalPort 6006[\s\S]*Stop-Process -Id \$_ -Force[\s\S]*after_script:[\s\S]*Get-NetTCPConnection -LocalPort 6006/u,
  );
  assert.match(pipeline, /CI_PIPELINE_SOURCE == "merge_request_event"/u);
  assert.match(pipeline, /ELECTRON_BUILDER_CACHE: '\$CI_PROJECT_DIR\/\.cache\/electron-builder'/u);
  assert.match(pipeline, /\.cache\/electron-dist\//u);
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
  assert.match(packaging, /JOB-TOKEN: \$env:CI_JOB_TOKEN/u);
  assert.match(packaging, /windows-toolchain-lock\.json/u);
  assert.match(pipeline, /WINDOWS_TOOLCHAIN_MIRROR:/u);
  assert.match(pipeline, /key: windows-toolchain-43-1-1/u);
  assert.equal(toolchain.electron.version, desktopPackage.devDependencies.electron);
  for (const artifact of ['winCodeSign-2.6.0.7z', 'nsis-3.0.4.1.7z', 'nsis-resources-3.4.1.7z']) {
    assert.ok(toolchain.builderArtifacts.some((item) => item.file === artifact), artifact);
  }
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
  const authSmoke = pipeline.slice(pipeline.indexOf('release-auth-smoke:'), pipeline.indexOf('prepare-production-source:'));
  assert.match(authSmoke, /CI_MERGE_REQUEST_TARGET_BRANCH_NAME == "main"/u);
  assert.match(authSmoke, /GLAB_ENABLE_CI_AUTOLOGIN: 'true'/u);
  assert.match(authSmoke, /glab release view v0\.6\.6/u);
  assert.match(publish, /CI_COMMIT_TAG =~ \/\^v\[0-9\]/u);
  assert.match(pipeline, /^deploy-production-runtime:[\s\S]*PRODUCTION_SSH_PRIVATE_KEY/mu);
  assert.match(pipeline, /^deploy-observability-runtime:[\s\S]*apply-observability-release/mu);
  assert.match(publish, /GLAB_ENABLE_CI_AUTOLOGIN: 'true'/u);
  assert.doesNotMatch(publish, /GITLAB_TOKEN:/u);
  assert.doesNotMatch(publish, /GITLAB_RELEASE_TOKEN/u);
  assert.match(publish, /resource_group: 'production-\$CI_COMMIT_TAG'/u);
  assert.doesNotMatch(publish, /mapfile|<\s*<\s*\(/u);
  assert.match(publish, /find apps\/desktop\/release[\s\S]+-exec glab release upload/u);
  assert.match(pipeline, /deploy-observability-runtime:[\s\S]*deploy-production-runtime/u);
  assert.match(pipeline, /windows-production-package:[\s\S]*deploy-observability-runtime/u);
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
  assert.match(releaseProcess, /latest\.yml.*готового API/u);
  assert.match(hotfixTemplate, /^## Release evidence$/mu);
  assert.match(hotfixTemplate, /^## Rollback$/mu);
  assert.match(hotfixTemplate, /^## Миграции и совместимость$/mu);
  for (const template of ['feature', 'release', 'hotfix', 'sync']) await access(rootFile(`.gitlab/merge_request_templates/${template}.md`));
  await assert.rejects(access(rootFile('.github/workflows/pr-checks.yml')));
  await assert.rejects(access(rootFile('.github/scripts/pr-policy.mjs')));
});

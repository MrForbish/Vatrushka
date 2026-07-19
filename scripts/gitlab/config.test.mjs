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
  assert.equal(pipeline.match(/name: \$\{CI_DEPENDENCY_PROXY_GROUP_IMAGE_PREFIX\}\/postgres:17-alpine/gu)?.length, 2);
  assert.match(pipeline, /pull_policy: if-not-present/u);
  assert.match(pipeline, /tags: \[vatrushka-linux\]/u);
  assert.match(pipeline, /tags: \[vatrushka-windows\]/u);
  assert.match(pipeline, /CI_PIPELINE_SOURCE == "merge_request_event"/u);
});

test('production publication is tag-only and uses protected file variables', async () => {
  const pipeline = await read('.gitlab-ci.yml');
  const publish = pipeline.slice(pipeline.indexOf('publish-production:'));
  assert.match(publish, /CI_COMMIT_TAG =~ \/\^v\[0-9\]/u);
  assert.match(publish, /PRODUCTION_SSH_PRIVATE_KEY/u);
  assert.match(publish, /PRODUCTION_SSH_HOST_KEY/u);
  assert.match(publish, /resource_group: 'production-\$CI_COMMIT_TAG'/u);
  assert.doesNotMatch(publish, /mapfile|<\s*<\s*\(/u);
  assert.match(publish, /find apps\/desktop\/release[\s\S]+-exec glab release upload/u);
  assert.doesNotMatch(pipeline.slice(0, pipeline.indexOf('publish-production:')), /PRODUCTION_SSH_PRIVATE_KEY/u);
});

test('GitLab repository metadata replaces GitHub automation', async () => {
  const codeowners = await read('.gitlab/CODEOWNERS');
  assert.match(codeowners, /@MrForbish/u);
  for (const template of ['feature', 'release-assemble', 'release', 'hotfix', 'sync']) await access(rootFile(`.gitlab/merge_request_templates/${template}.md`));
  await assert.rejects(access(rootFile('.github/workflows/pr-checks.yml')));
  await assert.rejects(access(rootFile('.github/scripts/pr-policy.mjs')));
});

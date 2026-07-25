import assert from 'node:assert/strict';
import test from 'node:test';

import { validateCandidateManifest, validateRollbackManifest } from './manifest.mjs';

const sha = 'a'.repeat(64);
const commit = 'b'.repeat(40);
const validCandidate = {
  version: '0.9.0-beta.42',
  commitSha: commit,
  sourceArchiveSha256: sha,
  dependencyLockSha256: sha,
  channel: 'beta',
  apiEnvironment: 'staging',
  images: { api: `sha256:${sha}`, worker: `sha256:${sha}` },
};

test('accepts a redacted immutable candidate manifest', () => {
  assert.equal(validateCandidateManifest(validCandidate).channel, 'beta');
});

test('rejects production channel with a staging-only contract mismatch', () => {
  assert.throws(() => validateCandidateManifest({ ...validCandidate, channel: 'unknown' }), /channel/u);
});

test('rejects credentials in any manifest field', () => {
  assert.throws(() => validateCandidateManifest({ ...validCandidate, deploymentToken: 'never-store-me' }), /not allowed/u);
  assert.throws(() => validateCandidateManifest({ ...validCandidate, metadata: [{ secret: 'never-store-me' }] }), /not allowed/u);
});

test('accepts bounded migration and desktop evidence', () => {
  const manifest = validateCandidateManifest({
    ...validCandidate,
    migration: { required: true, compatibility: 'backward-compatible' },
    desktop: { installerSha256: sha, blockmapSha256: sha },
  });
  assert.equal(manifest.migration.compatibility, 'backward-compatible');
});

test('validates rollback references without accepting secrets', () => {
  const rollback = {
    releaseVersion: '0.9.0',
    previousCandidateSha256: sha,
    commitSha: commit,
    dependencyLockSha256: sha,
    images: { api: `sha256:${sha}` },
  };
  assert.equal(validateRollbackManifest(rollback).releaseVersion, '0.9.0');
});

test('rejects an incomplete rollback target', () => {
  assert.throws(() => validateRollbackManifest({
    releaseVersion: '0.9.0',
    previousCandidateSha256: sha,
    commitSha: commit,
    dependencyLockSha256: sha,
    images: {},
  }), /images must not be empty/u);
});

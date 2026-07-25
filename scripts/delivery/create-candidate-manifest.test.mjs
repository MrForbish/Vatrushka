import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createCandidateManifest } from './create-candidate-manifest.mjs';

const commitSha = 'b'.repeat(40);
const digest = `sha256:${'a'.repeat(64)}`;

test('creates a redacted immutable manifest from local evidence', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vatrushka-delivery-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const sourceArchive = join(directory, 'source.tar.gz');
  const dependencyLock = join(directory, 'package-lock.json');
  await writeFile(sourceArchive, 'source evidence');
  await writeFile(dependencyLock, 'lock evidence');

  const result = JSON.parse(await createCandidateManifest({
    version: '0.9.0-beta.42',
    commitSha,
    sourceArchive,
    dependencyLock,
    channel: 'beta',
    apiEnvironment: 'staging',
    images: { api: digest },
  }));

  assert.equal(result.commitSha, commitSha);
  assert.equal(result.images.api, digest);
  assert.equal(result.sourceArchiveSha256.length, 64);
  assert.equal(JSON.stringify(result).includes('token'), false);
});

test('records conservative migration metadata when supplied', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vatrushka-delivery-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const sourceArchive = join(directory, 'source.tar.gz');
  const dependencyLock = join(directory, 'package-lock.json');
  await writeFile(sourceArchive, 'source evidence');
  await writeFile(dependencyLock, 'lock evidence');

  const result = JSON.parse(await createCandidateManifest({
    version: '0.9.0-beta.42',
    commitSha,
    sourceArchive,
    dependencyLock,
    channel: 'beta',
    apiEnvironment: 'staging',
    images: { api: digest },
    migrationRequired: 'true',
    migrationCompatibility: 'manual-review',
  }));

  assert.deepEqual(result.migration, { required: true, compatibility: 'manual-review' });
});

test('rejects partial migration metadata', async () => {
  await assert.rejects(
    createCandidateManifest({
      version: '0.9.0-beta.42',
      commitSha,
      sourceArchive: 'missing.tar.gz',
      dependencyLock: 'missing-lock.json',
      channel: 'beta',
      apiEnvironment: 'staging',
      images: { api: digest },
      migrationRequired: 'true',
    }),
    /Migration metadata/u,
  );
});

test('rejects an invalid migration-required value', async () => {
  await assert.rejects(
    createCandidateManifest({
      version: '0.9.0-beta.42',
      commitSha,
      sourceArchive: 'missing.tar.gz',
      dependencyLock: 'missing-lock.json',
      channel: 'beta',
      apiEnvironment: 'staging',
      images: { api: digest },
      migrationRequired: 'maybe',
      migrationCompatibility: 'manual-review',
    }),
    /Migration required/u,
  );
});

test('rejects missing immutable evidence', async () => {
  await assert.rejects(
    createCandidateManifest({
      version: '0.9.0-beta.42',
      commitSha,
      sourceArchive: 'missing.tar.gz',
      dependencyLock: 'missing-lock.json',
      channel: 'beta',
      apiEnvironment: 'staging',
      images: { api: digest },
    }),
  );
});

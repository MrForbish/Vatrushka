import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReleasePlan } from './prepare.mjs';
import { rcArtifactName } from './release-utils.mjs';
import { validateRelease } from './validate.mjs';

test('builds immutable assemble and release branches from different bases', () => {
  assert.deepEqual(buildReleasePlan('0.7.0', 'main'), {
    version: '0.7.0',
    productionBranch: 'main',
    developRef: 'origin/develop',
    productionRef: 'origin/main',
    assembleBranch: 'assemble/0.7.0',
    releaseBranch: 'release/0.7.0',
  });
});

test('builds deterministic RC artifact names', () => {
  assert.equal(rcArtifactName('0.7.0', 123, 'abcdef0123456789'), 'Vatrushka-0.7.0-rc.123-abcdef0.exe');
});

test('rejects non-production versions', () => {
  assert.throws(() => buildReleasePlan('0.7.0-rc.1', 'main'), /Invalid production SemVer/);
});

test('validates the current release metadata on its release branch', async () => {
  const result = await validateRelease({ branch: 'release/0.6.1' });
  assert.deepEqual(result.errors, []);
});

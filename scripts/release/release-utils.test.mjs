import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReleasePlan } from './prepare.mjs';
import { validateRelease } from './validate.mjs';
import { collectVersionErrors } from './version-check.mjs';

test('builds an assembly and release plan', () => {
  assert.deepEqual(buildReleasePlan('0.7.0', 'main'), {
    version: '0.7.0',
    productionBranch: 'main',
    developRef: 'origin/develop',
    assemblyRef: 'assemble/0.7.0',
    releaseRef: 'release/0.7.0',
    productionRef: 'origin/main',
  });
});

test('rejects non-production versions', () => {
  assert.throws(() => buildReleasePlan('0.7.0-rc.1', 'main'), /Invalid production SemVer/);
});

test('validates the current release metadata on its release branch', async () => {
  const { version } = await collectVersionErrors();
  const result = await validateRelease({ branch: `release/${version}` });
  assert.deepEqual(result.errors, []);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveMigrationCompatibility } from './resolve-migration-compatibility.mjs';

const policy = {
  'apps/api/drizzle/0027_stream_video_default_role.sql': { compatibility: 'backward-compatible' },
};

test('marks no migration changes as none', () => {
  assert.deepEqual(resolveMigrationCompatibility([], policy), { required: false, compatibility: 'none' });
});

test('uses explicitly reviewed compatibility for an allowlisted migration', () => {
  assert.deepEqual(
    resolveMigrationCompatibility(['apps/api/drizzle/0027_stream_video_default_role.sql'], policy),
    { required: true, compatibility: 'backward-compatible' },
  );
});

test('requires manual review for an unreviewed migration', () => {
  assert.deepEqual(
    resolveMigrationCompatibility(['apps/api/drizzle/0028_unknown.sql'], policy),
    { required: true, compatibility: 'manual-review' },
  );
});

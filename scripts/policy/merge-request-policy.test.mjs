import assert from 'node:assert/strict';
import test from 'node:test';
import { validateMergeRequest } from './merge-request-policy.mjs';

const accepted = [
  ['feat/WEB-20758-screen-share-quality', 'develop', '[WEB-20758] Screen share quality'],
  ['fix/WEB-20810-message-duplicates', 'develop', '[WEB-20810] Message duplicates'],
  ['chore/migrate-to-gitlab', 'develop', '[CHORE] Migrate to GitLab'],
  ['chore/migrate-to-gitlab', 'develop', 'Draft: [CHORE] Migrate to GitLab'],
  ['assemble/0.8.22', 'release/0.8.22', '[ASSEMBLE] Vatrushka v0.8.22'],
  ['release/0.8.22', 'main', '[RELEASE] Vatrushka v0.8.22'],
  ['release-fix/0.8.22-fix-updater', 'release/0.8.22', '[RELEASE FIX] Repair updater metadata'],
  ['hotfix/0.6.2-auth-session-crash', 'main', '[HOTFIX] Vatrushka v0.6.2'],
  ['main', 'develop', '[SYNC] v0.8.22 back to develop'],
  ['main', 'release/0.8.22', '[SYNC] v0.8.22 into active release'],
];

for (const [source, target, title] of accepted) {
  test(`accepts ${source} -> ${target}`, () => {
    assert.deepEqual(validateMergeRequest({ source, target, title }), { valid: true, errors: [] });
  });
}

const rejected = [
  ['feat/WEB-20758-screen-share-quality', 'main', '[WEB-20758] Feature'],
  ['feat/screen-share-quality', 'develop', '[FEATURE] Feature without ticket'],
  ['develop', 'main', '[RELEASE] Direct production release'],
  ['assemble/0.7.0', 'main', '[ASSEMBLE] Wrong target'],
  ['release/0.7.0', 'main', '[CHORE] Wrong release title'],
  ['release-fix/0.7.0-fix-updater', 'main', '[RELEASE FIX] Wrong target'],
  ['hotfix/0.6.2-auth-session-crash', 'develop', '[HOTFIX] Wrong target'],
  ['docs/release-process', 'develop', 'Docs without required title prefix'],
];

for (const [source, target, title] of rejected) {
  test(`rejects ${source} -> ${target}`, () => {
    const result = validateMergeRequest({ source, target, title });
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0);
  });
}

test('supports another production branch only when explicitly configured', () => {
  assert.equal(validateMergeRequest({ source: 'release/0.7.0', target: 'master', title: '[RELEASE] v0.7.0', productionBranch: 'master' }).valid, true);
  assert.equal(validateMergeRequest({ source: 'release/0.7.0', target: 'main', title: '[RELEASE] v0.7.0', productionBranch: 'master' }).valid, false);
});

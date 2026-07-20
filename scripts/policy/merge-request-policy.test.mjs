import assert from 'node:assert/strict';
import test from 'node:test';
import { validateMergeRequest } from './merge-request-policy.mjs';

const accepted = [
  ['feat/WEB-20758-screen-share-quality', 'develop', '[WEB-20758] Улучшить screen share'],
  ['fix/WEB-20810-message-duplicates', 'develop', '[WEB-20810] Исправить дубли'],
  ['chore/migrate-to-gitlab', 'develop', '[CHORE] Migrate to GitLab'],
  ['chore/migrate-to-gitlab', 'develop', 'Draft: [CHORE] Migrate to GitLab'],
  ['chore/release-0.8.11-preparation', 'develop', '[CHORE] Prepare v0.8.11 release'],
  ['develop', 'main', '[RELEASE] Vatrushka v0.7.0'],
  ['hotfix/0.6.2-auth-session-crash', 'main', '[HOTFIX] Vatrushka v0.6.2'],
  ['hotfix/0.6.2-auth-session-crash', 'main', '[WIP] [HOTFIX] Vatrushka v0.6.2'],
  ['main', 'develop', '[SYNC] v0.7.0 back to develop'],
];

for (const [source, target, title] of accepted) {
  test(`accepts ${source} -> ${target}`, () => {
    assert.deepEqual(validateMergeRequest({ source, target, title }), { valid: true, errors: [] });
  });
}

const rejected = [
  ['feat/WEB-20758-screen-share-quality', 'main', '[WEB-20758] Feature'],
  ['feat/screen-share-quality', 'develop', '[FEATURE] Feature without ticket'],
  ['develop', 'main', '[CHORE] Direct production release'],
  ['release/0.7.0', 'main', '[RELEASE] Legacy release branch'],
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
  assert.equal(validateMergeRequest({ source: 'develop', target: 'master', title: '[RELEASE] v0.7.0', productionBranch: 'master' }).valid, true);
  assert.equal(validateMergeRequest({ source: 'develop', target: 'main', title: '[RELEASE] v0.7.0', productionBranch: 'master' }).valid, false);
});

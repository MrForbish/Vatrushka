import assert from 'node:assert/strict';
import test from 'node:test';
import { validatePullRequest } from './pr-policy.mjs';

const accepted = [
  ['feat/WEB-20758-screen-share-quality', 'develop', '[WEB-20758] Улучшить screen share'],
  ['fix/WEB-20810-message-duplicates', 'develop', '[WEB-20810] Исправить дубли'],
  ['chore/update-livekit-sdk', 'develop', '[CHORE] Update LiveKit SDK'],
  ['assemble/0.7.0', 'release/0.7.0', '[ASSEMBLE] Vatrushka v0.7.0'],
  ['release-fix/0.7.0-audio-reconnect', 'release/0.7.0', '[RELEASE FIX] v0.7.0 — audio reconnect'],
  ['release/0.7.0', 'main', '[RELEASE] Vatrushka v0.7.0'],
  ['hotfix/0.6.2-auth-session-crash', 'main', '[HOTFIX] Vatrushka v0.6.2'],
  ['main', 'develop', '[SYNC] v0.7.0 back to develop'],
  ['main', 'release/0.8.0', '[SYNC] hotfix into v0.8.0'],
];

for (const [head, base, title] of accepted) {
  test(`accepts ${head} -> ${base}`, () => {
    assert.deepEqual(validatePullRequest({ head, base, title }), { valid: true, errors: [] });
  });
}

const rejected = [
  ['feat/WEB-20758-screen-share-quality', 'main', '[WEB-20758] Feature'],
  ['feat/screen-share-quality', 'develop', '[FEATURE] Feature without ticket'],
  ['assemble/0.7.0', 'release/0.6.0', '[ASSEMBLE] Wrong version'],
  ['release/0.7.0', 'develop', '[RELEASE] Wrong target'],
  ['develop', 'main', '[RELEASE] Direct develop release'],
  ['hotfix/0.6.2-auth-session-crash', 'develop', '[HOTFIX] Wrong target'],
  ['docs/release-process', 'develop', 'Docs without required title prefix'],
];

for (const [head, base, title] of rejected) {
  test(`rejects ${head} -> ${base}`, () => {
    const result = validatePullRequest({ head, base, title });
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0);
  });
}

test('supports master only as an explicit transition production branch', () => {
  assert.equal(validatePullRequest({ head: 'release/0.7.0', base: 'master', title: '[RELEASE] v0.7.0', productionBranch: 'master' }).valid, true);
  assert.equal(validatePullRequest({ head: 'release/0.7.0', base: 'main', title: '[RELEASE] v0.7.0', productionBranch: 'master' }).valid, false);
});

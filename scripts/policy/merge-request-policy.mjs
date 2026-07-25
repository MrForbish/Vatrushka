import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SEMVER = '(\\d+\\.\\d+\\.\\d+)';

function addError(errors, condition, message) {
  if (!condition) errors.push(message);
}

function taskBranch(source) {
  const ticketed = source.match(/^(feat|fix)\/([A-Za-z]+-\d+)-([a-z0-9][a-z0-9-]*)$/u);
  if (ticketed) return { titlePrefix: `[${ticketed[2].toUpperCase()}]` };

  const unticketed = source.match(/^(chore|refactor|test|docs)\/([a-z0-9][a-z0-9-]*)$/u);
  if (unticketed) return { titlePrefix: `[${unticketed[1].toUpperCase()}]` };

  return null;
}

function policyTitle(title) {
  return title.replace(/^(?:(?:draft|wip)\s*:\s*|\[(?:draft|wip)\]\s*)/iu, '');
}

export function validateMergeRequest({ source, target, title, productionBranch = 'main' }) {
  const errors = [];
  const normalizedTitle = policyTitle(title);
  const task = taskBranch(source);

  if (task) {
    addError(errors, target === 'develop', `${source} may only merge into develop`);
    addError(errors, normalizedTitle.startsWith(task.titlePrefix), `MR title must start with ${task.titlePrefix}`);
    return { valid: errors.length === 0, errors };
  }

  const assembly = source.match(new RegExp(`^assemble/${SEMVER}$`, 'u'));
  if (assembly) {
    const version = assembly[1];
    addError(errors, target === `release/${version}`, `${source} may only merge into release/${version}`);
    addError(errors, normalizedTitle.startsWith('[ASSEMBLE]'), 'Assembly MR title must start with [ASSEMBLE]');
    return { valid: errors.length === 0, errors };
  }

  const release = source.match(new RegExp(`^release/${SEMVER}$`, 'u'));
  if (release) {
    addError(errors, target === productionBranch, `${source} may only merge into ${productionBranch}`);
    addError(errors, normalizedTitle.startsWith('[RELEASE]'), 'Release MR title must start with [RELEASE]');
    return { valid: errors.length === 0, errors };
  }

  const releaseFix = source.match(new RegExp(`^release-fix/${SEMVER}-[a-z0-9][a-z0-9-]*$`, 'u'));
  if (releaseFix) {
    const version = releaseFix[1];
    addError(errors, target === `release/${version}`, `${source} may only merge into release/${version}`);
    addError(errors, normalizedTitle.startsWith('[RELEASE FIX]'), 'Release-fix MR title must start with [RELEASE FIX]');
    return { valid: errors.length === 0, errors };
  }

  const hotfix = source.match(new RegExp(`^hotfix/${SEMVER}-[a-z0-9][a-z0-9-]*$`, 'u'));
  if (hotfix) {
    addError(errors, target === productionBranch, `${source} may only merge into ${productionBranch}`);
    addError(errors, normalizedTitle.startsWith('[HOTFIX]'), 'Hotfix MR title must start with [HOTFIX]');
    return { valid: errors.length === 0, errors };
  }

  if (source === productionBranch) {
    const validTarget = target === 'develop' || new RegExp(`^release/${SEMVER}$`, 'u').test(target);
    addError(errors, validTarget, `${productionBranch} may only sync into develop or an active release branch`);
    addError(errors, normalizedTitle.startsWith('[SYNC]'), 'Sync MR title must start with [SYNC]');
    return { valid: errors.length === 0, errors };
  }

  errors.push(`Invalid or incorrectly named source branch: ${source}`);
  return { valid: false, errors };
}

function runFromCli() {
  const source = process.env.CI_MERGE_REQUEST_SOURCE_BRANCH_NAME ?? process.argv[2];
  const target = process.env.CI_MERGE_REQUEST_TARGET_BRANCH_NAME ?? process.argv[3];
  const title = process.env.CI_MERGE_REQUEST_TITLE ?? process.argv[4];
  const productionBranch = process.env.PRODUCTION_BRANCH ?? process.argv[5] ?? 'main';

  if (!source || !target || !title) {
    console.error('Usage: node scripts/policy/merge-request-policy.mjs <source> <target> <title> [production-branch]');
    process.exitCode = 2;
    return;
  }

  const result = validateMergeRequest({ source, target, title, productionBranch });
  if (!result.valid) {
    console.error(`Merge request policy rejected ${source} -> ${target}:`);
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Merge request policy accepted ${source} -> ${target}`);
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1])) runFromCli();

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
  const task = taskBranch(source);
  const normalizedTitle = policyTitle(title);

  if (task) {
    addError(errors, target === 'develop', `${source} разрешено вливать только в develop`);
    addError(errors, normalizedTitle.startsWith(task.titlePrefix), `Название MR должно начинаться с ${task.titlePrefix}`);
    return { valid: errors.length === 0, errors };
  }

  const assemble = source.match(new RegExp(`^assemble/${SEMVER}$`, 'u'));
  if (assemble) {
    const releaseTarget = target.match(new RegExp(`^release/${SEMVER}$`, 'u'));
    addError(errors, Boolean(releaseTarget), `${source} разрешено вливать только в release/<version>`);
    addError(errors, !releaseTarget || assemble[1] === releaseTarget[1], 'Версии assemble и release веток должны совпадать');
    addError(errors, normalizedTitle.startsWith('[ASSEMBLE]'), 'Название assembly MR должно начинаться с [ASSEMBLE]');
    return { valid: errors.length === 0, errors };
  }

  const releaseFix = source.match(new RegExp(`^release-fix/${SEMVER}-[a-z0-9][a-z0-9-]*$`, 'u'));
  if (releaseFix) {
    const releaseTarget = target.match(new RegExp(`^release/${SEMVER}$`, 'u'));
    addError(errors, Boolean(releaseTarget), `${source} разрешено вливать только в release/<version>`);
    addError(errors, !releaseTarget || releaseFix[1] === releaseTarget[1], 'Версии release-fix и release веток должны совпадать');
    addError(errors, normalizedTitle.startsWith('[RELEASE FIX]'), 'Название release fix MR должно начинаться с [RELEASE FIX]');
    return { valid: errors.length === 0, errors };
  }

  const release = source.match(new RegExp(`^release/${SEMVER}$`, 'u'));
  if (release) {
    addError(errors, target === productionBranch, `${source} разрешено вливать только в ${productionBranch}`);
    addError(errors, normalizedTitle.startsWith('[RELEASE]'), 'Название release MR должно начинаться с [RELEASE]');
    return { valid: errors.length === 0, errors };
  }

  const hotfix = source.match(new RegExp(`^hotfix/${SEMVER}-[a-z0-9][a-z0-9-]*$`, 'u'));
  if (hotfix) {
    addError(errors, target === productionBranch, `${source} разрешено вливать только в ${productionBranch}`);
    addError(errors, normalizedTitle.startsWith('[HOTFIX]'), 'Название hotfix MR должно начинаться с [HOTFIX]');
    return { valid: errors.length === 0, errors };
  }

  if (source === productionBranch) {
    const validTarget = target === 'develop' || /^release\/\d+\.\d+\.\d+$/u.test(target);
    addError(errors, validTarget, `${productionBranch} разрешено синхронизировать только в develop или активную release ветку`);
    addError(errors, normalizedTitle.startsWith('[SYNC]'), 'Название sync MR должно начинаться с [SYNC]');
    return { valid: errors.length === 0, errors };
  }

  errors.push(`Недопустимая или неверно названная source-ветка: ${source}`);
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

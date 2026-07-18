/* global process */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SEMVER = '(\\d+\\.\\d+\\.\\d+)';

function addError(errors, condition, message) {
  if (!condition) errors.push(message);
}

function taskBranch(head) {
  const ticketed = head.match(/^(feat|fix)\/([A-Za-z]+-\d+)-([a-z0-9][a-z0-9-]*)$/);
  if (ticketed) return { type: ticketed[1], titlePrefix: `[${ticketed[2].toUpperCase()}]` };

  const unticketed = head.match(/^(chore|refactor|test|docs)\/([a-z0-9][a-z0-9-]*)$/);
  if (unticketed) return { type: unticketed[1], titlePrefix: `[${unticketed[1].toUpperCase()}]` };

  return null;
}

export function validatePullRequest({ base, head, title, productionBranch = 'main' }) {
  const errors = [];
  const task = taskBranch(head);

  if (task) {
    addError(errors, base === 'develop', `${head} разрешено вливать только в develop`);
    addError(errors, title.startsWith(task.titlePrefix), `Название PR должно начинаться с ${task.titlePrefix}`);
    return { valid: errors.length === 0, errors };
  }

  const assemble = head.match(new RegExp(`^assemble/${SEMVER}$`));
  if (assemble) {
    const target = base.match(new RegExp(`^release/${SEMVER}$`));
    addError(errors, Boolean(target), `${head} разрешено вливать только в release/<version>`);
    addError(errors, !target || assemble[1] === target[1], 'Версии assemble и release веток должны совпадать');
    addError(errors, title.startsWith('[ASSEMBLE]'), 'Название assembly PR должно начинаться с [ASSEMBLE]');
    return { valid: errors.length === 0, errors };
  }

  const releaseFix = head.match(new RegExp(`^release-fix/${SEMVER}-[a-z0-9][a-z0-9-]*$`));
  if (releaseFix) {
    const target = base.match(new RegExp(`^release/${SEMVER}$`));
    addError(errors, Boolean(target), `${head} разрешено вливать только в release/<version>`);
    addError(errors, !target || releaseFix[1] === target[1], 'Версии release-fix и release веток должны совпадать');
    addError(errors, title.startsWith('[RELEASE FIX]'), 'Название release fix PR должно начинаться с [RELEASE FIX]');
    return { valid: errors.length === 0, errors };
  }

  const release = head.match(new RegExp(`^release/${SEMVER}$`));
  if (release) {
    addError(errors, base === productionBranch, `${head} разрешено вливать только в ${productionBranch}`);
    addError(errors, title.startsWith('[RELEASE]'), 'Название release PR должно начинаться с [RELEASE]');
    return { valid: errors.length === 0, errors };
  }

  const hotfix = head.match(new RegExp(`^hotfix/${SEMVER}-[a-z0-9][a-z0-9-]*$`));
  if (hotfix) {
    addError(errors, base === productionBranch, `${head} разрешено вливать только в ${productionBranch}`);
    addError(errors, title.startsWith('[HOTFIX]'), 'Название hotfix PR должно начинаться с [HOTFIX]');
    return { valid: errors.length === 0, errors };
  }

  if (head === productionBranch) {
    const validTarget = base === 'develop' || /^release\/\d+\.\d+\.\d+$/.test(base);
    addError(errors, validTarget, `${productionBranch} разрешено синхронизировать только в develop или активную release ветку`);
    addError(errors, title.startsWith('[SYNC]'), 'Название sync PR должно начинаться с [SYNC]');
    return { valid: errors.length === 0, errors };
  }

  errors.push(`Недопустимая или неверно названная source-ветка: ${head}`);
  return { valid: false, errors };
}

function runFromCli() {
  const head = process.env.PR_HEAD ?? process.argv[2];
  const base = process.env.PR_BASE ?? process.argv[3];
  const title = process.env.PR_TITLE ?? process.argv[4];
  const productionBranch = process.env.PRODUCTION_BRANCH ?? process.argv[5] ?? 'main';

  if (!head || !base || !title) {
    console.error('Usage: PR_HEAD=<head> PR_BASE=<base> PR_TITLE=<title> node .github/scripts/pr-policy.mjs');
    process.exitCode = 2;
    return;
  }

  const result = validatePullRequest({ head, base, title, productionBranch });
  if (!result.valid) {
    console.error(`PR policy rejected ${head} -> ${base}:`);
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(`PR policy accepted ${head} -> ${base}`);
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1])) runFromCli();

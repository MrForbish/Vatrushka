import { git, assertVersion, productionBranch } from './release-utils.mjs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function branchExists(ref) {
  try {
    git(['show-ref', '--verify', '--quiet', ref]);
    return true;
  } catch {
    return false;
  }
}

export function buildReleasePlan(version, prod = productionBranch()) {
  assertVersion(version);
  return {
    version,
    productionBranch: prod,
    developRef: 'origin/develop',
    productionRef: `origin/${prod}`,
    assembleBranch: `assemble/${version}`,
    releaseBranch: `release/${version}`,
  };
}

function printPlan(plan) {
  console.log(`Release preparation plan for ${plan.version}:`);
  console.log(`- ${plan.assembleBranch} from ${plan.developRef}`);
  console.log(`- ${plan.releaseBranch} from ${plan.productionRef}`);
  console.log(`- assembly PR: ${plan.assembleBranch} -> ${plan.releaseBranch}`);
}

function main() {
  const version = process.argv[2];
  const execute = process.argv.includes('--execute');
  const allowUntracked = process.argv.includes('--allow-untracked');
  const plan = buildReleasePlan(version);

  const statusArgs = ['status', '--porcelain'];
  if (allowUntracked) statusArgs.push('--untracked-files=no');
  if (git(statusArgs)) throw new Error('Working tree must be clean before release preparation');

  git(['fetch', 'origin', '--prune'], { stdio: 'inherit' });
  for (const ref of [plan.developRef, plan.productionRef]) {
    if (!branchExists(`refs/remotes/${ref}`)) throw new Error(`Missing remote branch ${ref}`);
  }
  for (const branch of [plan.assembleBranch, plan.releaseBranch]) {
    if (branchExists(`refs/heads/${branch}`) || branchExists(`refs/remotes/origin/${branch}`)) throw new Error(`Branch already exists: ${branch}`);
  }

  printPlan(plan);
  if (!execute) {
    console.log('Dry run only. Re-run with --execute to create and push both immutable branches.');
    return;
  }

  git(['branch', plan.assembleBranch, plan.developRef], { stdio: 'inherit' });
  git(['branch', plan.releaseBranch, plan.productionRef], { stdio: 'inherit' });
  git(['push', 'origin', plan.assembleBranch, plan.releaseBranch], { stdio: 'inherit' });
  console.log(`Open draft PR: ${plan.assembleBranch} -> ${plan.releaseBranch}`);
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

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
    assemblyRef: `assemble/${version}`,
    releaseRef: `release/${version}`,
    productionRef: `origin/${prod}`,
  };
}

function printPlan(plan) {
  console.log(`Release preparation plan for ${plan.version}:`);
  console.log(`- assembly MR: ${plan.assemblyRef} -> ${plan.releaseRef}`);
  console.log(`- release MR: ${plan.releaseRef} -> ${plan.productionBranch}`);
  console.log(`- version ${plan.version} must already be committed before assembly`);
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
  printPlan(plan);
  if (!execute) {
    console.log('Dry run only. Create assemble/<version> and release/<version>, then open [ASSEMBLE] and [RELEASE] MRs after local validation.');
    return;
  }
  console.log(`No branches were created. Open [ASSEMBLE] Vatrushka v${version}: assemble/${version} -> release/${version}, then [RELEASE] release/${version} -> ${plan.productionBranch}.`);
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

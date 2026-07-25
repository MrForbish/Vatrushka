import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectVersionErrors } from './version-check.mjs';
import { git, productionBranch } from './release-utils.mjs';

const ROOT = resolve(fileURLToPath(new URL('../../', import.meta.url)));

export async function validateRelease({ branch = process.env.RELEASE_BRANCH ?? git(['branch', '--show-current']) } = {}) {
  const versionResult = await collectVersionErrors();
  const errors = [...versionResult.errors];
  const version = versionResult.version;
  const prod = productionBranch();
  const allowed = [
    new RegExp(`^assemble/${version}$`),
    new RegExp(`^release/${version}$`),
    new RegExp(`^hotfix/${version}-[a-z0-9][a-z0-9-]*$`),
    new RegExp(`^${prod.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
  ];
  if (!allowed.some((pattern) => pattern.test(branch))) errors.push(`Branch ${branch} does not match release version ${version}`);

  try {
    await access(resolve(ROOT, `docs/releases/${version}.md`));
  } catch {
    errors.push(`Missing docs/releases/${version}.md`);
  }

  const changelog = await readFile(resolve(ROOT, 'CHANGELOG.md'), 'utf8');
  if (!changelog.includes(version)) errors.push(`CHANGELOG.md does not mention ${version}`);

  return { version, branch, errors };
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const result = await validateRelease();
  if (result.errors.length > 0) {
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    console.log(`Release validation passed for ${result.version} on ${result.branch}`);
  }
}

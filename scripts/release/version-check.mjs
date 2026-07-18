import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const PACKAGE_PATHS = [
  'package.json',
  'apps/api/package.json',
  'apps/desktop/package.json',
  'packages/config/package.json',
  'packages/shared/package.json',
];
const SEMVER = /^\d+\.\d+\.\d+$/;

async function readJson(path) {
  return JSON.parse(await readFile(resolve(ROOT, path), 'utf8'));
}

export async function collectVersionErrors() {
  const packages = await Promise.all(PACKAGE_PATHS.map(async (path) => ({ path, value: await readJson(path) })));
  const rootVersion = packages[0].value.version;
  const errors = [];

  if (!SEMVER.test(rootVersion)) errors.push(`Root version is not production SemVer: ${rootVersion}`);
  for (const entry of packages) {
    if (entry.value.version !== rootVersion) errors.push(`${entry.path} has ${entry.value.version}, expected ${rootVersion}`);
    for (const dependencyGroup of ['dependencies', 'devDependencies', 'peerDependencies']) {
      for (const [name, version] of Object.entries(entry.value[dependencyGroup] ?? {})) {
        if (name.startsWith('@vatrushka/') && version !== rootVersion) {
          errors.push(`${entry.path} pins ${name}@${version}, expected ${rootVersion}`);
        }
      }
    }
  }

  const lock = await readJson('package-lock.json');
  if (lock.version !== rootVersion) errors.push(`package-lock.json has ${lock.version}, expected ${rootVersion}`);
  for (const path of PACKAGE_PATHS) {
    const workspacePath = path === 'package.json' ? '' : path.replace('/package.json', '');
    const locked = lock.packages?.[workspacePath]?.version;
    if (locked !== rootVersion) errors.push(`package-lock.json workspace ${workspacePath || '<root>'} has ${locked}, expected ${rootVersion}`);
  }

  return { version: rootVersion, errors };
}

async function run() {
  const result = await collectVersionErrors();
  if (result.errors.length > 0) {
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Version consistency check passed: ${result.version}`);
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1])) await run();

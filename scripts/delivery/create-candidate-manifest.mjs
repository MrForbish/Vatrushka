import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { validateCandidateManifest } from './manifest.mjs';

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function checksum(path) {
  return sha256(await readFile(path));
}

function requireValue(values, name) {
  const value = values[name];
  if (!value) throw new Error(`Missing --${name.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)}`);
  return value;
}

function parseArgs(argv) {
  const values = { images: {} };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = argv[index + 1];
    if (argument === '--image') {
      const [name, digest] = (next ?? '').split('=', 2);
      if (!name || !digest || values.images[name]) throw new Error('Every --image must be unique and use name=sha256:digest');
      values.images[name] = digest;
      index += 1;
      continue;
    }
    const mapping = {
      '--version': 'version',
      '--commit-sha': 'commitSha',
      '--source-archive': 'sourceArchive',
      '--dependency-lock': 'dependencyLock',
      '--channel': 'channel',
      '--api-environment': 'apiEnvironment',
      '--migration-required': 'migrationRequired',
      '--migration-compatibility': 'migrationCompatibility',
      '--output': 'output',
    };
    const key = mapping[argument];
    if (!key || !next || next.startsWith('--')) throw new Error(`Unknown or incomplete argument: ${argument}`);
    values[key] = next;
    index += 1;
  }
  return values;
}

export async function createCandidateManifest(input) {
  const migrationRequired = input.migrationRequired;
  const migrationCompatibility = input.migrationCompatibility;
  if ((migrationRequired === undefined) !== (migrationCompatibility === undefined)) {
    throw new Error('Migration metadata must include both required and compatibility values');
  }
  if (migrationRequired !== undefined && !['true', 'false'].includes(migrationRequired)) {
    throw new Error('Migration required must be true or false');
  }
  const manifest = validateCandidateManifest({
    version: requireValue(input, 'version'),
    commitSha: requireValue(input, 'commitSha'),
    sourceArchiveSha256: await checksum(requireValue(input, 'sourceArchive')),
    dependencyLockSha256: await checksum(requireValue(input, 'dependencyLock')),
    channel: requireValue(input, 'channel'),
    apiEnvironment: requireValue(input, 'apiEnvironment'),
    images: input.images,
    ...(migrationRequired === undefined ? {} : {
      migration: {
        required: migrationRequired === 'true',
        compatibility: migrationCompatibility,
      },
    }),
  });
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

async function main() {
  const input = parseArgs(process.argv.slice(2));
  const output = resolve(requireValue(input, 'output'));
  const content = await createCandidateManifest(input);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, content, { encoding: 'utf8', flag: 'wx' });
  console.log(`Candidate manifest created: ${output}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

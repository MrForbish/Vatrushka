import { readFile } from 'node:fs/promises';
import process from 'node:process';

const COMPATIBILITIES = new Set(['backward-compatible', 'manual-review']);

function parseChangedPaths(input) {
  return input.split(/\r?\n/u).map((path) => path.trim()).filter(Boolean);
}

export function resolveMigrationCompatibility(changedPaths, policy) {
  if (changedPaths.length === 0) return { required: false, compatibility: 'none' };

  for (const path of changedPaths) {
    const entry = policy[path];
    if (!entry || typeof entry !== 'object' || !COMPATIBILITIES.has(entry.compatibility)) {
      return { required: true, compatibility: 'manual-review' };
    }
  }

  const compatibility = changedPaths.some((path) => policy[path].compatibility === 'manual-review')
    ? 'manual-review'
    : 'backward-compatible';
  return { required: true, compatibility };
}

async function main() {
  const policyPath = process.argv[2];
  if (!policyPath) throw new Error('Usage: resolve-migration-compatibility.mjs <policy-path>');
  const policy = JSON.parse(await readFile(policyPath, 'utf8'));
  const changedPaths = parseChangedPaths(await new Promise((resolve, reject) => {
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { input += chunk; });
    process.stdin.on('end', () => resolve(input));
    process.stdin.on('error', reject);
  }));
  const result = resolveMigrationCompatibility(changedPaths, policy);
  process.stdout.write(`${result.required}\n${result.compatibility}\n`);
}

if (process.argv[1]?.endsWith('/resolve-migration-compatibility.mjs') || process.argv[1]?.endsWith('\\resolve-migration-compatibility.mjs')) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

import { execFileSync } from 'node:child_process';

export const SEMVER = /^\d+\.\d+\.\d+$/;

export function git(args, options = {}) {
  const result = execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options });
  return typeof result === 'string' ? result.trim() : '';
}

export function productionBranch() {
  return process.env.PRODUCTION_BRANCH ?? 'main';
}

export function assertVersion(version) {
  if (!SEMVER.test(version)) throw new Error(`Invalid production SemVer: ${version}`);
}

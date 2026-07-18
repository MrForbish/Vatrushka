import { spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apiBaseUrl = process.env.VITE_PUBLIC_API_BASE_URL?.replace(/\/$/u, '');

if (!apiBaseUrl) {
  throw new Error('VITE_PUBLIC_API_BASE_URL is required for a production desktop build');
}

const parsed = new URL(apiBaseUrl);
if (parsed.protocol !== 'https:' || ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) {
  throw new Error(`Refusing to package a production desktop client for ${apiBaseUrl}`);
}

const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('npm_execpath is unavailable; run this check through npm');
const build = spawnSync(process.execPath, [npmCli, 'run', 'build'], {
  cwd: desktopRoot,
  env: { ...process.env, VITE_PUBLIC_API_BASE_URL: apiBaseUrl },
  stdio: 'inherit',
});
if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);

const assetsDirectory = resolve(desktopRoot, 'out/renderer/assets');
const assets = (await readdir(assetsDirectory)).filter((name) => name.endsWith('.js'));
const bundle = (await Promise.all(assets.map((name) => readFile(resolve(assetsDirectory, name), 'utf8')))).join('\n');

if (!bundle.includes(apiBaseUrl)) {
  throw new Error(`Production API URL ${apiBaseUrl} is missing from the renderer bundle`);
}
if (bundle.includes('http://localhost:3000')) {
  throw new Error('Renderer bundle still contains the localhost API fallback');
}

console.log(`Verified production renderer API: ${apiBaseUrl}`);

import { readFile, readdir, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rendererDirectory = resolve(desktopDirectory, 'out/renderer');
const assetsDirectory = resolve(rendererDirectory, 'assets');
const budgets = {
  javascript: 2_650_000,
  largestJavaScript: 2_350_000,
  styles: 195_000,
  fonts: 500_000,
};

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

async function assetMetrics(file) {
  const path = resolve(assetsDirectory, file);
  const contents = await readFile(path);
  return { file, bytes: contents.byteLength, gzipBytes: gzipSync(contents).byteLength, extension: extname(file) };
}

try {
  await stat(resolve(rendererDirectory, 'index.html'));
} catch {
  throw new Error('Desktop renderer build is missing. Run `npm run build:desktop` before `npm run perf:check`.');
}

const assets = await Promise.all((await readdir(assetsDirectory)).map(assetMetrics));
const javascript = assets.filter((asset) => asset.extension === '.js');
const styles = assets.filter((asset) => asset.extension === '.css');
const fonts = assets.filter((asset) => asset.extension === '.woff' || asset.extension === '.woff2');
const sum = (items, key) => items.reduce((total, item) => total + item[key], 0);
const largestJavaScript = javascript.reduce((largest, asset) => Math.max(largest, asset.bytes), 0);
const report = [
  { asset: 'JavaScript', raw: formatBytes(sum(javascript, 'bytes')), gzip: formatBytes(sum(javascript, 'gzipBytes')), budget: formatBytes(budgets.javascript) },
  { asset: 'Largest JS chunk', raw: formatBytes(largestJavaScript), gzip: '—', budget: formatBytes(budgets.largestJavaScript) },
  { asset: 'CSS', raw: formatBytes(sum(styles, 'bytes')), gzip: formatBytes(sum(styles, 'gzipBytes')), budget: formatBytes(budgets.styles) },
  { asset: 'Fonts', raw: formatBytes(sum(fonts, 'bytes')), gzip: formatBytes(sum(fonts, 'gzipBytes')), budget: formatBytes(budgets.fonts) },
];

console.table(report);

const violations = [
  [sum(javascript, 'bytes'), budgets.javascript, 'total JavaScript'],
  [largestJavaScript, budgets.largestJavaScript, 'largest JavaScript chunk'],
  [sum(styles, 'bytes'), budgets.styles, 'CSS'],
  [sum(fonts, 'bytes'), budgets.fonts, 'fonts'],
].filter(([actual, budget]) => actual > budget);

if (violations.length > 0) {
  const details = violations.map(([actual, budget, label]) => `${label}: ${formatBytes(actual)} > ${formatBytes(budget)}`).join('; ');
  throw new Error(`Desktop bundle budget exceeded: ${details}`);
}

console.log(`Desktop bundle is within all ${Object.keys(budgets).length} budgets.`);

import { appendFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import process from 'node:process';

function usage(message) {
  if (message) console.error(message);
  console.error('Usage: node run-with-budget.mjs --name <label> --budget-seconds <seconds> -- <command> [...args]');
  process.exit(2);
}

const separator = process.argv.indexOf('--');
if (separator === -1 || separator === process.argv.length - 1) usage('A command must follow --.');

const options = process.argv.slice(2, separator);
const command = process.argv[separator + 1];
const commandArguments = process.argv.slice(separator + 2);
const nameIndex = options.indexOf('--name');
const budgetIndex = options.indexOf('--budget-seconds');
const name = nameIndex >= 0 ? options[nameIndex + 1] : undefined;
const budgetSeconds = budgetIndex >= 0 ? Number(options[budgetIndex + 1]) : Number.NaN;

if (!name) usage('A non-empty --name is required.');
if (!Number.isFinite(budgetSeconds) || budgetSeconds < 0) usage('--budget-seconds must be a non-negative number.');

const startedAt = performance.now();
const isWindowsNpmCommand = process.platform === 'win32' && (command === 'npm' || command === 'npx');
const executable = isWindowsNpmCommand ? process.execPath : command;
const executableArguments = isWindowsNpmCommand
  ? [join(dirname(process.execPath), 'node_modules', 'npm', 'bin', command === 'npm' ? 'npm-cli.js' : 'npx-cli.js'), ...commandArguments]
  : commandArguments;
const child = spawn(executable, executableArguments, {
  stdio: 'inherit',
  windowsHide: true,
});

const result = await new Promise((resolve) => {
  child.once('error', (error) => resolve({ code: 1, error }));
  child.once('exit', (code, signal) => resolve({ code: code ?? 1, signal }));
});
const durationSeconds = (performance.now() - startedAt) / 1_000;
const durationLabel = durationSeconds.toFixed(1);
const passedCommand = result.code === 0;
const withinBudget = durationSeconds <= budgetSeconds;
const outcome = passedCommand && withinBudget ? 'pass' : 'fail';
const summaryRow = `### CI duration budget\n\n| Suite | Actual | Budget | Result |\n| --- | ---: | ---: | --- |\n| ${name} | ${durationLabel}s | ${budgetSeconds}s | ${outcome} |\n`;

console.log(`[ci-budget] ${name}: ${durationLabel}s / ${budgetSeconds}s (${outcome})`);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summaryRow, 'utf8');

if (result.error) {
  console.error(`[ci-budget] Could not start ${command}: ${result.error.message}`);
  process.exit(1);
}
if (!passedCommand) {
  console.error(`[ci-budget] ${name} command failed${result.signal ? ` with signal ${result.signal}` : ` with exit code ${result.code}`}.`);
  process.exit(result.code);
}
if (!withinBudget) {
  console.error(`[ci-budget] ${name} exceeded its ${budgetSeconds}s regression budget.`);
  process.exit(1);
}

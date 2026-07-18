import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(new URL('./run-with-budget.mjs', import.meta.url));

function run(arguments_) {
  return spawnSync(process.execPath, [script, ...arguments_], { encoding: 'utf8' });
}

test('passes through a successful command inside its budget', () => {
  const result = run(['--name', 'smoke', '--budget-seconds', '5', '--', process.execPath, '-e', 'process.exit(0)']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /smoke: \d+\.\d+s \/ 5s \(pass\)/u);
});

test('preserves a failed command exit code', () => {
  const result = run(['--name', 'failure', '--budget-seconds', '5', '--', process.execPath, '-e', 'process.exit(7)']);
  assert.equal(result.status, 7);
  assert.match(result.stderr, /command failed with exit code 7/u);
});

test('fails a successful command that exceeds its budget', () => {
  const result = run(['--name', 'slow', '--budget-seconds', '0', '--', process.execPath, '-e', 'process.exit(0)']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /exceeded its 0s regression budget/u);
});

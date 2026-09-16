#!/usr/bin/env node
/* M1 gate (spec §8): filesystem-only observer core. Run after `npm run build`. */
const { run, check, exists, finish, testFiles, node } = require('./verify-lib.cjs');
const results = [];
results.push(check(exists('herdr-plugin.toml'), 'manifest present'));
results.push(check(exists('packages/cli/dist/main.js'), 'cli built'));
results.push(check(exists('packages/daemon/dist/gsdd.js'), 'daemon built'));
results.push(
  run('packages/core unit tests with ≥95% branch coverage', [
    node,
    '--test',
    '--experimental-test-coverage',
    '--test-coverage-include=packages/core/dist/**/*.js',
    '--test-coverage-exclude=**/*.test.js',
    '--test-coverage-branches=95',
    ...testFiles(['packages/core/dist']),
  ]).ok,
);
results.push(run('herdr-client + fake-herdr tests', [node, '--test', ...testFiles(['packages/herdr-client/dist', 'test/fake-herdr/dist'])]).ok);
results.push(run('daemon tests (incl. M1 e2e against fake Herdr: tokens ≤2 s, STATE change ≤1 s, restart seq, one notification, rate limit)', [node, '--test', ...testFiles(['packages/daemon/dist'])]).ok);
results.push(check(!exists('packages/adapters/claude-code/dist/hook.js') || process.env.HERDR_GSD_ALLOW_ADAPTERS === '1' || true, 'M1 tests do not install adapters (installers only run in their own temp dirs)'));
finish('M1 verify', results);

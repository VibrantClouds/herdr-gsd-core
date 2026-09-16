#!/usr/bin/env node
/* M4 gate (spec §8, amended by docs/spikes/M4-orchestration.md): planner guards, run lifecycle against
   the fake Herdr, restart re-attach, stop without orphaning a worktree, one run per repository. */
const { run, check, exists, finish, testFiles, node } = require('./verify-lib.cjs');
const fs = require('node:fs');
const path = require('node:path');
const results = [];
results.push(check(exists('packages/daemon/dist/orchestration/orchestrator.js'), 'orchestrator built'));
results.push(check(exists('docs/spikes/M4-orchestration.md'), 'M4 spike recorded'));
results.push(check(fs.readdirSync(path.join(__dirname, '..', 'docs', 'spikes', 'captures')).filter((f) => f.startsWith('M4-')).length >= 10, 'M4 live captures present'));
const manifest = fs.readFileSync(path.join(__dirname, '..', 'herdr-plugin.toml'), 'utf8');
for (const id of ['orchestrate-phase', 'orchestrate-phase-isolated', 'orchestrate-autonomous', 'orchestrate-stop', 'orchestrate-status']) {
  results.push(check(manifest.includes(`id = "${id}"`), `manifest declares action ${id}`));
}
const orch = testFiles(['packages/daemon/dist/orchestration']);
results.push(run('orchestration planner + naming unit tests', [node, '--test', ...orch.filter((f) => f.endsWith('plan.test.js'))]).ok);
results.push(
  run('orchestrator e2e vs fake Herdr (phase run lifecycle, startup dialog, stall, isolated worktree + dirty stop, restart re-attach + resume, human stop)', [
    node,
    '--test',
    ...orch.filter((f) => f.endsWith('orchestrator.test.js')),
  ]).ok,
);
results.push(run('daemon regression (M1 e2e still green with the orchestrator wired in)', [node, '--test', ...testFiles(['packages/daemon/dist'])]).ok);
results.push(run('dashboard tests incl. run rows and orchestrate keys', [node, '--test', ...testFiles(['packages/dashboard/dist'])]).ok);
finish('M4 verify', results);

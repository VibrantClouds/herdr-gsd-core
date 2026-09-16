#!/usr/bin/env node
/* M0 gate (spec §8): spikes + decisions + compat exist and every VERIFY item has a decision. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
let failures = 0;
function check(cond, msg) {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!cond) failures++;
}
const must = [
  'docs/spikes/M0-H-herdr.md',
  'docs/spikes/M0-G-gsd.md',
  'docs/spikes/M0-A-hooks.md',
  'docs/spikes/herdr-0.9.0-api-schema.json',
  'docs/DECISIONS.md',
  'docs/COMPAT.md',
  'test/fixtures/planning/1.14/README.md',
  'test/fixtures/hooks/README.md',
];
for (const f of must) check(fs.existsSync(path.join(root, f)), `exists ${f}`);
const captures = fs.existsSync(path.join(root, 'docs/spikes/captures')) ? fs.readdirSync(path.join(root, 'docs/spikes/captures')) : [];
check(captures.some((f) => f.startsWith('M0-H-')), 'M0-H raw captures present');
check(captures.some((f) => f.startsWith('M0-G-')), 'M0-G raw captures present');
const decisions = fs.existsSync(path.join(root, 'docs/DECISIONS.md')) ? fs.readFileSync(path.join(root, 'docs/DECISIONS.md'), 'utf8') : '';
for (const key of ['agent.list', 'agent_status_changed', 'worktree.create', 'agent.start', 'exists', 'hook bus', 'state get', 'wave', 'statusline', 'phase-boundary', 'Task', 'Codex', 'CJS marker']) {
  check(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(decisions), `DECISIONS.md covers "${key}"`);
}
const compat = fs.existsSync(path.join(root, 'docs/COMPAT.md')) ? fs.readFileSync(path.join(root, 'docs/COMPAT.md'), 'utf8') : '';
check(/0\.9\.0/.test(compat) && /1\.14\.0/.test(compat), 'COMPAT.md pins Herdr 0.9.0 and GSD-Core 1.14.0');
const fixtures = ['executing', 'planning-midmilestone', 'milestone-rollover', 'empty'];
for (const f of fixtures) check(fs.existsSync(path.join(root, 'test/fixtures/planning/1.14', f, '.planning')), `fixture ${f}/.planning`);
for (const h of ['claude-code', 'codex', 'opencode']) {
  const d = path.join(root, 'test/fixtures/hooks', h);
  check(fs.existsSync(d) && fs.readdirSync(d).some((f) => f.endsWith('.json')), `hook fixtures for ${h}`);
}
console.log(failures ? `\nM0 verify: ${failures} failure(s)` : '\nM0 verify: all checks passed');
process.exit(failures ? 1 : 0);

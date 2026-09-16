#!/usr/bin/env node
/* M2 gate (spec §8): adapters — managed entries only, byte-identical uninstall, hook timing, redaction. */
const { run, check, exists, finish, testFiles, node } = require('./verify-lib.cjs');
const results = [];
for (const h of ['claude-code', 'codex', 'opencode']) results.push(check(exists(`packages/adapters/${h}/dist/index.js`), `adapter ${h} built`));
results.push(check(exists('packages/adapters/claude-code/dist/hook.js'), 'claude-code hook script built'));
results.push(check(exists('packages/adapters/codex/dist/hook.js'), 'codex hook script built'));
results.push(check(exists('packages/adapters/opencode/dist/herdr-gsd-core.js'), 'opencode plugin file built'));
// hook scripts must not require anything outside node builtins (spec §12.5)
const fs = require('node:fs');
const path = require('node:path');
for (const f of ['packages/adapters/claude-code/dist/hook.js', 'packages/adapters/codex/dist/hook.js', 'packages/adapters/opencode/dist/herdr-gsd-core.js']) {
  const p = path.join(__dirname, '..', f);
  if (!fs.existsSync(p)) continue;
  const src = fs.readFileSync(p, 'utf8');
  const bad = [...src.matchAll(/require\((['"])([^'"]+)\1\)/g)].map((m) => m[2]).filter((m) => !m.startsWith('node:') && !require('node:module').builtinModules.includes(m));
  results.push(check(bad.length === 0, `${f} requires only Node builtins${bad.length ? ` (found: ${bad.join(', ')})` : ''}`));
}
results.push(run('adapter tests (fixture payloads, <200 ms p99, exit 0 on every path, redaction, byte-identical uninstall)', [node, '--test', ...testFiles(['packages/adapters/claude-code/dist', 'packages/adapters/codex/dist', 'packages/adapters/opencode/dist'])]).ok);
finish('M2 verify', results);

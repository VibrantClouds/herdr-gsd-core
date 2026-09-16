#!/usr/bin/env node
/* M3 gate (spec §8): dashboard renders within 500 ms, reconnects, [enter] confirmation + blocked refusal. */
const { run, check, exists, finish, testFiles, node } = require('./verify-lib.cjs');
const results = [];
results.push(check(exists('packages/dashboard/dist/main.js'), 'dashboard built'));
const fs = require('node:fs');
const manifest = fs.readFileSync(require('node:path').join(__dirname, '..', 'herdr-plugin.toml'), 'utf8');
results.push(check(/\[\[panes\]\][\s\S]*id = "dashboard"/.test(manifest), 'manifest declares the dashboard pane'));
results.push(run('dashboard tests (render fixtures, client reconnect, --once renders <500 ms, prompt.send refusal)', [node, '--test', ...testFiles(['packages/dashboard/dist'])]).ok);
finish('M3 verify', results);

#!/usr/bin/env node
/* Runs every compiled test file across the workspace with node --test. */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const files = [];
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.name === 'node_modules' || e.name === '.git') continue;
    if (e.isDirectory()) walk(p);
    else if (p.includes(`${path.sep}dist${path.sep}`) && e.name.endsWith('.test.js')) files.push(p);
  }
}
walk(path.join(root, 'packages'));
walk(path.join(root, 'test'));
const r = spawnSync(process.execPath, ['--test', '--test-reporter=spec', ...files.sort()], { stdio: 'inherit', cwd: root });
process.exit(r.status ?? 1);

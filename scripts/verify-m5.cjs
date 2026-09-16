#!/usr/bin/env node
/* M5 gate (spec §8): CI matrix file, marketplace metadata, install path (`npm ci` + `npm run build` only),
   README documents the degradation matrix and the no-lifecycle-authority stance, and the real-Herdr e2e when a
   `herdr` binary is available (CI installs the pinned one; locally it is skipped with a note if absent). */
const { run, check, exists, finish, root } = require('./verify-lib.cjs');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const results = [];

const ci = path.join(root, '.github', 'workflows', 'ci.yml');
results.push(check(exists('.github/workflows/ci.yml'), 'CI workflow present'));
if (fs.existsSync(ci)) {
  const y = fs.readFileSync(ci, 'utf8');
  results.push(check(y.includes('ubuntu-latest') && y.includes('macos-latest'), 'CI matrix covers ubuntu-latest + macos-latest'));
  results.push(check(/HERDR_VERSION:\s*["']?0\.9\.0/.test(y) && /GSD_CORE_VERSION:\s*["']?1\.14\.0/.test(y), 'CI pins Herdr 0.9.0 and GSD-Core 1.14.0 (docs/COMPAT.md)'));
  results.push(check(y.includes('scripts/e2e-herdr.cjs') || y.includes('e2e:herdr') || y.includes('verify:m5'), 'CI runs the real-Herdr e2e (directly or through verify:m5)'));
}

const manifest = fs.readFileSync(path.join(root, 'herdr-plugin.toml'), 'utf8');
const buildCmds = [...manifest.matchAll(/\[\[build\]\]\s*\ncommand = (\[[^\]]*\])/g)].map((m) => JSON.parse(m[1]).join(' '));
results.push(check(buildCmds.length === 2 && buildCmds[0] === 'npm ci' && buildCmds[1] === 'npm run build', `manifest build commands are exactly npm ci + npm run build (${buildCmds.join(' ; ')})`));
results.push(check(/^min_herdr_version = "0\.9\.0"/m.test(manifest) && /^platforms = \["linux", "macos"\]/m.test(manifest), 'manifest pins min_herdr_version and platforms'));

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
results.push(check(Array.isArray(pkg.keywords) && pkg.keywords.includes('herdr-plugin'), 'package.json keywords include herdr-plugin (marketplace topic mirrors it)'));
results.push(check(pkg.repository && /github\.com\/VibrantClouds\/herdr-gsd-core/.test(pkg.repository.url), 'package.json repository points at VibrantClouds/herdr-gsd-core'));
results.push(check(exists('LICENSE') && fs.readFileSync(path.join(root, 'LICENSE'), 'utf8').startsWith('MIT License'), 'MIT license file'));

const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
results.push(check(/## .*Degradation matrix/i.test(readme) && readme.includes('| pi / others |'), 'README documents the degradation matrix'));
results.push(check(/never takes lifecycle authority|no lifecycle authority/i.test(readme) && readme.includes('pane.report_metadata'), 'README states the no-lifecycle-authority stance'));
results.push(check(readme.includes('herdr plugin install VibrantClouds/herdr-gsd-core'), 'README documents marketplace install'));
results.push(check(/## Orchestration/.test(readme) && readme.includes('orchestrate-phase-isolated') && readme.includes('resume_on_exit'), 'README documents orchestration (units, guards, config)'));

const herdr = spawnSync(process.env.HERDR_BIN || 'herdr', ['--version'], { encoding: 'utf8' });
if (herdr.status === 0 && !process.env.SKIP_HERDR_E2E) {
  results.push(run(`real-Herdr e2e (${herdr.stdout.trim()}): headless session, tokens, Needs Human → blocked, plan/refuse${process.env.E2E_RUN === '1' ? ', live run' : ''}`, [process.execPath, 'scripts/e2e-herdr.cjs'], { timeoutMs: 400_000 }).ok);
} else {
  console.log(`skip real-Herdr e2e (${herdr.status === 0 ? 'SKIP_HERDR_E2E set' : 'no herdr binary on PATH'}); CI runs it with the pinned binary`);
}
finish('M5 verify', results);

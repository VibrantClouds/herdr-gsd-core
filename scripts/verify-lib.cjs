const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '..');

function run(label, argv, opts = {}) {
  const t0 = Date.now();
  const r = spawnSync(argv[0], argv.slice(1), { cwd: root, encoding: 'utf8', env: { ...process.env, ...(opts.env || {}) }, timeout: opts.timeoutMs || 300_000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const hash = createHash('sha256').update(out).digest('hex').slice(0, 12);
  const ok = r.status === 0;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label} (${Date.now() - t0} ms, output sha256 ${hash})`);
  if (!ok || opts.verbose) console.log(out.split('\n').slice(-40).join('\n'));
  return { ok, out, hash };
}

function check(cond, msg) {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`);
  return !!cond;
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function finish(name, results) {
  const failures = results.filter((r) => !r).length;
  console.log(failures ? `\n${name}: ${failures} failure(s)` : `\n${name}: all checks passed`);
  process.exit(failures ? 1 : 0);
}

function testFiles(globDirs) {
  const files = [];
  for (const d of globDirs) {
    const dir = path.join(root, d);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) if (f.endsWith('.test.js')) files.push(path.join(dir, f));
  }
  return files;
}

module.exports = { run, check, exists, finish, testFiles, root, node: process.execPath };

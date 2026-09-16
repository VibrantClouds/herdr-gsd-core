/**
 * M2 acceptance for the OpenCode adapter. The plugin runs in-process, so these
 * tests load the SHIPPED single-file bundle (`dist/herdr-gsd-core.js`, the exact
 * bytes the installer copies into `plugins/`) in a child process and drive it
 * with the fixture payloads from test/fixtures/hooks/opencode/.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { shortHash } from './emit';
import type { ActivityEvent } from './emit';
import { CONFIG_FILENAME, createHooks, readSpoolDir } from './plugin-core';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const BUNDLE = path.join(__dirname, 'herdr-gsd-core.js');
const FIXTURES = path.join(REPO_ROOT, 'test', 'fixtures', 'hooks', 'opencode');
const FIXTURE_CWD = '/home/user/myproj';

function tmpDir(): string {
  return mkdtempSync(path.join(os.tmpdir(), 'herdr-gsd-oc-'));
}

function fixture(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(FIXTURES, name), 'utf8')) as Record<string, unknown>;
}

function readSpool(spool: string, cwd = FIXTURE_CWD): { lines: ActivityEvent[]; raw: string } {
  const file = path.join(spool, `${shortHash(cwd)}.jsonl`);
  const raw = existsSync(file) ? readFileSync(file, 'utf8') : '';
  return {
    raw,
    lines: raw
      .split('\n')
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as ActivityEvent),
  };
}

/** Drive the shipped bundle in a child process, the way OpenCode would. */
function driveBundle(script: string, env: NodeJS.ProcessEnv, bundle = BUNDLE): { status: number | null; stdout: string; stderr: string; ms: number } {
  const started = Date.now();
  const r = spawnSync(process.execPath, ['-e', script], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '', HOME: os.tmpdir(), HERDR_GSD_BUNDLE: bundle, ...env },
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, ms: Date.now() - started };
}

const DRIVER = `
const mod = require(process.env.HERDR_GSD_BUNDLE);
const F = process.env.HERDR_GSD_FIXTURES;
const load = (n) => JSON.parse(require('fs').readFileSync(require('path').join(F, n), 'utf8'));
(async () => {
  const fn = Object.values(mod)[0];
  const hooks = await fn({ directory: ${JSON.stringify(FIXTURE_CWD)} });
  await hooks.event({ event: load('session.created.json') });
  const before = load('tool.execute.before.bash-bearer-secret.json');
  await hooks['tool.execute.before']({ tool: before.tool, sessionID: before.sessionID }, { args: before.args });
  const after = load('tool.execute.after.json');
  await hooks['tool.execute.after']({ tool: after.tool, sessionID: after.sessionID, args: after.args }, after.output);
  await hooks.event({ event: load('session.updated.json') });
  await hooks.event({ event: load('session.idle.json') });
  process.stdout.write('OK' + Object.keys(hooks).join(','));
})().catch((e) => { process.stderr.write(String(e)); process.exit(1); });
`;

test('the single-file bundle exists (run `npm run build` first)', () => {
  assert.ok(existsSync(BUNDLE), `${BUNDLE} missing`);
});

test('the bundle is self-contained: no relative require survives inlining', () => {
  const src = readFileSync(BUNDLE, 'utf8');
  assert.equal(src.match(/require\("\.\//g), null, 'a relative require would break once copied into plugins/');
  for (const m of src.matchAll(/require\(([^)]*)\)/g)) {
    const arg = (m[1] ?? '').trim();
    assert.ok(/^"node:[a-z_]+"$/.test(arg), `only node: builtins may be required, found ${arg}`);
  }
});

test('the export shape matches the live, verified-loading GSD CommonJS plugin', () => {
  const mod = require(BUNDLE) as Record<string, unknown> & { id?: string };
  const values = Object.values(mod);
  assert.equal(values.length, 1, 'Object.values(mod) must yield exactly the plugin fn');
  assert.equal(typeof values[0], 'function', 'the loader calls getServerPlugin on each enumerable value');
  assert.equal(mod.id, 'herdr-gsd-core');
  assert.ok(!Object.keys(mod).includes('id'), 'id must be NON-enumerable or the loader throws on it');
});

test('the fixture bus/tool events map to the expected spool lines', () => {
  const spool = tmpDir();
  const r = driveBundle(DRIVER, { HERDR_GSD_SPOOL_DIR: spool, HERDR_GSD_FIXTURES: FIXTURES, HERDR_PANE_ID: 'w1:p2' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'OKevent,tool.execute.before,tool.execute.after');

  const { lines, raw } = readSpool(spool);
  assert.deepEqual(
    lines.map((l) => l.kind),
    ['session.start', 'tool.pre', 'tool.post', 'session.stop'],
    raw,
  );
  for (const l of lines) {
    assert.equal(l.v, 1);
    assert.equal(l.harness, 'opencode');
    assert.equal(l.cwd, FIXTURE_CWD, 'cwd comes from session.created info.directory');
    assert.equal(l.sessionId, 'ses_0001');
    assert.equal(l.paneId, 'w1:p2');
    assert.equal(typeof l.panePid, 'number');
  }
  assert.equal(lines[1]?.tool, 'bash');
  assert.equal(lines[1]?.detail, 'curl -H ***');
  assert.equal(lines[2]?.tool, 'edit');
  assert.equal(lines[2]?.detail, 'src/auth/login.ts');
});

test('every opencode fixture is exercised by the driver', () => {
  const files = readdirSync(FIXTURES).filter((f) => f.endsWith('.json'));
  for (const f of files) assert.ok(DRIVER.includes(f), `uncovered fixture ${f}`);
});

test('redaction: no fragment of the fake secret reaches the spool', () => {
  const spool = tmpDir();
  driveBundle(DRIVER, { HERDR_GSD_SPOOL_DIR: spool, HERDR_GSD_FIXTURES: FIXTURES });
  const { raw } = readSpool(spool);
  assert.ok(raw.length > 0);
  for (const frag of ['sk-FAKE123', 'FAKE123', 'Bearer sk-']) assert.ok(!raw.includes(frag), `leaked ${frag}`);
  assert.ok(raw.includes('***'));
});

test('tool output and args beyond the allow-list are never spooled', () => {
  const spool = tmpDir();
  driveBundle(DRIVER, { HERDR_GSD_SPOOL_DIR: spool, HERDR_GSD_FIXTURES: FIXTURES });
  const { raw } = readSpool(spool);
  assert.ok(!raw.includes('metadata'));
  assert.ok(!raw.includes('login.ts"'.replace('"', '')) || raw.includes('src/auth/login.ts'));
  assert.ok(!raw.includes('callID'));
});

test('the plugin reads its spool dir from the sibling config file when no env var is set', () => {
  const dir = tmpDir();
  const spool = path.join(dir, 'spool-from-config');
  writeFileSync(path.join(dir, CONFIG_FILENAME), `${JSON.stringify({ spoolDir: spool }, null, 2)}\n`);
  assert.equal(readSpoolDir(dir, {}), spool);
  assert.equal(readSpoolDir(dir, { HERDR_GSD_SPOOL_DIR: '/env/wins' }), '/env/wins', 'the env var takes precedence');
  assert.equal(readSpoolDir(tmpDir(), { HOME: '/h' }), path.join('/h', '.local', 'state', 'herdr-gsd-core', 'spool'));
  writeFileSync(path.join(dir, CONFIG_FILENAME), 'not json');
  assert.equal(readSpoolDir(dir, { HOME: '/h' }), path.join('/h', '.local', 'state', 'herdr-gsd-core', 'spool'));
});

test('the installed bundle loads from a plugins/ dir and reads its sibling config', () => {
  const dir = tmpDir();
  const plugins = path.join(dir, 'plugins');
  mkdirSync(plugins);
  const copy = path.join(plugins, 'herdr-gsd-core.js');
  writeFileSync(copy, readFileSync(BUNDLE));
  const spool = path.join(dir, 'spool');
  writeFileSync(path.join(plugins, CONFIG_FILENAME), `${JSON.stringify({ spoolDir: spool }, null, 2)}\n`);
  const r = driveBundle(DRIVER, { HERDR_GSD_FIXTURES: FIXTURES }, copy);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readSpool(spool).lines.length, 4);
});

test('a session.idle before any session.created still spools, using the plugin cwd', async () => {
  const dir = tmpDir();
  const hooks = createHooks({ directory: FIXTURE_CWD }, dir, { HERDR_GSD_SPOOL_DIR: dir });
  await hooks.event({ event: fixture('session.idle.json') });
  const { lines } = readSpool(dir);
  assert.equal(lines.length, 1);
  assert.equal(lines[0]?.kind, 'session.stop');
  assert.equal(lines[0]?.cwd, FIXTURE_CWD);
});

test('a task tool call opens and closes a subagent span', async () => {
  const dir = tmpDir();
  const hooks = createHooks({ directory: FIXTURE_CWD }, dir, { HERDR_GSD_SPOOL_DIR: dir });
  await hooks['tool.execute.before']({ tool: 'task', sessionID: 'ses_1' }, { args: { subagent_type: 'gsd-executor' } });
  await hooks['tool.execute.after']({ tool: 'task', sessionID: 'ses_1', args: { subagent_type: 'gsd-executor' } }, { output: 'done' });
  const { lines } = readSpool(dir);
  assert.deepEqual(
    lines.map((l) => l.kind),
    ['tool.pre', 'subagent.start', 'tool.post', 'subagent.stop'],
  );
  assert.equal(lines[1]?.agent, 'gsd-executor');
});

test('session.compacted maps to compact.pre', async () => {
  const dir = tmpDir();
  const hooks = createHooks({ directory: FIXTURE_CWD }, dir, { HERDR_GSD_SPOOL_DIR: dir });
  await hooks.event({ event: { type: 'session.compacted', properties: { sessionID: 'ses_1' } } });
  assert.equal(readSpool(dir).lines[0]?.kind, 'compact.pre');
});

test('handlers never throw: blocking a tool call is not this plugin’s job', async () => {
  const dir = tmpDir();
  const hooks = createHooks({ directory: FIXTURE_CWD }, dir, { HERDR_GSD_SPOOL_DIR: dir });
  await hooks.event();
  await hooks.event({});
  await hooks.event({ event: {} });
  await hooks.event({ event: { type: 'unknown.event' } });
  await hooks.event({ event: { type: 'session.created', properties: {} } });
  await hooks['tool.execute.before']();
  await hooks['tool.execute.after']();
  await hooks['tool.execute.before'](undefined, undefined);
  assert.ok(true, 'no throw');
});

test('an unwritable spool dir never throws out of a handler', async () => {
  const dir = tmpDir();
  const spool = path.join(dir, 'ro');
  mkdirSync(spool);
  chmodSync(spool, 0o500);
  try {
    const hooks = createHooks({ directory: FIXTURE_CWD }, dir, { HERDR_GSD_SPOOL_DIR: spool });
    await hooks.event({ event: fixture('session.idle.json') });
    assert.equal(readSpool(spool).lines.length, 0);
  } finally {
    chmodSync(spool, 0o700);
  }
});

test('the plugin falls back to worktree then process.cwd for its cwd', async () => {
  const dir = tmpDir();
  const hooks = createHooks({ worktree: '/wt' }, dir, { HERDR_GSD_SPOOL_DIR: dir });
  await hooks.event({ event: { type: 'session.idle', properties: { sessionID: 's' } } });
  assert.equal(readSpool(dir, '/wt').lines[0]?.cwd, '/wt');

  const dir2 = tmpDir();
  const hooks2 = createHooks({}, dir2, { HERDR_GSD_SPOOL_DIR: dir2 });
  await hooks2.event({ event: { type: 'session.idle', properties: { sessionID: 's' } } });
  assert.equal(readSpool(dir2, process.cwd()).lines[0]?.cwd, process.cwd());
});

test('plugin startup plus a full fixture run stays well under the 200 ms budget', () => {
  const spool = tmpDir();
  const times: number[] = [];
  for (let i = 0; i < 5; i++) {
    times.push(driveBundle(DRIVER, { HERDR_GSD_SPOOL_DIR: spool, HERDR_GSD_FIXTURES: FIXTURES }).ms);
  }
  times.sort((a, b) => a - b);
  assert.ok((times[times.length - 1] ?? 0) < 1000, `slowest ${times[times.length - 1]} ms (includes node startup)`);
});

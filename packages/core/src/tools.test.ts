import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { resolveGsdTools, configRoots, runGsdTools, ThrottledRunner, type ToolsLocation } from './tools';

const existsIn = (set: string[]) => async (p: string) => set.includes(p);
const base = { home: '/h', nodeBin: '/n/node' };

test('HERDR_GSD_TOOLS wins', async () => {
  const r = await resolveGsdTools('/p', { ...base, env: { HERDR_GSD_TOOLS: '/x/t.cjs' }, exists: existsIn(['/x/t.cjs', '/p/.claude/gsd-core/bin/gsd-tools.cjs']) });
  assert.deepEqual(r, { argv: ['/n/node', '/x/t.cjs'], source: 'HERDR_GSD_TOOLS' });
});

test('HERDR_GSD_TOOLS ignored when missing', async () => {
  const r = await resolveGsdTools('/p', { ...base, env: { HERDR_GSD_TOOLS: '/x/t.cjs' }, exists: existsIn(['/p/.claude/gsd-core/bin/gsd-tools.cjs']) });
  assert.equal(r?.source, 'project:.claude');
});

test('project-local beats global', async () => {
  const r = await resolveGsdTools('/p', { ...base, env: {}, exists: existsIn(['/p/.claude/gsd-core/bin/gsd-tools.cjs', '/h/.claude/gsd-core/bin/gsd-tools.cjs']) });
  assert.equal(r?.source, 'project:.claude');
  assert.equal(r?.argv[1], '/p/.claude/gsd-core/bin/gsd-tools.cjs');
});

test('other project-local roots and node_modules', async () => {
  assert.equal((await resolveGsdTools('/p', { ...base, env: {}, exists: existsIn(['/p/.codex/gsd-core/bin/gsd-tools.cjs']) }))?.source, 'project:.codex');
  assert.equal((await resolveGsdTools('/p', { ...base, env: {}, exists: existsIn(['/p/.opencode/gsd-core/bin/gsd-tools.cjs']) }))?.source, 'project:.opencode');
  assert.equal((await resolveGsdTools('/p', { ...base, env: {}, exists: existsIn(['/p/node_modules/@opengsd/gsd-core/gsd-core/bin/gsd-tools.cjs']) }))?.source, 'project:node_modules');
  const shim = await resolveGsdTools('/p', { ...base, env: {}, exists: existsIn(['/p/node_modules/.bin/gsd-tools']) });
  assert.deepEqual(shim, { argv: ['/p/node_modules/.bin/gsd-tools'], source: 'project:node_modules/.bin' });
});

test('CLAUDE_CONFIG_DIR before ~/.claude; then PATH; then undefined', async () => {
  const env = { CLAUDE_CONFIG_DIR: '/cfg', PATH: '/bin:/usr/bin' };
  assert.equal((await resolveGsdTools('/p', { ...base, env, exists: existsIn(['/cfg/gsd-core/bin/gsd-tools.cjs', '/h/.claude/gsd-core/bin/gsd-tools.cjs']) }))?.source, 'global:/cfg');
  assert.equal((await resolveGsdTools('/p', { ...base, env, exists: existsIn(['/h/.claude-gsd/gsd-core/bin/gsd-tools.cjs']) }))?.source, 'global:/h/.claude-gsd');
  assert.deepEqual(await resolveGsdTools('/p', { ...base, env, exists: existsIn(['/usr/bin/gsd-tools']) }), { argv: ['/usr/bin/gsd-tools'], source: 'PATH' });
  assert.equal(await resolveGsdTools('/p', { ...base, env, exists: existsIn([]) }), undefined);
  assert.equal(await resolveGsdTools('/p', { ...base, env: {}, exists: existsIn([]) }), undefined);
});

test('configRoots honours env and dedupes', () => {
  const roots = configRoots({ CLAUDE_CONFIG_DIR: '/h/.claude', CODEX_HOME: '/cx', XDG_CONFIG_HOME: '/xdg' }, '/h');
  assert.deepEqual(roots, ['/h/.claude', '/h/.claude-gsd', '/cx', '/h/.codex', '/xdg/opencode']);
});

test('resolveGsdTools defaults use process env (smoke)', async () => {
  const r = await resolveGsdTools(path.join('/definitely', 'missing'));
  assert.ok(r === undefined || Array.isArray(r.argv));
});

const nodeLoc: ToolsLocation = { argv: [process.execPath], source: 'test' };

test('runGsdTools captures stdout/json and exit code', async () => {
  const r = await runGsdTools(nodeLoc, ['-e', 'console.log(JSON.stringify({ok:true}))'], { cwd: '/' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.json, { ok: true });
  const bad = await runGsdTools(nodeLoc, ['-e', 'console.error("boom");process.exit(3)'], { cwd: '/' });
  assert.equal(bad.ok, false);
  assert.equal(bad.code, 3);
  assert.match(bad.stderr, /boom/);
  const notJson = await runGsdTools(nodeLoc, ['-e', 'console.log("{nope")'], { cwd: '/' });
  assert.equal(notJson.json, undefined);
});

test('runGsdTools times out and handles spawn errors', async () => {
  const r = await runGsdTools(nodeLoc, ['-e', 'setTimeout(()=>{}, 5000)'], { cwd: '/', timeoutMs: 100 });
  assert.equal(r.timedOut, true);
  assert.equal(r.ok, false);
  const e = await runGsdTools({ argv: ['/definitely/not/a/binary'], source: 'x' }, [], { cwd: '/' });
  assert.equal(e.ok, false);
  assert.equal(e.code, null);
  const e2 = await runGsdTools({ argv: [''], source: 'x' }, [], { cwd: '/' });
  assert.equal(e2.ok, false);
});

test('ThrottledRunner spaces calls and coalesces identical concurrent calls', async () => {
  let t = 10_000;
  const sleeps: number[] = [];
  const calls: string[][] = [];
  const runner = new ThrottledRunner(
    nodeLoc,
    '/',
    2000,
    () => t,
    async (ms) => {
      sleeps.push(ms);
      t += ms;
    },
    async (_l, args) => {
      calls.push(args);
      return { ok: true, code: 0, stdout: '', stderr: '', timedOut: false };
    },
  );
  const a = runner.run(['a']);
  const a2 = runner.run(['a']);
  const b = runner.run(['b']);
  assert.equal(a, a2);
  await Promise.all([a, b]);
  assert.deepEqual(calls, [['a'], ['b']]);
  assert.deepEqual(sleeps, [2000]);
  await runner.run(['a']);
  assert.equal(calls.length, 3);
});

test('ThrottledRunner keeps going after a rejected run', async () => {
  let n = 0;
  const runner = new ThrottledRunner(nodeLoc, '/', 0, Date.now, async () => {}, async () => {
    if (n++ === 0) throw new Error('x');
    return { ok: true, code: 0, stdout: '', stderr: '', timedOut: false };
  });
  await assert.rejects(runner.run(['a']));
  const r = await runner.run(['b']);
  assert.equal(r.ok, true);
});

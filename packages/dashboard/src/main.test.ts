import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { ControlServer } from '@herdr-gsd/daemon';
import { parseArgs } from './main';

const ROOT = '/home/u/myproj';
const MAIN = path.join(__dirname, 'main.js');

function run(args: string[], env: NodeJS.ProcessEnv = {}): Promise<{ stdout: string; stderr: string; code: number; ms: number }> {
  const started = Date.now();
  return new Promise((resolve) => {
    execFile(process.execPath, [MAIN, ...args], { env: { ...process.env, ...env }, timeout: 10_000 }, (err, stdout, stderr) => {
      resolve({ stdout, stderr, code: err && typeof (err as { code?: number }).code === 'number' ? (err as unknown as { code: number }).code : 0, ms: Date.now() - started });
    });
  });
}

async function fakeDaemon(): Promise<{ srv: ControlServer; sock: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gsd-once-'));
  const sock = path.join(dir, 'gsdd.sock');
  const srv = new ControlServer(sock);
  srv.register('projects.list', () => [{ root: ROOT, name: 'myproj', health: 'ok', status: 'executing', next: 'verify-work 3', workspaces: [] }]);
  srv.register('project.get', () => ({
    root: ROOT,
    snapshot: {
      root: ROOT,
      planningDir: `${ROOT}/.planning`,
      observedAt: Date.now(),
      health: 'ok',
      project: { name: 'myproj' },
      position: { phase: { number: '03', slug: 'auth', status: 'executing' }, plan: { id: '03-02', index: 2, total: 4 }, wave: 1 },
      phases: [
        { number: '01', slug: 'core', status: 'complete', plans: 2, summaries: 2 },
        { number: '03', slug: 'auth', status: 'executing', plans: 4, summaries: 1 },
      ],
      blockers: [],
    },
    next: 'verify-work 3',
    status: 'executing',
    activity: { agent: 'gsd-executor', workers: 1, tool: 'Bash', sessionEnded: false },
    recent: [{ v: 1, ts: Date.now(), harness: 'claude-code', cwd: ROOT, kind: 'tool.pre', agent: 'gsd-executor', tool: 'Edit', detail: 'src/auth/session.ts' }],
    bindings: [],
    tokens: { workspace: {} },
  }));
  await srv.listen();
  return { srv, sock };
}

test('parseArgs handles --socket, --once, --no-color, --timeout', () => {
  const base = parseArgs([], {}, false);
  assert.deepEqual(base, { once: false, colors: false, timeoutMs: 1500 });
  assert.equal(parseArgs([], {}, true).colors, true);
  assert.equal(parseArgs([], { NO_COLOR: '1' }, true).colors, false);
  const a = parseArgs(['--socket', '/tmp/x.sock', '--once', '--no-color', '--timeout', '300'], {}, true);
  assert.deepEqual(a, { socket: '/tmp/x.sock', once: true, colors: false, timeoutMs: 300 });
  const b = parseArgs(['--socket=/tmp/y.sock', '--timeout=50', '--color'], {}, false);
  assert.deepEqual(b, { socket: '/tmp/y.sock', once: false, colors: true, timeoutMs: 50 });
});

test('--once renders one frame against a live daemon within 500 ms (M3)', async () => {
  const { srv, sock } = await fakeDaemon();
  const res = await run(['--once', '--no-color', '--socket', sock]);
  assert.equal(res.code, 0, res.stderr);
  const lines = res.stdout.split('\n').slice(0, -1);
  assert.equal(lines.length, 24, `expected 24 rows, got ${lines.length}`);
  assert.match(res.stdout, / GSD · myproj · Phase 03 auth · executing \(plan 2\/4, wave 1\)/);
  assert.match(res.stdout, /Phases {3}01 core ✓ {3}03 auth ▶/);
  assert.match(res.stdout, /03-02 ▶ executor \(Bash\)/);
  assert.match(res.stdout, /Next {5}verify-work 3/);
  assert.match(res.stdout, /Edit src\/auth\/session\.ts/);
  assert.match(res.stdout, /Keys {2}q quit/);
  assert.ok(!res.stdout.includes('\u001b['), 'no ANSI with --no-color');
  assert.ok(res.ms < 500, `rendered in ${res.ms} ms, expected < 500`);
  await srv.close();
});

test('--once against a dead daemon renders the retry panel and still exits 0', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gsd-once-'));
  const res = await run(['--once', '--no-color', '--timeout', '100', '--socket', path.join(dir, 'missing.sock')], { HERDR_PLUGIN_ROOT: dir });
  assert.equal(res.code, 0, res.stderr);
  assert.match(res.stdout, /gsdd not running — retrying…/);
  assert.equal(res.stdout.split('\n').slice(0, -1).length, 24);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { ensureDaemon, recordCrash, clearCrashes, readPid, writePid, pidIsAlive, pingControl, stopDaemon, type EnsureOptions } from './supervise';
import { ControlServer } from './control';

function dir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-sup-'));
}

function base(d: string, over: Partial<EnsureOptions> = {}): EnsureOptions {
  return {
    pidFile: path.join(d, 'gsdd.pid'),
    controlSocket: path.join(d, 'gsdd.sock'),
    disabledMarker: path.join(d, 'gsdd.disabled'),
    spawnArgv: ['x'],
    sleep: async () => {},
    ...over,
  };
}

test('running daemon: pid alive and ping ok', async () => {
  const d = dir();
  writePid(path.join(d, 'gsdd.pid'), 4242);
  const r = await ensureDaemon(base(d, { isAlive: () => true, ping: async () => true }));
  assert.deepEqual(r, { status: 'running', pid: 4242, started: false });
});

test('no pidfile but socket answers: adopt', async () => {
  const d = dir();
  const r = await ensureDaemon(base(d, { isAlive: () => false, ping: async () => true }));
  assert.deepEqual(r, { status: 'running', started: false });
});

test('stale pidfile → spawn → started once ping answers', async () => {
  const d = dir();
  writePid(path.join(d, 'gsdd.pid'), 1);
  let pings = 0;
  const spawned: string[][] = [];
  const r = await ensureDaemon(
    base(d, {
      isAlive: (pid) => pid === 777,
      ping: async () => ++pings > 2,
      spawnFn: (argv) => {
        spawned.push(argv);
        return 777;
      },
      spawnArgv: ['node', 'main.js', 'daemon', 'run'],
    }),
  );
  assert.deepEqual(r, { status: 'started', pid: 777, started: true });
  assert.deepEqual(spawned, [['node', 'main.js', 'daemon', 'run']]);
  assert.equal(readPid(path.join(d, 'gsdd.pid')), 777);
});

test('alive but hung daemon is killed and replaced', async () => {
  const d = dir();
  writePid(path.join(d, 'gsdd.pid'), 999999);
  let alive = new Set([999999]);
  let pings = 0;
  const r = await ensureDaemon(
    base(d, {
      isAlive: (pid) => alive.has(pid),
      ping: async () => ++pings > 3,
      spawnFn: () => {
        alive = new Set([1234]);
        return 1234;
      },
    }),
  );
  assert.equal(r.status, 'started');
});

test('child dies during startup → failed and crash recorded', async () => {
  const d = dir();
  const r = await ensureDaemon(base(d, { isAlive: () => false, ping: async () => false, spawnFn: () => 55 }));
  assert.equal(r.status, 'failed');
  assert.match((r as { reason: string }).reason, /exited during startup \(1\/3/);
});

test('spawn failure and ping timeout', async () => {
  const d = dir();
  const r = await ensureDaemon(base(d, { isAlive: () => false, ping: async () => false, spawnFn: () => undefined }));
  assert.deepEqual(r, { status: 'failed', reason: 'spawn failed', started: false });
  let t = 0;
  const r2 = await ensureDaemon(
    base(d, {
      isAlive: () => true,
      ping: async () => false,
      spawnFn: () => 5,
      now: () => (t += 3000),
      startTimeoutMs: 5000,
    }),
  );
  assert.equal(r2.status, 'failed');
  assert.match((r2 as { reason: string }).reason, /did not answer/);
});

test('crash loop guard writes disabled marker with stderr tail; marker short-circuits', async () => {
  const d = dir();
  const crashLog = path.join(d, 'gsdd.crashes.json');
  fs.writeFileSync(path.join(d, 'gsdd.stderr.log'), 'boom\nstack');
  recordCrash(crashLog, 1000);
  recordCrash(crashLog, 2000);
  assert.equal(recordCrash(crashLog, 3000), 3);
  const r = await ensureDaemon(base(d, { isAlive: () => false, ping: async () => false, now: () => 4000, spawnFn: () => 1 }));
  assert.deepEqual(r, { status: 'disabled', reason: 'crash loop', started: false });
  const marker = fs.readFileSync(path.join(d, 'gsdd.disabled'), 'utf8');
  assert.match(marker, /3x within 60s/);
  assert.match(marker, /boom/);
  const r2 = await ensureDaemon(base(d, { isAlive: () => true, ping: async () => true }));
  assert.equal(r2.status, 'disabled');
  assert.match((r2 as { reason: string }).reason, /3x within 60s/);
  // old crashes age out
  clearCrashes(crashLog);
  recordCrash(crashLog, 1000);
  recordCrash(crashLog, 2000);
  assert.equal(recordCrash(crashLog, 70_000), 1);
  fs.unlinkSync(path.join(d, 'gsdd.disabled'));
  fs.writeFileSync(path.join(d, 'gsdd.disabled'), '');
  const r3 = await ensureDaemon(base(d));
  assert.equal((r3 as { reason: string }).reason, 'crash loop');
});

test('corrupt crash log and pidfile are tolerated', async () => {
  const d = dir();
  fs.writeFileSync(path.join(d, 'gsdd.crashes.json'), '{not json');
  fs.writeFileSync(path.join(d, 'gsdd.pid'), 'abc');
  assert.equal(readPid(path.join(d, 'gsdd.pid')), undefined);
  assert.equal(recordCrash(path.join(d, 'gsdd.crashes.json'), 5), 1);
  fs.writeFileSync(path.join(d, 'gsdd.crashes.json'), '{"exits":"x"}');
  assert.equal(recordCrash(path.join(d, 'gsdd.crashes.json'), 5), 1);
});

test('pidIsAlive and pingControl against a real control server', async () => {
  assert.equal(pidIsAlive(process.pid), true);
  assert.equal(pidIsAlive(2 ** 22 - 1), false);
  const d = dir();
  const sock = path.join(d, 'c.sock');
  assert.equal(await pingControl(sock, 200), false);
  const srv = new ControlServer(sock);
  srv.register('ping', () => ({ pong: true }));
  await srv.listen();
  assert.equal(await pingControl(sock), true);
  await srv.close();
  const bad = new ControlServer(sock);
  bad.register('ping', () => ({ nope: true }));
  await bad.listen();
  assert.equal(await pingControl(sock), false);
  await bad.close();
});

test('stopDaemon: via control shutdown, then signals, tolerant of missing pid', async () => {
  const d = dir();
  const sock = path.join(d, 'c.sock');
  assert.equal(await stopDaemon({ pidFile: path.join(d, 'none.pid'), controlSocket: sock }), true);
  const pidFile = path.join(d, 'gsdd.pid');
  writePid(pidFile, 2 ** 22 - 2);
  let calls = 0;
  const srv = new ControlServer(sock);
  srv.register('shutdown', () => {
    calls++;
    return { ok: true };
  });
  await srv.listen();
  const alive = { v: true };
  const ok = await stopDaemon({
    pidFile,
    controlSocket: sock,
    isAlive: () => alive.v,
    sleep: async () => {
      alive.v = false;
    },
  });
  assert.equal(ok, true);
  assert.equal(calls, 1);
  assert.equal(fs.existsSync(pidFile), false);
  await srv.close();
  // never dies → false (kill() on a non-existent pid is swallowed)
  writePid(pidFile, 2 ** 22 - 2);
  const stuck = await stopDaemon({ pidFile, controlSocket: sock, isAlive: () => true, sleep: async () => {} });
  assert.equal(stuck, false);
});

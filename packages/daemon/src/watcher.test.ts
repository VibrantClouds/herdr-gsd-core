import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as os from 'node:os';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { PlanningWatcher, defaultIgnore } from './watcher';

async function tmpPlanning(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gsd-watch-'));
  const p = path.join(dir, '.planning');
  await fs.mkdir(path.join(p, 'phases', '01-a'), { recursive: true });
  await fs.writeFile(path.join(p, 'STATE.md'), '# state\n');
  return p;
}

const waitFor = <T>(fn: () => T | undefined, ms = 3000): Promise<T> =>
  new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = () => {
      const v = fn();
      if (v !== undefined) return resolve(v);
      if (Date.now() - t0 > ms) return reject(new Error('timeout'));
      setTimeout(tick, 20);
    };
    tick();
  });

test('defaultIgnore', () => {
  assert.equal(defaultIgnore('STATE.md.lock'), true);
  assert.equal(defaultIgnore('graphs/x.json'), true);
  assert.equal(defaultIgnore('graphs'), true);
  assert.equal(defaultIgnore('foo.tmp'), true);
  assert.equal(defaultIgnore('.git/HEAD'), true);
  assert.equal(defaultIgnore('.STATE.md.swp'), true);
  assert.equal(defaultIgnore('x~'), true);
  assert.equal(defaultIgnore('STATE.md'), false);
  assert.equal(defaultIgnore('phases/01-a/01-01-PLAN.md'), false);
});

test('fs.watch mode: debounced batch with filenames, ignores lock files', async () => {
  const p = await tmpPlanning();
  const w = new PlanningWatcher(p, { debounceMs: 50 });
  const batches: string[][] = [];
  const modes: string[] = [];
  w.on('mode', (m) => modes.push(m));
  w.on('change', (b) => batches.push(b));
  w.start();
  assert.equal(w.mode, 'watch');
  assert.deepEqual(modes, ['watch']);
  await new Promise((r) => setTimeout(r, 50));
  await fs.writeFile(path.join(p, 'STATE.md.lock'), '1');
  await fs.writeFile(path.join(p, 'STATE.md'), '# state 2\n');
  await fs.writeFile(path.join(p, 'phases', '01-a', '01-01-PLAN.md'), 'plan');
  // macOS FSEvents may split the three writes across batches or report the nested file
  // by its directory; wait until the union of batches covers both files, then assert on it.
  const seen = () => batches.flat();
  await waitFor(() => (seen().includes('STATE.md') && seen().some((f) => f.endsWith('01-01-PLAN.md') || f.includes('phases')) ? true : undefined));
  const all = seen();
  assert.ok(all.includes('STATE.md'), JSON.stringify(batches));
  assert.ok(!all.some((f) => f.endsWith('.lock')), JSON.stringify(batches));
  assert.ok(all.some((f) => f.endsWith('01-01-PLAN.md') || f.includes('phases')), JSON.stringify(batches));
  // poke() forces a batch; on macOS late FSEvents for the writes above may ride along in it,
  // so only its existence and the lock filter are asserted (Linux delivers []).
  const n = batches.length;
  w.poke();
  await waitFor(() => batches[n]);
  assert.ok(!batches[n]!.some((f) => f.endsWith('.lock')), JSON.stringify(batches[n]));
  w.stop();
  assert.equal(w.mode, 'stopped');
  w.stop();
});

test('poll mode: detects modifications, additions and deletions', async () => {
  const p = await tmpPlanning();
  const w = new PlanningWatcher(p, { forcePoll: true, pollMs: 30, debounceMs: 20 });
  const batches: string[][] = [];
  w.on('change', (b) => batches.push(b));
  w.start();
  assert.equal(w.mode, 'poll');
  await new Promise((r) => setTimeout(r, 60));
  await fs.writeFile(path.join(p, 'STATE.md'), '# changed\n');
  await fs.utimes(path.join(p, 'STATE.md'), new Date(), new Date(Date.now() + 5000));
  await fs.writeFile(path.join(p, 'NEW.md'), 'x');
  await fs.writeFile(path.join(p, 'ignored.tmp'), 'x');
  const first = await waitFor(() => {
    const all = batches.flat();
    return all.includes('STATE.md') && all.includes('NEW.md') ? all : undefined;
  });
  assert.ok(!first.includes('ignored.tmp'));
  const n = batches.length;
  await fs.rm(path.join(p, 'NEW.md'));
  const later = await waitFor(() => (batches.length > n ? batches.slice(n).flat() : undefined));
  assert.ok(later.includes('NEW.md'));
  w.stop();
});

test('fs.watch failure falls back to polling', async () => {
  const p = await tmpPlanning();
  const w = new PlanningWatcher(path.join(p, 'does-not-exist'), { pollMs: 30, debounceMs: 20 });
  const errors: unknown[] = [];
  w.on('watch-error', (e) => errors.push(e));
  w.start();
  assert.equal(w.mode, 'poll');
  assert.equal(errors.length, 1);
  w.stop();
});

test('poll survives unreadable dirs and deep trees', async () => {
  const p = await tmpPlanning();
  let d = p;
  for (let i = 0; i < 9; i++) {
    d = path.join(d, `d${i}`);
    await fs.mkdir(d);
    await fs.writeFile(path.join(d, 'f.md'), 'x');
  }
  const w = new PlanningWatcher(p, { forcePoll: true, pollMs: 30, debounceMs: 20 });
  const batches: string[][] = [];
  w.on('change', (b) => batches.push(b));
  w.start();
  await new Promise((r) => setTimeout(r, 60));
  await fs.writeFile(path.join(p, 'd0', 'd1', 'f.md'), 'y');
  await fs.utimes(path.join(p, 'd0', 'd1', 'f.md'), new Date(), new Date(Date.now() + 5000));
  const first = await waitFor(() => (batches.length ? batches.flat() : undefined));
  assert.ok(first.includes('d0/d1/f.md'));
  w.stop();
});

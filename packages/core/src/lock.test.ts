import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as os from 'node:os';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { waitForStateUnlocked, PlanningLockedError, fileExists, PLANNING_LOCKS } from './lock';

test('returns immediately when no lock', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gsd-lock-'));
  await waitForStateUnlocked(dir);
});

test('waits with doubling backoff then succeeds', async () => {
  const sleeps: number[] = [];
  let polls = 0;
  await waitForStateUnlocked('/x', {
    exists: async () => ++polls <= 3,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
  assert.deepEqual(sleeps, [50, 100, 200]);
});

test('gives up after totalMs with PlanningLockedError', async () => {
  const sleeps: number[] = [];
  await assert.rejects(
    waitForStateUnlocked('/x', {
      exists: async () => true,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    }),
    (e: unknown) => e instanceof PlanningLockedError && e.lockPath === '/x/STATE.md.lock',
  );
  assert.equal(sleeps.reduce((a, b) => a + b, 0), 5000);
  assert.equal(Math.max(...sleeps), 1000);
});

test('fileExists', async () => {
  assert.equal(await fileExists('/definitely/not/here'), false);
  assert.equal(await fileExists(os.tmpdir()), true);
});

test('honours the other two GSD locks by name', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gsd-lock-'));
  for (const name of PLANNING_LOCKS) {
    await fs.writeFile(path.join(dir, name), '31337\n');
    await assert.rejects(
      waitForStateUnlocked(dir, { lockName: name, sleep: async () => {} }),
      (e: unknown) => e instanceof PlanningLockedError && e.lockPath === path.join(dir, name),
    );
    await fs.rm(path.join(dir, name));
    await waitForStateUnlocked(dir, { lockName: name });
  }
});

test('real timers are used when no sleep is injected', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gsd-lock-'));
  await fs.writeFile(path.join(dir, 'STATE.md.lock'), '1\n');
  const t0 = Date.now();
  await assert.rejects(waitForStateUnlocked(dir, { initialMs: 1, totalMs: 10 }), PlanningLockedError);
  assert.ok(Date.now() - t0 >= 9);
});

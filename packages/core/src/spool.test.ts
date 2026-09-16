import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as os from 'node:os';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { appendEventSync, tailSpool, rotateIfNeeded, parseEventLine, spoolFileFor, ROTATE_BYTES, COLD_START_MAX_AGE_MS } from './spool';
import type { ActivityEvent } from './types';

const ev = (over: Partial<ActivityEvent> = {}): ActivityEvent => ({ v: 1, ts: Date.now(), harness: 'claude-code', cwd: '/p', kind: 'tool.pre', tool: 'Bash', ...over });

async function tmp(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'gsd-spool-'));
}

test('append then tail reads events and advances offset', async () => {
  const f = spoolFileFor(await tmp(), 'abc');
  assert.ok(appendEventSync(f, ev({ detail: 'one' })));
  assert.ok(appendEventSync(f, ev({ detail: 'two' })));
  const r1 = await tailSpool(f, { offset: 0 });
  assert.equal(r1.events.length, 2);
  assert.equal(r1.corrupt, 0);
  const r2 = await tailSpool(f, r1.state);
  assert.equal(r2.events.length, 0);
  appendEventSync(f, ev({ detail: 'three' }));
  const r3 = await tailSpool(f, r2.state);
  assert.equal(r3.events.length, 1);
  assert.equal(r3.events[0]?.detail, 'three');
});

test('missing file → empty', async () => {
  const r = await tailSpool('/nope/x.jsonl', { offset: 0 });
  assert.deepEqual(r.events, []);
});

test('corrupt lines are counted, not thrown; partial trailing line waits', async () => {
  const f = spoolFileFor(await tmp(), 'c');
  await fs.writeFile(f, '{"v":1,"ts":' + Date.now() + ',"kind":"tool.pre","cwd":"/p","harness":"other"}\nnot json\n{"v":2}\n{"v":1,"ts":1,"ki');
  const r = await tailSpool(f, { offset: 0 });
  assert.equal(r.events.length, 1);
  assert.equal(r.corrupt, 2);
  await fs.appendFile(f, 'nd":"tool.pre","cwd":"/p","harness":"other"}\n');
  const r2 = await tailSpool(f, r.state, 10);
  assert.equal(r2.events.length, 1);
  assert.equal(r2.events[0]?.ts, 1);
});

test('no newline at all → nothing consumed', async () => {
  const f = spoolFileFor(await tmp(), 'n');
  await fs.writeFile(f, '{"v":1');
  const r = await tailSpool(f, { offset: 0 });
  assert.equal(r.events.length, 0);
  assert.equal(r.state.offset, 0);
});

test('cold start ignores events older than 24h; warm tail does not', async () => {
  const f = spoolFileFor(await tmp(), 'old');
  const now = Date.now();
  appendEventSync(f, ev({ ts: now - COLD_START_MAX_AGE_MS - 1000 }));
  appendEventSync(f, ev({ ts: now }));
  const cold = await tailSpool(f, { offset: 0 }, now);
  assert.equal(cold.events.length, 1);
  appendEventSync(f, ev({ ts: now - COLD_START_MAX_AGE_MS - 1000 }));
  const warm = await tailSpool(f, cold.state, now);
  assert.equal(warm.events.length, 1);
});

test('truncation / inode change restarts from 0', async () => {
  const dir = await tmp();
  const f = spoolFileFor(dir, 't');
  appendEventSync(f, ev());
  appendEventSync(f, ev());
  const r = await tailSpool(f, { offset: 0 });
  await fs.rm(f);
  appendEventSync(f, ev({ detail: 'fresh' }));
  const r2 = await tailSpool(f, r.state);
  assert.equal(r2.events.length, 1);
  assert.equal(r2.events[0]?.detail, 'fresh');
  // truncation with same inode
  await fs.truncate(f, 0);
  appendEventSync(f, ev({ detail: 'after-trunc' }));
  const r3 = await tailSpool(f, { offset: 10_000, ino: r2.state.ino });
  assert.equal(r3.events[0]?.detail, 'after-trunc');
});

test('oversized detail is trimmed; absurd events are refused', () => {
  const f = spoolFileFor(os.tmpdir(), 'big-' + process.pid);
  assert.ok(appendEventSync(f, ev({ detail: 'x'.repeat(5000) })));
  const bad = ev({ detail: 'x'.repeat(5000), tool: 'y'.repeat(5000) });
  assert.equal(appendEventSync(f, bad), false);
});

test('append to unwritable path returns false', () => {
  assert.equal(appendEventSync(path.join(os.tmpdir(), 'gsd-spool-notadir-' + process.pid), ev()), true);
  assert.equal(appendEventSync(path.join(os.tmpdir(), 'gsd-spool-notadir-' + process.pid, 'x.jsonl'), ev()), false);
});

test('parseEventLine validates shape', () => {
  assert.equal(parseEventLine('{"v":1,"ts":1,"kind":"tool.pre","cwd":"/"}')?.kind, 'tool.pre');
  assert.equal(parseEventLine('{"v":1,"ts":"1","kind":"tool.pre","cwd":"/"}'), undefined);
  assert.equal(parseEventLine('null'), undefined);
  assert.equal(parseEventLine('{'), undefined);
});

test('rotateIfNeeded keeps two generations', async () => {
  const dir = await tmp();
  const f = spoolFileFor(dir, 'r');
  assert.equal(await rotateIfNeeded(f), false);
  await fs.writeFile(f, Buffer.alloc(ROTATE_BYTES, 0x61));
  assert.equal(await rotateIfNeeded(f), true);
  assert.equal(await fs.stat(`${f}.1`).then(() => true), true);
  await fs.writeFile(f, Buffer.alloc(ROTATE_BYTES, 0x62));
  assert.equal(await rotateIfNeeded(f), true);
  assert.equal(await fs.stat(`${f}.2`).then(() => true), true);
  await fs.writeFile(f, Buffer.alloc(1));
  assert.equal(await rotateIfNeeded(f), false);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as os from 'node:os';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { SeqStore } from './seq';

test('monotonic per key, persists and reloads', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gsd-seq-'));
  const file = path.join(dir, 'state', 'seq.json');
  const s = new SeqStore(file, 5, () => 0);
  await s.load();
  assert.equal(s.current('a'), 0);
  assert.equal(s.next('a'), 1);
  assert.equal(s.next('a'), 2);
  assert.equal(s.next('b'), 1);
  await s.flush();
  await s.flush(); // no-op when clean
  const s2 = new SeqStore(file, 250, () => 0);
  await s2.load();
  assert.equal(s2.next('a'), 3);
  assert.equal(s2.current('b'), 1);
  assert.deepEqual(s2.keys().sort(), ['a', 'b']);
});

test('debounced auto flush', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gsd-seq-'));
  const file = path.join(dir, 'seq.json');
  const s = new SeqStore(file, 10, () => 0);
  s.next('k');
  s.next('k');
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), { k: 2 });
});

test('corrupt file is ignored', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gsd-seq-'));
  const file = path.join(dir, 'seq.json');
  await fs.writeFile(file, '{"a": -1, "b": "x", "c": 4');
  const s = new SeqStore(file, 250, () => 0);
  await s.load();
  assert.equal(s.next('a'), 1);
  await fs.writeFile(file, '{"a": -1, "b": "x", "c": 4}');
  const s2 = new SeqStore(file, 250, () => 0);
  await s2.load();
  assert.equal(s2.current('a'), 0);
  assert.equal(s2.current('b'), 0);
  assert.equal(s2.current('c'), 4);
});

test('wall-clock floor: seq never falls below now()', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gsd-seq-'));
  let t = 1_000_000;
  const s = new SeqStore(path.join(dir, 'seq.json'), 250, () => t);
  assert.equal(s.next('a'), 1_000_000);
  assert.equal(s.next('a'), 1_000_001);
  t = 2_000_000;
  assert.equal(s.next('a'), 2_000_000);
  t = 1;
  assert.equal(s.next('a'), 2_000_001);
});

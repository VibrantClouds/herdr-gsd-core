import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { contextBridgePath, isSafeSessionId, readContextBridge, readContextPercent } from './statusline';

const SID = '11111111-2222-3333-4444-555555555555';
const NOW = 1_789_525_613_000;

async function withBridge(body: string, sid = SID): Promise<string> {
  const dir = await fs.mkdtemp(join(tmpdir(), 'gsd-ctx-'));
  await fs.writeFile(join(dir, `claude-ctx-${sid}.json`), body);
  return dir;
}

test('reads the real 1.14 bridge payload', async () => {
  // verbatim shape from spike §4 (116 B, mode 0644)
  const dir = await withBridge(JSON.stringify({ session_id: SID, remaining_percentage: 86, used_pct: 14, timestamp: NOW / 1000 }));
  assert.equal(await readContextPercent(SID, { tmpdir: dir, now: () => NOW }), 86);
  const b = await readContextBridge(SID, { tmpdir: dir, now: () => NOW });
  assert.deepEqual(b, { session_id: SID, remaining_percentage: 86, used_pct: 14, timestamp: NOW / 1000 });
});

test('missing file → undefined', async () => {
  const dir = await fs.mkdtemp(join(tmpdir(), 'gsd-ctx-'));
  assert.equal(await readContextPercent(SID, { tmpdir: dir, now: () => NOW }), undefined);
});

test('defaults to os.tmpdir() when no dir given', async () => {
  assert.equal(await readContextPercent('no-such-session-id-here'), undefined);
  assert.equal(contextBridgePath('abc'), join(tmpdir(), 'claude-ctx-abc.json'));
  assert.equal(contextBridgePath('abc', '/x'), join('/x', 'claude-ctx-abc.json'));
});

test('short read of the non-atomic write → undefined, never a throw', async () => {
  const dir = await withBridge('{"session_id":"x","remaining_per');
  assert.equal(await readContextPercent(SID, { tmpdir: dir, now: () => NOW }), undefined);
});

test('non-object JSON → undefined', async () => {
  const dir = await withBridge('42');
  assert.equal(await readContextPercent(SID, { tmpdir: dir, now: () => NOW }), undefined);
  const dir2 = await withBridge('null');
  assert.equal(await readContextPercent(SID, { tmpdir: dir2, now: () => NOW }), undefined);
});

test('stale beyond GSD\'s own 60 s convention → undefined', async () => {
  const dir = await withBridge(JSON.stringify({ remaining_percentage: 50, timestamp: NOW / 1000 - 61 }));
  assert.equal(await readContextPercent(SID, { tmpdir: dir, now: () => NOW }), undefined);
  assert.equal(await readContextPercent(SID, { tmpdir: dir, now: () => NOW, staleMs: 120_000 }), 50);
});

test('out-of-range or non-numeric fields → undefined', async () => {
  for (const body of [
    { remaining_percentage: '86', timestamp: NOW / 1000 },
    { remaining_percentage: -1, timestamp: NOW / 1000 },
    { remaining_percentage: 101, timestamp: NOW / 1000 },
    { remaining_percentage: Number.NaN, timestamp: NOW / 1000 },
    { remaining_percentage: 50 },
    { remaining_percentage: 50, timestamp: 'soon' },
    { remaining_percentage: 50, timestamp: Number.POSITIVE_INFINITY },
  ]) {
    const dir = await withBridge(JSON.stringify(body));
    assert.equal(await readContextPercent(SID, { tmpdir: dir, now: () => NOW }), undefined, JSON.stringify(body));
  }
});

test('missing/!numeric used_pct and session_id are reconstructed', async () => {
  const dir = await withBridge(JSON.stringify({ remaining_percentage: 62, timestamp: NOW / 1000 }));
  const b = await readContextBridge(SID, { tmpdir: dir, now: () => NOW });
  assert.deepEqual(b, { session_id: SID, remaining_percentage: 62, used_pct: 38, timestamp: NOW / 1000 });
});

test('session ids that could escape tmpdir are rejected before any read', async () => {
  let reads = 0;
  const readFile = async (): Promise<string> => {
    reads++;
    return '{}';
  };
  for (const bad of ['', '../etc/passwd', 'a/b', 'a\\b', '..']) {
    assert.equal(isSafeSessionId(bad), false, bad);
    assert.equal(await readContextPercent(bad, { readFile }), undefined);
  }
  assert.equal(reads, 0);
  assert.equal(isSafeSessionId(SID), true);
});

test('unreadable file (injected throw) → undefined', async () => {
  const readFile = async (): Promise<string> => {
    throw new Error('EACCES');
  };
  assert.equal(await readContextPercent(SID, { readFile }), undefined);
});

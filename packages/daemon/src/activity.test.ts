import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ActivityTracker, shortAgent } from './activity';
import type { ActivityEvent } from '@herdr-gsd/core';

const ev = (kind: ActivityEvent['kind'], over: Partial<ActivityEvent> = {}): ActivityEvent => ({
  v: 1,
  ts: 1000,
  harness: 'claude-code',
  cwd: '/p',
  kind,
  ...over,
});

test('spans open/close, workers count, agent is most recent open span', () => {
  const t = new ActivityTracker();
  t.ingest(ev('session.start', { sessionId: 's1', paneId: 'w1:p1' }));
  t.ingest(ev('subagent.start', { agent: 'gsd-planner', ts: 1000 }));
  t.ingest(ev('subagent.start', { agent: 'gsd-executor', ts: 1001 }));
  let v = t.snapshot(2000);
  assert.equal(v.workers, 2);
  assert.equal(v.agent, 'executor');
  assert.equal(v.lastSessionId, 's1');
  assert.equal(v.lastPaneId, 'w1:p1');
  assert.equal(v.lastHarness, 'claude-code');
  // stop with unknown key pops the most recent span
  t.ingest(ev('subagent.stop', { agent: 'other', ts: 1002 }));
  v = t.snapshot(2000);
  assert.equal(v.workers, 1);
  assert.equal(v.agent, 'planner');
  // duplicate start with same key is ignored
  t.ingest(ev('subagent.start', { agent: 'gsd-planner', ts: 1003 }));
  assert.equal(t.snapshot(2000).workers, 1);
  // keyed by agent id via detail
  t.ingest(ev('subagent.start', { agent: 'gsd-verifier', detail: 'id:abc-1', ts: 1004 }));
  t.ingest(ev('subagent.start', { agent: 'gsd-verifier', detail: 'id:abc-1', ts: 1005 }));
  assert.equal(t.snapshot(2000).workers, 2);
  t.ingest(ev('subagent.stop', { detail: 'id:abc-1', ts: 1006 }));
  assert.equal(t.snapshot(2000).workers, 1);
  assert.equal(t.snapshot(2000).agent, 'planner');
  // session stop clears everything
  t.ingest(ev('session.stop', { ts: 1007 }));
  v = t.snapshot(2000);
  assert.equal(v.workers, 0);
  assert.equal(v.agent, undefined);
  assert.equal(v.sessionEnded, true);
  t.ingest(ev('session.start', { ts: 1008 }));
  assert.equal(t.snapshot(2000).sessionEnded, false);
});

test('span TTL expires start-only spans; tool TTL', () => {
  const t = new ActivityTracker({ spanTtlMs: 100, toolTtlMs: 50 });
  t.ingest(ev('subagent.start', { agent: 'x', ts: 0 }));
  t.ingest(ev('tool.pre', { tool: 'Bash', detail: 'git diff', ts: 0 }));
  let v = t.snapshot(10);
  assert.equal(v.workers, 1);
  assert.equal(v.tool, 'Bash git diff');
  assert.equal(v.toolAt, 0);
  v = t.snapshot(60);
  assert.equal(v.tool, undefined);
  assert.equal(v.toolAt, undefined);
  assert.equal(v.workers, 1);
  v = t.snapshot(101);
  assert.equal(v.workers, 0);
  t.ingest(ev('tool.pre', { tool: 'Read', ts: 200 }));
  assert.equal(t.snapshot(201).tool, 'Read');
  t.ingest(ev('tool.post', { tool: 'Read', ts: 202 }));
  t.ingest(ev('compact.pre', { ts: 203 }));
  t.ingest(ev('phase.boundary', { ts: 204 }));
  assert.equal(t.snapshot(205).lastEventAt, 204);
});

test('history is bounded', () => {
  const t = new ActivityTracker({ historySize: 3 });
  for (let i = 0; i < 5; i++) t.ingest(ev('tool.pre', { ts: i }));
  assert.deepEqual(
    t.recent().map((e) => e.ts),
    [2, 3, 4],
  );
});

test('shortAgent', () => {
  assert.equal(shortAgent('gsd-executor'), 'executor');
  assert.equal(shortAgent('gsd_verifier'), 'verifier');
  assert.equal(shortAgent('gsd:planner'), 'planner');
  assert.equal(shortAgent(''), 'subagent');
  assert.equal(shortAgent('a'.repeat(30)).length, 24);
});

test('inferred PreToolUse(Agent) span and real SubagentStart are one span', () => {
  const t = new ActivityTracker();
  t.ingest(ev('session.start', { sessionId: 's1' }));
  t.ingest(ev('subagent.start', { sessionId: 's1', agent: 'gsd-executor', tool: 'Agent', detail: 'executor', ts: 1000 }));
  t.ingest(ev('subagent.start', { sessionId: 's1', agent: 'gsd-executor', ts: 1200 }));
  assert.equal(t.snapshot(1300).workers, 1);
  // real stop closes it
  t.ingest(ev('subagent.stop', { sessionId: 's1', agent: 'gsd-executor', ts: 1400 }));
  assert.equal(t.snapshot(1500).workers, 0);
  // same agent started again later (> 10 s) is a new span, and two different agents are two spans
  t.ingest(ev('subagent.start', { sessionId: 's1', agent: 'gsd-executor', tool: 'Agent', ts: 20_000 }));
  t.ingest(ev('subagent.start', { sessionId: 's1', agent: 'gsd-verifier', ts: 20_100 }));
  assert.equal(t.snapshot(20_200).workers, 2);
  // real first, inferred second (order flipped) is still one span
  const u = new ActivityTracker();
  u.ingest(ev('subagent.start', { sessionId: 's2', agent: 'gsd-planner', ts: 1 }));
  u.ingest(ev('subagent.start', { sessionId: 's2', agent: 'gsd-planner', tool: 'Agent', ts: 2 }));
  assert.equal(u.snapshot(3).workers, 1);
  // a second inferred start for the same agent after 10 s opens a second span
  u.ingest(ev('subagent.start', { sessionId: 's2', agent: 'gsd-planner', tool: 'Agent', ts: 20_000 }));
  assert.equal(u.snapshot(20_001).workers, 2);
});

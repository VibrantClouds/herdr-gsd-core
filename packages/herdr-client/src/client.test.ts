import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { HerdrClient, HerdrError, LineSplitter, clampValue, normalizeTokens, parseResponseLine } from './client';
import { AgentStatus, AnyEventEnvelope } from './types';

/**
 * `test/fake-herdr` references this package, so it cannot be imported
 * statically without a project-reference cycle. It is loaded at runtime
 * instead; `npm run build` builds both before the tests run.
 */
interface FakeLike {
  socketPath: string;
  calls: { order: number; method: string; params: Record<string, unknown> }[];
  notificationMode: string;
  subscriberCount: number;
  addWorkspace(input: Record<string, unknown>): { workspace_id: string };
  addPane(input: Record<string, unknown>): { pane_id: string };
  setAgentStatus(paneId: string, status: AgentStatus): void;
  tokensOf(id: string): Record<string, string> | undefined;
  dropSubscribers(): number;
  close(): Promise<void>;
}
const { FakeHerdr } = require('@herdr-gsd/fake-herdr') as { FakeHerdr: { start(o?: { socketPath?: string }): Promise<FakeLike> } };

const SOURCE = 'plugin:herdr-gsd-core';

async function tmpSocket(name = 'herdr.sock'): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'herdr-client-'));
  return path.join(dir, name);
}

async function withFake(fn: (fake: FakeLike, client: HerdrClient) => Promise<void>): Promise<void> {
  const fake = await FakeHerdr.start({ socketPath: await tmpSocket() });
  const client = new HerdrClient({ socketPath: fake.socketPath, source: SOURCE, timeoutMs: 2000 });
  try {
    await fn(fake, client);
  } finally {
    await fake.close();
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/* -------------------------------------------------------------------------- */
/* Envelope parsing                                                            */
/* -------------------------------------------------------------------------- */

test('parseResponseLine unwraps result and maps errors, ignoring the id', () => {
  assert.deepEqual(parseResponseLine('{"id":"req_0","result":{"type":"ok"}}'), { type: 'ok' });
  assert.throws(
    () => parseResponseLine('{"id":"req_1","error":{"code":"not_found","message":"pane not found"}}'),
    (e: unknown) => e instanceof HerdrError && e.code === 'not_found' && e.message === 'pane not found',
  );
  // deserialization failures answer with id "" — the mapping must not care
  assert.throws(
    () => parseResponseLine('{"id":"","error":{"code":"invalid_request","message":"invalid request: unknown variant `x`"}}'),
    (e: unknown) => e instanceof HerdrError && e.code === 'invalid_request',
  );
  assert.throws(() => parseResponseLine('not json'), (e: unknown) => e instanceof HerdrError && e.code === 'bad_response');
  assert.throws(() => parseResponseLine('{"id":"a"}'), (e: unknown) => e instanceof HerdrError && e.code === 'bad_response');
});

test('LineSplitter yields complete NDJSON lines across chunk boundaries', () => {
  const s = new LineSplitter();
  assert.deepEqual(s.push('{"a":1}\n{"b'), ['{"a":1}']);
  assert.deepEqual(s.push('":2}\n\n{"c":3}\n'), ['{"b":2}', '{"c":3}']);
  assert.deepEqual(s.push('partial'), []);
});

test('ping and reads round-trip through a real socket', async () => {
  await withFake(async (fake, client) => {
    const pong = await client.ping();
    assert.equal(pong.type, 'pong');
    assert.equal(pong.version, '0.9.0');
    assert.equal(pong.protocol, 22);
    assert.equal(pong.capabilities?.live_handoff, true);

    fake.addWorkspace({ workspace_id: 'w1', label: 'proj', focused: true });
    fake.addPane({ workspace_id: 'w1', pane_id: 'w1:p1', agent: 'claude', agent_status: 'working', cwd: '/proj' });

    // connection-per-request: every call opens its own socket
    assert.equal((await client.workspaceList()).length, 1);
    assert.equal((await client.paneList()).length, 1);
    assert.equal((await client.paneList('w1')).length, 1);
    assert.equal((await client.agentList())[0]?.pane_id, 'w1:p1');
    assert.equal((await client.sessionSnapshot()).focused_workspace_id, 'w1');
    assert.equal((await client.paneGet('w1:p1')).cwd, '/proj');
    assert.equal((await client.agentGet('w1:p1')).agent, 'claude');
    assert.equal(fake.calls.length, 8);
  });
});

/* -------------------------------------------------------------------------- */
/* Error mapping                                                               */
/* -------------------------------------------------------------------------- */

test('maps herdr errors, unknown methods, missing sockets and timeouts', async () => {
  await withFake(async (fake, client) => {
    await assert.rejects(client.paneGet('w9:p9'), (e: unknown) => e instanceof HerdrError && e.code === 'pane_not_found');
    await assert.rejects(client.call('no.such_method'), (e: unknown) => {
      return e instanceof HerdrError && e.code === 'invalid_request' && /unknown variant `no\.such_method`/.test(e.message);
    });
  });

  // a socket that is not there at all: ENOENT / ECONNREFUSED
  const gone = new HerdrClient({ socketPath: await tmpSocket('missing.sock'), source: SOURCE, timeoutMs: 500 });
  await assert.rejects(gone.ping(), (e: unknown) => e instanceof HerdrError && e.code === 'socket_unavailable');

  // a server that accepts but never answers
  const deafPath = await tmpSocket('deaf.sock');
  const accepted = new Set<net.Socket>();
  const deaf = net.createServer((s) => {
    accepted.add(s);
    s.on('error', () => undefined);
    s.on('close', () => accepted.delete(s));
  });
  await new Promise<void>((r) => deaf.listen(deafPath, () => r()));
  try {
    const client = new HerdrClient({ socketPath: deafPath, source: SOURCE, timeoutMs: 60 });
    await assert.rejects(client.ping(), (e: unknown) => e instanceof HerdrError && e.code === 'timeout');
  } finally {
    for (const s of accepted) s.destroy();
    await new Promise<void>((r) => deaf.close(() => r()));
  }
});

/* -------------------------------------------------------------------------- */
/* Metadata validation and clamping                                            */
/* -------------------------------------------------------------------------- */

test('normalizeTokens validates keys, caps key count and clamps values', () => {
  assert.deepEqual(normalizeTokens({ gsd_phase: '03 auth', gsd_next: null, 'A-b_9': '' }), { gsd_phase: '03 auth', gsd_next: null, 'A-b_9': '' });
  assert.throws(() => normalizeTokens({ 'bad name': 'x' }), (e: unknown) => e instanceof HerdrError && e.code === 'invalid_metadata_token');
  assert.throws(() => normalizeTokens({ ['a'.repeat(33)]: 'x' }), (e: unknown) => e instanceof HerdrError && e.code === 'invalid_metadata_token');
  assert.throws(() => normalizeTokens({ '': 'x' }), (e: unknown) => e instanceof HerdrError && e.code === 'invalid_metadata_token');
  assert.throws(
    () => normalizeTokens(Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`k${i}`, 'v']))),
    (e: unknown) => e instanceof HerdrError && e.code === 'invalid_metadata_token',
  );
  const clamped = normalizeTokens({ gsd_long: 'A'.repeat(200) })['gsd_long'];
  assert.equal(clamped?.length, 80);
  assert.ok(clamped?.endsWith('…'));
  assert.equal(clampValue('short', 80), 'short');
  assert.equal(clampValue('abcdef', 3), 'ab…');
});

test('metadata wrappers stamp source, clamp values and pass seq through untouched', async () => {
  await withFake(async (fake, client) => {
    fake.addWorkspace({ workspace_id: 'w1' });
    fake.addPane({ workspace_id: 'w1', pane_id: 'w1:p1', agent: 'claude' });

    const seq = Date.now();
    await client.reportWorkspaceMetadata({ workspace_id: 'w1', tokens: { gsd_phase: 'A'.repeat(200) }, seq });
    const ws = fake.calls.find((c) => c.method === 'workspace.report_metadata')!;
    assert.equal(ws.params['source'], SOURCE);
    assert.equal(ws.params['seq'], seq);
    const sent = (ws.params['tokens'] as Record<string, string>)['gsd_phase']!;
    assert.equal(sent.length, 80);
    assert.ok(sent.endsWith('…'), 'truncation is visible rather than silent');
    assert.equal(fake.tokensOf('w1')?.['gsd_phase'], sent, 'the server stored exactly what we clamped');

    await client.reportPaneMetadata({ pane_id: 'w1:p1', tokens: { gsd_tool: 'Bash git diff' }, seq: seq + 1, ttl_ms: 15000 });
    const pane = fake.calls.find((c) => c.method === 'pane.report_metadata')!;
    assert.equal(pane.params['source'], SOURCE);
    assert.equal(pane.params['ttl_ms'], 15000);
    assert.equal(pane.params['seq'], seq + 1);

    // presentation fields pass through without tokens
    await client.reportPaneMetadata({ pane_id: 'w1:p1', title: 'GSD · proj · 03', seq: seq + 2 });
    assert.equal((await client.paneGet('w1:p1')).title, 'GSD · proj · 03');
  });
});

test('invalid tokens are rejected locally, before anything is sent', async () => {
  await withFake(async (fake, client) => {
    fake.addWorkspace({ workspace_id: 'w1' });
    const before = fake.calls.length;
    await assert.rejects(
      client.reportWorkspaceMetadata({ workspace_id: 'w1', tokens: { 'bad name': 'x' } }),
      (e: unknown) => e instanceof HerdrError && e.code === 'invalid_metadata_token',
    );
    await assert.rejects(
      client.reportPaneMetadata({ pane_id: 'w1:p1', tokens: Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`k${i}`, 'v'])) }),
      (e: unknown) => e instanceof HerdrError && e.code === 'invalid_metadata_token',
    );
    assert.equal(fake.calls.length, before, 'nothing reached the socket');
  });
});

test('notificationShow clamps title to 80 and body to 240 and reports the reason', async () => {
  await withFake(async (fake, client) => {
    const ok = await client.notificationShow({ title: 'T'.repeat(120), body: 'B'.repeat(400), sound: 'done' });
    assert.deepEqual(ok, { type: 'notification_show', shown: true, reason: 'shown' });
    const sent = fake.calls.find((c) => c.method === 'notification.show')!.params;
    assert.equal((sent['title'] as string).length, 80);
    assert.equal((sent['body'] as string).length, 240);
    assert.equal(sent['sound'], 'done');

    fake.notificationMode = 'rate_limited';
    const limited = await client.notificationShow({ title: 'GSD' });
    assert.equal(limited.shown, false);
    assert.equal(limited.reason, 'rate_limited');
  });
});

/* -------------------------------------------------------------------------- */
/* Subscriptions                                                               */
/* -------------------------------------------------------------------------- */

test('subscribe streams lifecycle and pane-scoped envelopes down one connection', async () => {
  await withFake(async (fake, client) => {
    fake.addWorkspace({ workspace_id: 'w1' });
    fake.addPane({ workspace_id: 'w1', pane_id: 'w1:p1', agent: 'claude', agent_status: 'working' });

    const got: AnyEventEnvelope[] = [];
    let closedWith: HerdrError | undefined | 'clean' = undefined;
    const sub = await client.subscribe([{ type: 'pane.updated' }, { type: 'pane.agent_status_changed', pane_id: 'w1:p1' }], {
      onEvent: (e) => got.push(e),
      onClose: (err) => {
        closedWith = err ?? 'clean';
      },
    });
    assert.equal(fake.subscriberCount, 1);

    fake.setAgentStatus('w1:p1', 'blocked');
    await sleep(40);

    assert.equal(got.length, 2);
    const lifecycle = got.find((e) => e.event === 'pane_updated');
    assert.equal((lifecycle?.data as { pane: { agent_status: string } }).pane.agent_status, 'blocked');
    const scoped = got.find((e) => e.event === 'pane.agent_status_changed');
    assert.equal((scoped?.data as { pane_id: string }).pane_id, 'w1:p1');

    sub.close();
    await sleep(20);
    assert.equal(closedWith, 'clean');
    assert.equal(fake.subscriberCount, 0);
  });
});

test('subscribeWithReconnect re-subscribes with backoff and reports a gap', async () => {
  await withFake(async (fake, client) => {
    fake.addWorkspace({ workspace_id: 'w1' });
    fake.addPane({ workspace_id: 'w1', pane_id: 'w1:p1', agent: 'claude', agent_status: 'working' });

    const events: string[] = [];
    let gaps = 0;
    const handle = client.subscribeWithReconnect(
      [{ type: 'pane.updated' }],
      {
        onEvent: (e) => events.push(e.event),
        onGap: () => {
          gaps += 1;
        },
      },
      { initialBackoffMs: 20, maxBackoffMs: 40 },
    );

    for (let i = 0; i < 50 && fake.subscriberCount === 0; i++) await sleep(10);
    assert.equal(fake.subscriberCount, 1);
    assert.equal(gaps, 0, 'the first subscription is not a gap');

    fake.setAgentStatus('w1:p1', 'blocked');
    await sleep(30);
    assert.equal(events.length, 1);

    // server drops the stream (restart / live handoff): no replay exists
    fake.dropSubscribers();
    fake.setAgentStatus('w1:p1', 'idle'); // missed entirely
    for (let i = 0; i < 50 && gaps === 0; i++) await sleep(10);
    assert.equal(gaps, 1, 'onGap fires once per successful re-subscription');
    assert.equal(fake.subscriberCount, 1);
    assert.equal(events.length, 1, 'the event emitted while disconnected is lost');

    fake.setAgentStatus('w1:p1', 'working');
    await sleep(40);
    assert.equal(events.length, 2, 'streaming resumed');

    handle.close();
    await sleep(60);
    assert.equal(fake.subscriberCount, 0);
    assert.equal(gaps, 1, 'close() stops the reconnect loop');
  });
});

test('subscribe rejects when the socket is unavailable', async () => {
  const client = new HerdrClient({ socketPath: await tmpSocket('nope.sock'), source: SOURCE, timeoutMs: 300 });
  await assert.rejects(
    client.subscribe([{ type: 'pane.updated' }], { onEvent: () => undefined }),
    (e: unknown) => e instanceof HerdrError && e.code === 'socket_unavailable',
  );
});

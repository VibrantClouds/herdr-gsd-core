import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { HerdrClient, HerdrError } from '@herdr-gsd/herdr-client';
import { FAKE_METHODS, FakeHerdr } from './server';

async function tmpSocket(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fake-herdr-'));
  return path.join(dir, 'herdr.sock');
}

async function withFake(fn: (fake: FakeHerdr, client: HerdrClient) => Promise<void>): Promise<void> {
  const fake = await FakeHerdr.start({ socketPath: await tmpSocket() });
  const client = new HerdrClient({ socketPath: fake.socketPath, source: 'plugin:herdr-gsd-core', timeoutMs: 2000 });
  try {
    await fn(fake, client);
  } finally {
    await fake.close();
  }
}

/** Raw NDJSON exchange that keeps the connection and reports what happened. */
function rawExchange(socketPath: string, lines: string[]): Promise<{ replies: string[]; closed: boolean; error?: string }> {
  return new Promise((resolve) => {
    const sock = net.createConnection(socketPath);
    const replies: string[] = [];
    let buf = '';
    let error: string | undefined;
    sock.setEncoding('utf8');
    sock.on('connect', () => {
      for (const l of lines) sock.write(l + '\n');
    });
    sock.on('data', (chunk: string) => {
      buf += chunk;
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (line.trim()) replies.push(line);
      }
    });
    sock.on('error', (e: NodeJS.ErrnoException) => {
      error = e.code ?? e.message;
    });
    sock.on('close', () => resolve({ replies, closed: true, error }));
  });
}

test('answers one request per connection, then closes', async () => {
  await withFake(async (fake) => {
    const { replies, closed } = await rawExchange(fake.socketPath, ['{"id":"a","method":"ping","params":{}}']);
    assert.equal(replies.length, 1);
    assert.equal(closed, true);
    assert.equal(JSON.parse(replies[0]!).result.type, 'pong');

    // A second request pipelined on the same connection is never answered.
    const second = await rawExchange(fake.socketPath, ['{"id":"a","method":"ping","params":{}}', '{"id":"b","method":"ping","params":{}}']);
    assert.equal(second.replies.length, 1);
    assert.equal(JSON.parse(second.replies[0]!).id, 'a');
  });
});

test('unknown method returns invalid_request with id "" and the method catalogue', async () => {
  await withFake(async (fake) => {
    const { replies } = await rawExchange(fake.socketPath, ['{"id":"req_1","method":"no.such_method","params":{}}']);
    const msg = JSON.parse(replies[0]!) as { id: string; error: { code: string; message: string } };
    assert.equal(msg.id, '');
    assert.equal(msg.error.code, 'invalid_request');
    assert.match(msg.error.message, /^invalid request: unknown variant `no\.such_method`, expected one of `ping`, /);
    for (const m of FAKE_METHODS) assert.ok(msg.error.message.includes(`\`${m}\``), `catalogue is missing ${m}`);
  });
});

test('missing required field is a deserialization error with id ""', async () => {
  await withFake(async (fake) => {
    const { replies } = await rawExchange(fake.socketPath, ['{"id":"req_3","method":"pane.report_metadata","params":{}}']);
    const msg = JSON.parse(replies[0]!) as { id: string; error: { code: string; message: string } };
    assert.equal(msg.id, '');
    assert.equal(msg.error.code, 'invalid_request');
    assert.match(msg.error.message, /missing field `pane_id`/);
  });
});

test('seq <= high-water is accepted with ok but not applied; no event', async () => {
  await withFake(async (fake, client) => {
    fake.addWorkspace({ workspace_id: 'w1', label: 'proj' });
    const events: string[] = [];
    const sub = await client.subscribe([{ type: 'workspace.metadata_updated' }], { onEvent: (e) => events.push(e.event) });

    assert.deepEqual(await client.reportWorkspaceMetadata({ workspace_id: 'w1', tokens: { gsd_phase: 'hello' }, seq: 1 }), { type: 'ok' });
    assert.deepEqual(fake.tokensOf('w1'), { gsd_phase: 'hello' });

    // same seq, then lower seq: both ok, neither applied
    assert.deepEqual(await client.reportWorkspaceMetadata({ workspace_id: 'w1', tokens: { gsd_phase: 'IGNORED' }, seq: 1 }), { type: 'ok' });
    assert.deepEqual(await client.reportWorkspaceMetadata({ workspace_id: 'w1', tokens: { gsd_phase: 'LOWER' }, seq: 0 }), { type: 'ok' });
    assert.deepEqual(fake.tokensOf('w1'), { gsd_phase: 'hello' });

    await client.reportWorkspaceMetadata({ workspace_id: 'w1', tokens: { gsd_phase: 'hello2' }, seq: 2 });
    assert.deepEqual(fake.tokensOf('w1'), { gsd_phase: 'hello2' });

    // a different source has its own high-water mark
    const other = new HerdrClient({ socketPath: fake.socketPath, source: 'plugin:other', timeoutMs: 2000 });
    await other.reportWorkspaceMetadata({ workspace_id: 'w1', tokens: { other_tok: 'x' }, seq: 1 });
    assert.deepEqual(fake.tokensOf('w1'), { gsd_phase: 'hello2', other_tok: 'x' });

    await new Promise((r) => setTimeout(r, 30));
    assert.deepEqual(events, ['workspace_metadata_updated', 'workspace_metadata_updated', 'workspace_metadata_updated']);
    sub.close();
  });
});

test('token rules: key regex, 16 per report, silent 80-char truncation, null and "" clear', async () => {
  await withFake(async (fake, client) => {
    fake.addWorkspace({ workspace_id: 'w1' });
    // The client refuses bad keys locally, so drive the server directly.
    await assert.rejects(client.call('workspace.report_metadata', { workspace_id: 'w1', source: 'plugin:x', tokens: { 'bad name': 'x' } }), (e: unknown) => {
      return e instanceof HerdrError && e.code === 'invalid_metadata_token';
    });
    await assert.rejects(
      client.call('workspace.report_metadata', {
        workspace_id: 'w1',
        source: 'plugin:x',
        tokens: Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`k${i}`, 'v'])),
      }),
      (e: unknown) => e instanceof HerdrError && e.code === 'invalid_metadata_token',
    );
    await assert.rejects(client.call('workspace.report_metadata', { workspace_id: 'w1', source: 'bad source!', tokens: { a: 'b' } }), (e: unknown) => {
      return e instanceof HerdrError && e.code === 'invalid_metadata_source';
    });
    await assert.rejects(client.call('workspace.report_metadata', { workspace_id: 'w1', source: 'plugin:x', tokens: { a: 'b' }, ttl_ms: 99_999_999 }), (e: unknown) => {
      return e instanceof HerdrError && e.code === 'invalid_metadata_ttl';
    });

    await client.call('workspace.report_metadata', { workspace_id: 'w1', source: 'plugin:x', tokens: { gsd_long: 'A'.repeat(120) } });
    assert.equal(fake.tokensOf('w1')?.['gsd_long']?.length, 80);

    await client.call('workspace.report_metadata', { workspace_id: 'w1', source: 'plugin:x', tokens: { gsd_long: null } });
    assert.equal(fake.tokensOf('w1'), undefined, 'tokens key is dropped entirely, not left as {}');

    await client.call('workspace.report_metadata', { workspace_id: 'w1', source: 'plugin:x', tokens: { gsd_a: 'x' } });
    await client.call('workspace.report_metadata', { workspace_id: 'w1', source: 'plugin:x', tokens: { gsd_a: '' } });
    assert.equal(fake.tokensOf('w1'), undefined, 'empty string clears too');
  });
});

test('pane metadata reports emit pane_updated and expire with ttl_ms', async () => {
  await withFake(async (fake, client) => {
    fake.addWorkspace({ workspace_id: 'w1' });
    const pane = fake.addPane({ workspace_id: 'w1', pane_id: 'w1:p1', agent: 'claude' });
    const revisions: number[] = [];
    const sub = await client.subscribe([{ type: 'pane.updated' }], {
      onEvent: (e) => {
        if (e.event === 'pane_updated') revisions.push((e.data as { pane: { revision: number } }).pane.revision);
      },
    });

    await client.reportPaneMetadata({ pane_id: 'w1:p1', tokens: { gsd_tool: 'Bash git diff' }, seq: 1, ttl_ms: 60 });
    assert.deepEqual(fake.tokensOf('w1:p1'), { gsd_tool: 'Bash git diff' });
    // pane tokens surface on agent.list too
    const agents = await client.agentList();
    assert.deepEqual(agents[0]?.tokens, { gsd_tool: 'Bash git diff' });

    await new Promise((r) => setTimeout(r, 140));
    assert.equal(fake.tokensOf('w1:p1'), undefined, 'ttl expiry removed the token');
    assert.equal(revisions.length, 2, 'set + expiry both emit pane_updated');
    assert.ok(revisions[1]! > revisions[0]!);
    assert.ok(pane.revision > 1);
    sub.close();
  });
});

test('agent.view.set is gated on a registered, enabled plugin source', async () => {
  await withFake(async (fake, client) => {
    await assert.rejects(client.agentViewSet({ label: 'gsd', filter: { op: 'exists', field: { token: 'gsd_phase' } } }), (e: unknown) => {
      return e instanceof HerdrError && e.code === 'plugin_not_found';
    });
    fake.addPlugin({ plugin_id: 'herdr-gsd-core', enabled: false });
    await assert.rejects(client.agentViewSet({ label: 'gsd' }), (e: unknown) => e instanceof HerdrError && e.code === 'plugin_not_found');
    fake.plugins[0]!.enabled = true;
    const view = await client.agentViewSet({ label: 'gsd', filter: { op: 'exists', field: { token: 'gsd_phase' } } });
    assert.deepEqual(view, { type: 'agent_view', active: true, label: 'gsd', source: 'plugin:herdr-gsd-core' });
    assert.deepEqual(await client.agentViewClear(), { type: 'agent_view', active: false });
  });
});

test('notification.show reasons and empty title', async () => {
  await withFake(async (fake, client) => {
    assert.deepEqual(await client.notificationShow({ title: 'GSD', body: 'hi' }), { type: 'notification_show', shown: true, reason: 'shown' });
    fake.notificationMode = 'rate_limited';
    assert.deepEqual(await client.notificationShow({ title: 'GSD' }), { type: 'notification_show', shown: false, reason: 'rate_limited' });
    fake.notificationMode = 'busy';
    assert.equal((await client.notificationShow({ title: 'GSD' })).reason, 'busy');
    await assert.rejects(client.notificationShow({ title: '   ' }), (e: unknown) => e instanceof HerdrError && e.code === 'invalid_params');
  });
});

test('records every request in order with its params', async () => {
  await withFake(async (fake, client) => {
    fake.addWorkspace({ workspace_id: 'w1' });
    await client.ping();
    await client.reportWorkspaceMetadata({ workspace_id: 'w1', tokens: { gsd_phase: 'a' }, seq: 10 });
    await client.reportWorkspaceMetadata({ workspace_id: 'w1', tokens: { gsd_phase: 'b' }, seq: 11 });
    assert.deepEqual(
      fake.calls.map((c) => c.method),
      ['ping', 'workspace.report_metadata', 'workspace.report_metadata'],
    );
    assert.deepEqual(
      fake.calls.map((c) => c.order),
      [1, 2, 3],
    );
    const seqs = fake.callsFor('workspace.report_metadata').map((c) => (c.params as { seq: number }).seq);
    assert.deepEqual(seqs, [10, 11]);
    assert.equal((fake.calls[1]!.params as { source: string }).source, 'plugin:herdr-gsd-core');
  });
});

test('injected state: setAgentStatus, closePane and emit reach the right subscribers', async () => {
  await withFake(async (fake, client) => {
    fake.addWorkspace({ workspace_id: 'w1', focused: true });
    fake.addPane({ workspace_id: 'w1', pane_id: 'w1:p1', agent: 'claude', agent_status: 'working' });
    fake.addPane({ workspace_id: 'w1', pane_id: 'w1:p2', agent: 'claude', agent_status: 'working' });

    const seen: string[] = [];
    const sub = await client.subscribe(
      [{ type: 'pane.updated' }, { type: 'pane.closed' }, { type: 'pane.agent_status_changed', pane_id: 'w1:p1' }],
      { onEvent: (e) => seen.push(`${e.event}:${(e.data as { pane_id?: string; pane?: { pane_id: string } }).pane_id ?? (e.data as { pane?: { pane_id: string } }).pane?.pane_id}`) },
    );

    fake.setAgentStatus('w1:p1', 'blocked');
    fake.setAgentStatus('w1:p2', 'blocked'); // pane-scoped subscription must not fire for p2
    fake.closePane('w1:p2');
    fake.emit({ event: 'workspace_focused', data: { type: 'workspace_focused', workspace_id: 'w1' } }); // not subscribed
    await new Promise((r) => setTimeout(r, 40));

    assert.deepEqual(seen, ['pane_updated:w1:p1', 'pane.agent_status_changed:w1:p1', 'pane_updated:w1:p2', 'pane_closed:w1:p2']);
    assert.equal(fake.pane('w1:p2'), undefined);
    assert.equal(fake.workspace('w1')?.pane_count, 1);
    sub.close();
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(fake.subscriberCount, 0);
  });
});

test('reads mirror the capture shapes', async () => {
  await withFake(async (fake, client) => {
    fake.addWorkspace({ workspace_id: 'w3', number: 3, label: 'gsd-core-herdr', focused: true, agent_status: 'blocked' });
    fake.addPane({
      workspace_id: 'w3',
      pane_id: 'w3:p1',
      terminal_id: 'term_65b901fb2382d3',
      focused: true,
      cwd: '/home/dev/gsd-core-herdr',
      foreground_cwd: '/home/dev/gsd-core-herdr',
      agent: 'claude',
      agent_status: 'blocked',
      agent_session: { source: 'herdr:claude', agent: 'claude', kind: 'id', value: 'uuid-1' },
    });
    fake.setProcessInfo('w3:p1', { shell_pid: 1, foreground_process_group_id: 2, foreground_processes: [{ pid: 2, name: 'claude', argv: ['claude'], cmdline: 'claude', cwd: '/home/dev' }] });

    const snap = await client.sessionSnapshot();
    assert.equal(snap.protocol, 22);
    assert.equal(snap.focused_workspace_id, 'w3');
    assert.equal(snap.panes[0]?.agent_session?.value, 'uuid-1');
    assert.equal(snap.agents[0]?.pane_id, 'w3:p1');
    assert.equal((await client.workspaceGet('w3')).label, 'gsd-core-herdr');
    assert.equal((await client.paneGet('w3:p1')).terminal_id, 'term_65b901fb2382d3');
    assert.equal((await client.agentGet('w3:p1')).agent_status, 'blocked');
    assert.equal((await client.paneProcessInfo('w3:p1')).foreground_processes?.[0]?.name, 'claude');
    assert.deepEqual(await client.pluginList(), []);
    await assert.rejects(client.agentGet('claude'), (e: unknown) => e instanceof HerdrError && e.code === 'agent_not_found');
    await assert.rejects(client.paneGet('w9:p9'), (e: unknown) => e instanceof HerdrError && e.code === 'pane_not_found');
  });
});

test('worktree methods are repo-scoped and removal is addressed by workspace id', async () => {
  await withFake(async (fake, client) => {
    const ws = fake.addWorkspace({ workspace_id: 'w2', label: 'repo' });
    fake.addWorktreeRepo({
      source: { repo_key: '/repo/.git', repo_name: 'repo', repo_root: '/repo', source_checkout_path: '/repo', source_workspace_id: ws.workspace_id },
      worktrees: [{ path: '/repo', branch: 'main', is_bare: false, is_detached: false, is_prunable: false, is_linked_worktree: false, open_workspace_id: 'w2', label: 'repo' }],
    });

    const list = await client.worktreeList('/repo');
    assert.equal(list.source.repo_name, 'repo');
    assert.equal(list.worktrees.length, 1);

    const created = await client.worktreeCreate({ cwd: '/repo', branch: 'feature', label: 'feature' });
    assert.equal(created.type, 'worktree_created');
    assert.equal(created.worktree.branch, 'feature');
    assert.equal(created.root_pane.workspace_id, created.workspace.workspace_id);
    assert.equal(created.workspace.worktree?.checkout_path, created.worktree.path);

    const removed = await client.worktreeRemove({ workspace_id: created.workspace.workspace_id, force: true });
    assert.equal(removed.forced, true);
    assert.equal(removed.path, created.worktree.path);
    assert.equal(fake.workspace(created.workspace.workspace_id), undefined);
  });
});

test('orchestration: pane.split, agent.start, agent.prompt against a blocked agent', async () => {
  await withFake(async (fake, client) => {
    fake.addWorkspace({ workspace_id: 'w1' });
    fake.addPane({ workspace_id: 'w1', pane_id: 'w1:p1', focused: true, cwd: '/repo' });

    const split = await client.paneSplit({ direction: 'down', target_pane_id: 'w1:p1' });
    assert.equal(split.workspace_id, 'w1');
    assert.notEqual(split.pane_id, 'w1:p1');

    const started = await client.agentStart({ name: 'worker', kind: 'claude', pane_id: split.pane_id });
    assert.equal(started.agent.agent, 'claude');
    assert.equal(started.agent.name, 'worker');
    // spike M4 H1: agent.start returns immediately with launch_pending; agent.wait settles it
    assert.equal(started.agent.launch_pending, true);
    assert.equal(started.agent.agent_status, 'unknown');
    assert.equal((await client.agentWait('worker', ['idle', 'done', 'blocked'], 5000)).agent.agent_status, 'idle');

    // target resolves by agent name as well as pane id
    assert.equal((await client.agentGet('worker')).pane_id, split.pane_id);
    assert.equal((await client.agentPrompt({ target: 'worker', text: 'go' })).type, 'agent_prompted');
    assert.equal((await client.agentGet('worker')).agent_status, 'working');
    // wait resolves on a later status change; timeout is an error code (spike M4 H2)
    await assert.rejects(client.agentWait('worker', ['done'], 30), (e: unknown) => e instanceof HerdrError && e.code === 'timeout');
    const settled = client.agentWait('worker', ['done'], 2000);
    fake.setAgentStatus(split.pane_id, 'done');
    assert.equal((await settled).agent.agent_status, 'done');

    fake.setAgentStatus(split.pane_id, 'blocked');
    await assert.rejects(client.agentPrompt({ target: 'worker', text: 'go' }), (e: unknown) => e instanceof HerdrError && e.code === 'agent_blocked');
    assert.deepEqual(await client.paneSendText('w1:p1', 'hi'), { type: 'ok' });
    assert.deepEqual(await client.paneClose(split.pane_id), { type: 'ok' });
    assert.equal(fake.pane(split.pane_id), undefined);
    assert.ok(fake.workspace('w1'), 'workspace stays open while another pane exists');
    // spike M4 H5: closing the last pane closes the workspace
    assert.deepEqual(await client.paneClose('w1:p1'), { type: 'ok' });
    assert.equal(fake.workspace('w1'), undefined);
  });
});

test('orchestration: startup dialog is blocked, dirty worktree needs force, worktree.remove closes the workspace', async () => {
  await withFake(async (fake, client) => {
    fake.addWorkspace({ workspace_id: 'w1' });
    fake.addPane({ workspace_id: 'w1', pane_id: 'w1:p1', focused: true, cwd: '/repo' });
    fake.addWorktreeRepo({ source: { repo_key: '/repo/.git', repo_name: 'repo', repo_root: '/repo', source_checkout_path: '/repo', source_workspace_id: 'w1' }, worktrees: [] });
    const wt = await client.worktreeCreate({ workspace_id: 'w1', branch: 'gsd/phase-03-auth' });
    fake.agentStartBehavior = 'blocked';
    await client.agentStart({ name: 'p3', kind: 'claude', pane_id: wt.root_pane.pane_id });
    assert.equal((await client.agentWait('p3', undefined, 2000)).agent.agent_status, 'blocked');
    await assert.rejects(client.agentPrompt({ target: 'p3', text: 'go' }), (e: unknown) => e instanceof HerdrError && e.code === 'agent_blocked');
    fake.dirtyWorktrees.add(wt.worktree.path);
    await assert.rejects(client.worktreeRemove({ workspace_id: wt.workspace.workspace_id }), (e: unknown) => e instanceof HerdrError && e.code === 'dirty_worktree_requires_force');
    const removed = await client.worktreeRemove({ workspace_id: wt.workspace.workspace_id, force: true });
    assert.equal(removed.forced, true);
    assert.equal(fake.workspace(wt.workspace.workspace_id), undefined);
    assert.equal(fake.pane(wt.root_pane.pane_id), undefined);
    await assert.rejects(client.agentGet('p3'), (e: unknown) => e instanceof HerdrError && e.code === 'agent_not_found');
  });
});

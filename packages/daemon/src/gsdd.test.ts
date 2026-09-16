import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { FakeHerdr } from '@herdr-gsd/fake-herdr';
import { appendEventSync } from '@herdr-gsd/core';
import { Daemon } from './gsdd';
import { daemonPaths } from './paths';
import { ControlClient } from './control';

const FIXTURE = path.resolve(__dirname, '..', '..', '..', 'test', 'fixtures', 'planning', '1.14', 'executing');

interface Rig {
  dir: string;
  project: string;
  fake: FakeHerdr;
  paths: ReturnType<typeof daemonPaths>;
  newDaemon: () => Daemon;
}

async function rig(): Promise<Rig> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsdd-'));
  const project = path.join(dir, 'proj');
  fs.cpSync(FIXTURE, project, { recursive: true });
  fs.mkdirSync(path.join(project, '.git'));
  const sock = path.join(dir, 'h.sock');
  const fake = new FakeHerdr({ socketPath: sock });
  await fake.listen();
  const stateDir = path.join(dir, 'state');
  const paths = daemonPaths(stateDir, sock);
  const env = {
    pluginId: 'herdr-gsd-core',
    pluginRoot: path.resolve(__dirname, '..', '..', '..'),
    configDir: path.join(dir, 'config'),
    stateDir,
    herdrSocket: sock,
    herdrBin: 'herdr',
  };
  const newDaemon = () => new Daemon({ env, paths, heartbeatMs: 60_000, spoolPollMs: 50, watcherOptions: { debounceMs: 50 }, notifierOptions: { coalesceMs: 30, retryMs: 30 }, disableTools: true });
  return { dir, project, fake, paths, newDaemon };
}

const waitFor = async <T>(fn: () => T | undefined | Promise<T | undefined>, ms = 5000): Promise<T> => {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v !== undefined && v !== false) return v as T;
    if (Date.now() - t0 > ms) throw new Error('timeout waiting');
    await new Promise((r) => setTimeout(r, 25));
  }
};

test('M1: bind workspace by pane cwd, report tokens, react to STATE changes, notify once, restart keeps seq increasing', async () => {
  const r = await rig();
  const ws = r.fake.addWorkspace({ workspace_id: 'w1', focused: true });
  const pane = r.fake.addPane({ workspace_id: ws.workspace_id, cwd: path.join(r.project, 'src'), agent: 'claude', agent_status: 'working' });
  fs.mkdirSync(path.join(r.project, 'src'), { recursive: true });
  const d = r.newDaemon();
  await d.start();
  try {
    assert.equal(d.herdrConnected, true);
    assert.deepEqual(d.missingMethods.filter((m) => ['ping', 'session.snapshot', 'workspace.report_metadata'].includes(m)), []);
    const tokens = await waitFor(() => r.fake.tokensOf('w1'));
    assert.ok(tokens.gsd_phase, JSON.stringify(tokens));
    assert.ok(tokens.gsd_status, JSON.stringify(tokens));
    assert.ok(tokens.gsd_next, JSON.stringify(tokens));
    assert.equal(tokens.gsd_err, undefined);
    const b = d.bindings.get('w1');
    assert.equal(b?.root, r.project);
    assert.equal(b?.role, 'driver');
    assert.equal(b?.driverPaneId, pane.pane_id);
    // pane title set only because the pane had no title
    const paneMeta = r.fake.callsFor('pane.report_metadata');
    assert.ok(paneMeta.length >= 1);
    assert.ok((paneMeta[0]!.params as { title?: string }).title?.startsWith('GSD ·'));

    // seq monotonic per workspace
    const wsCalls = r.fake.callsFor('workspace.report_metadata').map((c) => c.params as { seq: number; source: string });
    assert.ok(wsCalls.every((c) => c.source === 'plugin:herdr-gsd-core'));
    for (let i = 1; i < wsCalls.length; i++) assert.ok(wsCalls[i]!.seq > wsCalls[i - 1]!.seq);

    // control socket
    const c = new ControlClient(r.paths.controlSocket);
    await c.connect();
    const ping = await c.request<{ pong: boolean }>('ping');
    assert.equal(ping.pong, true);
    const list = await c.request<Array<{ root: string; status: string }>>('projects.list');
    assert.equal(list[0]?.root, r.project);
    const detail = await c.request<{ snapshot: { health: string }; driverPaneId: string }>('project.get', { root: r.project });
    assert.equal(detail.snapshot.health, 'ok');
    assert.equal(detail.driverPaneId, pane.pane_id);
    const events: unknown[] = [];
    c.on('event', (name, params) => events.push([name, params]));
    await c.subscribe(['snapshot.changed', 'activity', 'agent.status']);

    // filesystem change: flip the phase forward by adding the missing summary → phase boundary → exactly one notification
    const phaseDir = fs.readdirSync(path.join(r.project, '.planning', 'phases')).find((f) => f.startsWith('02'))!;
    const plans = fs.readdirSync(path.join(r.project, '.planning', 'phases', phaseDir)).filter((f) => f.endsWith('-PLAN.md'));
    const summaries = new Set(fs.readdirSync(path.join(r.project, '.planning', 'phases', phaseDir)).filter((f) => f.endsWith('-SUMMARY.md')));
    const missing = plans.map((p) => p.replace('-PLAN.md', '-SUMMARY.md')).filter((s) => !summaries.has(s));
    assert.ok(missing.length >= 1, 'fixture should have an unfinished plan');
    const notifBefore = r.fake.callsFor('notification.show').length;
    for (const m of missing) fs.writeFileSync(path.join(r.project, '.planning', 'phases', phaseDir, m), '# done\n');
    const changed = await waitFor(() => events.find((e) => (e as [string, { keys: string[] }])[0] === 'snapshot.changed' && (e as [string, { keys: string[] }])[1].keys.length > 0) as [string, { keys: string[]; snapshot: { phases: Array<{ number: string; status: string }> } }] | undefined);
    assert.ok(changed[1].keys.includes('status') || changed[1].keys.includes('step'), JSON.stringify(changed[1].keys));
    const phase02 = changed[1].snapshot.phases.find((p) => p.number.startsWith('02'));
    assert.notEqual(phase02?.status, 'executing');
    const after = await waitFor(() => {
      const t = r.fake.tokensOf('w1');
      return t && (t.gsd_step !== tokens.gsd_step || t.gsd_status !== tokens.gsd_status || t.gsd_next !== tokens.gsd_next) ? t : undefined;
    });
    await waitFor(() => (r.fake.callsFor('notification.show').length > notifBefore ? true : undefined));
    await new Promise((res) => setTimeout(res, 150));
    assert.equal(r.fake.callsFor('notification.show').length, notifBefore + 1, 'exactly one coalesced notification');
    const shown = r.fake.callsFor('notification.show').at(-1)!.params as { title: string; body: string };
    assert.match(shown.title, /^GSD · .*phase/);
    assert.match(shown.body, /^next: /);

    // activity spool → pane tokens
    const spoolFile = path.join(r.paths.spoolDir, 'abc123.jsonl');
    appendEventSync(spoolFile, { v: 1, ts: Date.now(), harness: 'claude-code', cwd: r.project, kind: 'subagent.start', agent: 'gsd-executor', paneId: pane.pane_id, sessionId: 's-1' });
    appendEventSync(spoolFile, { v: 1, ts: Date.now(), harness: 'claude-code', cwd: r.project, kind: 'tool.pre', tool: 'Bash', detail: 'git diff', paneId: pane.pane_id, sessionId: 's-1' });
    const pt = await waitFor(() => {
      const t = r.fake.tokensOf(pane.pane_id);
      return t?.gsd_tool ? t : undefined;
    });
    assert.equal(pt.gsd_agent, 'executor');
    assert.equal(pt.gsd_workers, '1 active');
    assert.equal(pt.gsd_tool, 'Bash git diff');
    assert.ok(events.some((e) => (e as [string])[0] === 'activity'));
    const toolReport = r.fake.callsFor('pane.report_metadata').find((c) => (c.params as { tokens?: { gsd_tool?: string } }).tokens?.gsd_tool);
    assert.equal((toolReport!.params as { ttl_ms: number }).ttl_ms, 15_000);

    // blocked transition on the driver pane → blocked notification (snapshot not complete)
    const n2 = r.fake.callsFor('notification.show').length;
    r.fake.setAgentStatus(pane.pane_id, 'blocked');
    await waitFor(() => (r.fake.callsFor('notification.show').length > n2 ? true : undefined));
    assert.match((r.fake.callsFor('notification.show').at(-1)!.params as { title: string }).title, /waiting for you/);
    assert.ok(events.some((e) => (e as [string, { status: string }])[0] === 'agent.status' && (e as [string, { status: string }])[1].status === 'blocked'));

    // prompt.send refuses while blocked, needs confirm
    const refused = await c.request<{ sent: boolean; reason?: string }>('prompt.send', { root: r.project, text: '/gsd-x', confirm: true });
    assert.deepEqual([refused.sent, refused.reason], [false, 'agent_blocked']);
    const unconfirmed = await c.request<{ sent: boolean; reason?: string }>('prompt.send', { root: r.project, text: '/gsd-x' });
    assert.equal(unconfirmed.reason, 'confirm_required');
    r.fake.setAgentStatus(pane.pane_id, 'idle');
    await new Promise((res) => setTimeout(res, 50));
    const sent = await c.request<{ sent: boolean; paneId?: string }>('prompt.send', { root: r.project, text: '/gsd-x', confirm: true });
    assert.equal(sent.sent, true);
    assert.equal((r.fake.callsFor('agent.prompt').at(-1)!.params as { text: string }).text, '/gsd-x');

    // rate limiting: retry once then drop
    r.fake.notificationMode = 'rate_limited';
    const n3 = r.fake.callsFor('notification.show').length;
    const nt = await c.request<{ shown: boolean; reason?: string }>('notify.test', { root: r.project });
    assert.equal(nt.shown, false);
    assert.equal(nt.reason, 'rate_limited');
    r.fake.notificationMode = 'shown';
    assert.equal(r.fake.callsFor('notification.show').length, n3 + 1);
    c.close();

    const status = d.status();
    assert.equal(status.projects, 1);
    assert.equal(status.watchers[0]?.mode, 'watch');
    const seqBefore = Math.max(...r.fake.callsFor('workspace.report_metadata').map((x) => (x.params as { seq: number }).seq));

    // restart: tokens re-reported with strictly greater seq and identical values
    await d.stop('test', false);
    const d2 = r.newDaemon();
    await d2.start();
    try {
      const wsCalls2 = r.fake.callsFor('workspace.report_metadata').map((x) => x.params as { seq: number });
      assert.ok(wsCalls2.at(-1)!.seq > seqBefore);
      const again = r.fake.tokensOf('w1')!;
      assert.equal(again.gsd_phase, after.gsd_phase);
      assert.equal(again.gsd_status, after.gsd_status);
      assert.equal(again.gsd_next, after.gsd_next);
    } finally {
      await d2.stop('test', true);
    }
    // stop with clearTokens clears our keys
    const cleared = r.fake.tokensOf('w1');
    assert.ok(!cleared || !cleared.gsd_phase);
  } finally {
    await d.stop('test', false).catch(() => undefined);
    await r.fake.close();
  }
});

test('workspace without .planning gets no tokens; manual binding via control; unbinding clears', async () => {
  const r = await rig();
  const empty = path.join(r.dir, 'plain');
  fs.mkdirSync(path.join(empty, '.git'), { recursive: true });
  r.fake.addWorkspace({ workspace_id: 'w2' });
  r.fake.addPane({ workspace_id: 'w2', cwd: empty });
  const d = r.newDaemon();
  await d.start();
  try {
    assert.equal(d.projects.size, 0);
    assert.equal(r.fake.tokensOf('w2'), undefined);
    const c = new ControlClient(r.paths.controlSocket);
    await c.connect();
    await assert.rejects(c.request('project.get', { root: '/nope' }), /not_found|no project/);
    await assert.rejects(c.request('bindings.set', { workspaceId: 'w2', root: '/nope' }));
    const b = await c.request<{ root: string }>('bindings.set', { workspaceId: 'w2', root: r.project, role: 'observer' });
    assert.equal(b.root, r.project);
    const t = await waitFor(() => r.fake.tokensOf('w2'));
    assert.ok(t.gsd_phase);
    const rescan = await c.request<{ rescanned: string[] }>('project.rescan', { root: r.project });
    assert.deepEqual(rescan.rescanned, [r.project]);
    await c.request('bindings.set', { workspaceId: 'w2', root: null });
    assert.equal(d.projects.size, 0);
    const recent = c.request('activity.recent', { root: '/nope' });
    await assert.rejects(recent);
    c.close();
  } finally {
    await d.stop('test', false);
    await r.fake.close();
  }
});

test('herdr socket disappearing makes the daemon exit path fire (tick)', async () => {
  const r = await rig();
  r.fake.addWorkspace({ workspace_id: 'w1' });
  r.fake.addPane({ workspace_id: 'w1', cwd: r.project });
  const d = r.newDaemon();
  await d.start();
  const realExit = process.exit;
  let exited: number | undefined;
  (process as { exit: unknown }).exit = ((code?: number) => {
    exited = code ?? 0;
    throw new Error('exit called');
  }) as never;
  try {
    await r.fake.close();
    await d.tick().catch(() => undefined);
    assert.equal(exited, undefined, 'first failure only counts');
    await d.tick().catch(() => undefined);
    assert.equal(exited, 0);
  } finally {
    process.exit = realExit;
    await d.stop('test', false).catch(() => undefined);
  }
});

test('lock: STATE.md.lock held → health locked, previous snapshot kept, gsd_err set then cleared', async () => {
  const r = await rig();
  r.fake.addWorkspace({ workspace_id: 'w1' });
  r.fake.addPane({ workspace_id: 'w1', cwd: r.project });
  const d = r.newDaemon();
  await d.start();
  try {
    const before = await waitFor(() => r.fake.tokensOf('w1'));
    const lock = path.join(r.project, '.planning', 'STATE.md.lock');
    fs.writeFileSync(lock, String(process.pid));
    fs.appendFileSync(path.join(r.project, '.planning', 'STATE.md'), '\n');
    const locked = await waitFor(
      () => {
        const t = r.fake.tokensOf('w1');
        return t?.gsd_err ? t : undefined;
      },
      15_000,
    );
    assert.equal(locked.gsd_err, 'STATE.md locked');
    assert.equal(locked.gsd_phase, before.gsd_phase, 'previous snapshot retained');
    fs.rmSync(lock);
    fs.appendFileSync(path.join(r.project, '.planning', 'STATE.md'), '\n');
    await waitFor(() => {
      const t = r.fake.tokensOf('w1');
      return t && !t.gsd_err ? t : undefined;
    }, 15_000);
  } finally {
    await d.stop('test', false);
    await r.fake.close();
  }
});

test('a project root spelled through a symlink resolves to the bound (real) path — macOS /var → /private/var', async () => {
  const r = await rig();
  r.fake.addWorkspace({ workspace_id: 'w1', focused: true });
  r.fake.addPane({ workspace_id: 'w1', cwd: r.project, agent: 'claude', agent_status: 'idle' });
  const link = path.join(r.dir, 'link-to-proj');
  fs.symlinkSync(r.project, link);
  const d = r.newDaemon();
  await d.start();
  try {
    await waitFor(() => r.fake.tokensOf('w1'));
    const c = new ControlClient(r.paths.controlSocket);
    await c.connect();
    const detail = await c.request<{ root: string }>('project.get', { root: link });
    assert.equal(detail.root, r.project);
    const recent = await c.request<unknown[]>('activity.recent', { root: link });
    assert.ok(Array.isArray(recent));
    const plan = await c.request<{ reasons: string[] }>('orchestrate.plan', { root: link, unit: 'phase' });
    assert.ok(!plan.reasons.some((x) => x.includes('no bound project')), plan.reasons.join('; '));
    c.close();
  } finally {
    await d.stop('test', false);
    await r.fake.close();
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { FakeHerdr } from '@herdr-gsd/fake-herdr';
import { Daemon } from '../gsdd';
import { daemonPaths } from '../paths';
import { ControlClient } from '../control';
import type { RunRecord } from './runs';
import type { PlanResult } from './plan';
import type { GitExec } from './git';

const FIXTURE = path.resolve(__dirname, '..', '..', '..', '..', 'test', 'fixtures', 'planning', '1.14', 'executing');

interface Rig {
  dir: string;
  project: string;
  fake: FakeHerdr;
  paths: ReturnType<typeof daemonPaths>;
  newDaemon: (over?: { git?: GitExec }) => Daemon;
  configFile: string;
}

const fakeGit =
  (over: { tracked?: boolean; branch?: string; repo?: boolean } = {}): GitExec =>
  async (args, cwd) => {
    if (over.repo === false) return { code: 128, stdout: '' };
    if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return { code: 0, stdout: cwd + '\n' };
    if (args[0] === 'rev-parse') return { code: 0, stdout: (over.branch ?? 'main') + '\n' };
    if (args[0] === 'ls-files') return { code: over.tracked === false ? 1 : 0, stdout: '' };
    return { code: 1, stdout: '' };
  };

async function rig(configToml: string): Promise<Rig> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsdd-orch-'));
  const project = path.join(dir, 'proj');
  fs.cpSync(FIXTURE, project, { recursive: true });
  fs.mkdirSync(path.join(project, '.git'));
  const sock = path.join(dir, 'h.sock');
  const fake = new FakeHerdr({ socketPath: sock });
  fake.statusViaPaneUpdated = false; // real Herdr behaviour (spike M4 H10)
  await fake.listen();
  const stateDir = path.join(dir, 'state');
  const paths = daemonPaths(stateDir, sock);
  const configDir = path.join(dir, 'config');
  fs.mkdirSync(configDir, { recursive: true });
  const configFile = path.join(configDir, 'config.toml');
  fs.writeFileSync(configFile, configToml);
  const env = { pluginId: 'herdr-gsd-core', pluginRoot: path.resolve(__dirname, '..', '..', '..', '..'), configDir, stateDir, herdrSocket: sock, herdrBin: 'herdr' };
  const newDaemon = (over: { git?: GitExec } = {}) =>
    new Daemon({ env, paths, heartbeatMs: 60_000, spoolPollMs: 1000, watcherOptions: { debounceMs: 30 }, notifierOptions: { coalesceMs: 30, retryMs: 30 }, disableTools: true, orchestratorOptions: { stallMs: 150, git: over.git ?? fakeGit() } });
  return { dir, project, fake, paths, newDaemon, configFile };
}

const ENABLED = `[orchestration]\nenabled = true\nstart_timeout_ms = 4000\n`;

const waitFor = async <T>(fn: () => T | undefined | Promise<T | undefined>, ms = 5000, describe?: () => unknown): Promise<T> => {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v !== undefined && v !== false) return v as T;
    if (Date.now() - t0 > ms) throw new Error(`timeout waiting${describe ? `: ${JSON.stringify(describe())}` : ''}`);
    await new Promise((r) => setTimeout(r, 20));
  }
};

function driverRig(r: Rig, agentStatus: 'idle' | 'working' = 'idle') {
  r.fake.addWorkspace({ workspace_id: 'w1', focused: true });
  const pane = r.fake.addPane({ workspace_id: 'w1', cwd: r.project, agent: 'claude', agent_status: agentStatus, focused: true });
  r.fake.addWorktreeRepo({ source: { repo_key: `${r.project}/.git`, repo_name: 'proj', repo_root: r.project, source_checkout_path: r.project, source_workspace_id: 'w1' }, worktrees: [] });
  return pane;
}

test('M4: phase run — split pane, agent.start (launch_pending), wait idle, prompt, working → idle = done; run record persisted; stop closes the pane', async () => {
  const r = await rig(ENABLED);
  const driver = driverRig(r);
  const d = r.newDaemon();
  await d.start();
  const c = new ControlClient(r.paths.controlSocket);
  await c.connect();
  const events: RunRecord[] = [];
  c.on('event:run.changed', (p: { run: RunRecord }) => events.push(p.run));
  await c.subscribe(['run.changed']);
  try {
    await waitFor(() => r.fake.tokensOf('w1'));
    const plan = await c.request<PlanResult>('orchestrate.plan', { root: r.project, unit: 'phase' });
    assert.equal(plan.ok, true, plan.reasons.join('; '));
    assert.match(plan.command!, /^\/gsd-/);
    await assert.rejects(c.request('orchestrate.start', { root: r.project, unit: 'phase' }), (e: Error & { code?: string }) => e.code === 'confirm_required');

    const started = await c.request<{ run?: RunRecord; plan: PlanResult }>('orchestrate.start', { root: r.project, unit: 'phase', confirm: true });
    assert.ok(started.run, JSON.stringify(started.plan));
    const run = started.run!;
    assert.equal(run.unit, 'phase');
    assert.equal(run.createdPane, true);
    assert.notEqual(run.target.paneId, driver.pane_id);
    assert.equal(run.status, 'running', run.reason);
    assert.equal(run.prompts.length, 1);
    assert.equal(run.prompts[0]!.text, plan.command);
    // call order: pane.split → agent.start → agent.wait → agent.prompt
    const order = r.fake.calls.filter((x) => ['pane.split', 'agent.start', 'agent.wait', 'agent.prompt'].includes(x.method)).map((x) => x.method);
    assert.deepEqual(order, ['pane.split', 'agent.start', 'agent.wait', 'agent.prompt']);
    const startParams = r.fake.callsFor('agent.start')[0]!.params as { kind: string; pane_id: string; name: string };
    assert.equal(startParams.kind, 'claude');
    assert.equal(startParams.pane_id, run.target.paneId);
    assert.match(startParams.name, /^gsd-phase-/);
    // the prompt made the fake agent `working`; settle it
    await waitFor(() => (d.runs.get(run.id)?.sawWorking ? true : undefined));
    r.fake.setAgentStatus(run.target.paneId, 'done');
    const done = await waitFor(() => (d.runs.get(run.id)?.status === 'done' ? d.runs.get(run.id) : undefined));
    assert.match(done!.reason!, /idle after/);
    assert.ok(events.some((e) => e.id === run.id && e.status === 'done'));
    assert.ok(fs.existsSync(path.join(r.paths.orchestrationDir, `${run.id}.json`)));
    const notif = r.fake.callsFor('notification.show').map((x) => (x.params as { title: string }).title);
    assert.ok(notif.some((t) => t.startsWith('GSD run done')), notif.join(' | '));
    // finished runs cannot be stopped; a second run is allowed once the first is done
    const stopFinished = await c.request<Array<{ stopped: boolean }>>('orchestrate.stop', { runId: run.id }).catch((e: Error) => e);
    assert.ok(stopFinished instanceof Error || stopFinished[0]!.stopped === false);
    const list = await c.request<RunRecord[]>('orchestrate.list', { root: r.project });
    assert.equal(list.length, 1);

    // second run, stopped mid-flight → esc esc, pane.close, cancelled
    const second = await c.request<{ run?: RunRecord }>('orchestrate.start', { root: r.project, unit: 'phase', command: 'verify-work 2', confirm: true });
    assert.equal(second.run!.status, 'running');
    const stopped = await c.request<Array<{ stopped: boolean; run: RunRecord }>>('orchestrate.stop', { root: r.project });
    assert.equal(stopped[0]!.stopped, true);
    assert.equal(stopped[0]!.run.status, 'cancelled');
    assert.ok(r.fake.callsFor('agent.send_keys').length >= 1);
    assert.equal(r.fake.pane(second.run!.target.paneId), undefined, 'pane closed');
    assert.ok(r.fake.workspace('w1'), 'driver workspace survives');
  } finally {
    c.close();
    await d.stop('test', false);
    await r.fake.close();
  }
});

test('M4: guards — disabled config refuses; a working driver refuses; one active run per repository', async () => {
  const r = await rig('');
  driverRig(r, 'working');
  const d = r.newDaemon();
  await d.start();
  const c = new ControlClient(r.paths.controlSocket);
  await c.connect();
  try {
    await waitFor(() => r.fake.tokensOf('w1'));
    const plan = await c.request<PlanResult>('orchestrate.plan', { root: r.project, unit: 'phase' });
    assert.equal(plan.ok, false);
    assert.ok(plan.reasons.some((x) => x.includes('disabled')));
    assert.ok(plan.reasons.some((x) => x.includes('working in pane')));
    const started = await c.request<{ run?: RunRecord; plan: PlanResult }>('orchestrate.start', { root: r.project, unit: 'phase', confirm: true });
    assert.equal(started.run, undefined);
    assert.equal(r.fake.callsFor('pane.split').length, 0);
    assert.equal(r.fake.callsFor('agent.start').length, 0);
  } finally {
    c.close();
    await d.stop('test', false);
    await r.fake.close();
  }
});

test('M4: startup dialog (blocked) → waiting/startup_input with a notification; idle later → prompt goes out; stalled prompt reads the screen', async () => {
  const r = await rig(ENABLED);
  driverRig(r);
  r.fake.agentStartBehavior = 'blocked';
  r.fake.promptMakesWorking = false;
  const d = r.newDaemon();
  await d.start();
  const c = new ControlClient(r.paths.controlSocket);
  await c.connect();
  try {
    await waitFor(() => r.fake.tokensOf('w1'));
    const { run } = await c.request<{ run?: RunRecord }>('orchestrate.start', { root: r.project, unit: 'phase', confirm: true });
    assert.equal(run!.status, 'waiting');
    assert.equal(run!.waitingFor, 'startup_input');
    assert.equal(run!.prompts.length, 0);
    assert.ok(r.fake.callsFor('notification.show').some((x) => (x.params as { title: string }).title.includes('input needed')));
    // user answers the trust prompt → agent idle → the command is sent
    r.fake.screens.set(run!.target.paneId, 'Unknown command: /gsd-execute-phase\n❯ ');
    r.fake.setAgentStatus(run!.target.paneId, 'idle');
    const running = await waitFor(() => (d.runs.get(run!.id)?.prompts.length === 1 ? d.runs.get(run!.id) : undefined));
    assert.equal(running!.status, 'running');
    // no `working` ever follows → stalled after stallMs, screen tail captured, not retried
    await d.tick();
    const stalled = await waitFor(async () => {
      await d.tick();
      const x = d.runs.get(run!.id);
      return x?.waitingFor === 'stalled' ? x : undefined;
    });
    assert.match(stalled!.reason!, /Unknown command/);
    assert.equal(r.fake.callsFor('agent.prompt').length, 1, 'never blind-retried');
  } finally {
    c.close();
    await d.stop('test', false);
    await r.fake.close();
  }
});

test('M4: isolated run — worktree.create on the GSD-style branch, agent in the worktree pane, agent blocked → waiting + notification, stop keeps a dirty worktree unless discard', async () => {
  const r = await rig(ENABLED);
  driverRig(r, 'working'); // a working human session does not block an isolated run
  const d = r.newDaemon();
  await d.start();
  const c = new ControlClient(r.paths.controlSocket);
  await c.connect();
  try {
    await waitFor(() => r.fake.tokensOf('w1'));
    const plan = await c.request<PlanResult>('orchestrate.plan', { root: r.project, unit: 'phase-isolated' });
    assert.equal(plan.ok, true, plan.reasons.join('; '));
    assert.match(plan.branch!, /^gsd\/phase-\d\d-/);
    const { run } = await c.request<{ run?: RunRecord; plan: PlanResult }>('orchestrate.start', { root: r.project, unit: 'phase-isolated', confirm: true });
    assert.ok(run);
    assert.equal(run!.status, 'running');
    assert.ok(run!.target.worktree);
    assert.equal(run!.target.worktree!.branch, plan.branch);
    assert.notEqual(run!.target.workspaceId, 'w1');
    const wtCreate = r.fake.callsFor('worktree.create')[0]!.params as { cwd: string; branch: string; focus: boolean };
    assert.equal(wtCreate.cwd, r.project);
    assert.equal(wtCreate.branch, plan.branch);
    assert.equal(wtCreate.focus, false);
    assert.equal(r.fake.callsFor('pane.split').length, 0);
    // the agent asks a question → waiting
    await waitFor(() => (d.runs.get(run!.id)?.sawWorking ? true : undefined));
    r.fake.setAgentStatus(run!.target.paneId, 'blocked');
    const waiting = await waitFor(() => (d.runs.get(run!.id)?.waitingFor === 'agent_blocked' ? d.runs.get(run!.id) : undefined));
    assert.equal(waiting!.status, 'waiting');
    assert.ok(r.fake.callsFor('notification.show').some((x) => (x.params as { title: string }).title.includes('waiting for you')));
    // dirty worktree: stop keeps it and says so
    r.fake.dirtyWorktrees.add(run!.target.worktree!.path);
    const kept = await c.request<Array<{ stopped: boolean; run: RunRecord }>>('orchestrate.stop', { runId: run!.id });
    assert.equal(kept[0]!.stopped, true);
    assert.equal(kept[0]!.run.status, 'cancelled');
    assert.match(kept[0]!.run.reason!, /worktree kept/);
    assert.ok(r.fake.workspace(run!.target.workspaceId), 'worktree workspace left open for inspection');
    // the run is finished, so a new isolated run is allowed; this one is removed with discard
    const again = await c.request<{ run?: RunRecord; plan: PlanResult }>('orchestrate.start', { root: r.project, unit: 'phase-isolated', confirm: true });
    assert.ok(again.run, again.plan.reasons.join('; '));
    const removed = await c.request<Array<{ stopped: boolean; run: RunRecord }>>('orchestrate.stop', { runId: again.run!.id, discard: true });
    assert.match(removed[0]!.run.reason!, /removed/);
    assert.equal(r.fake.workspace(again.run!.target.workspaceId), undefined);
    const removeCalls = r.fake.callsFor('worktree.remove').map((x) => x.params as { force?: boolean });
    assert.deepEqual(removeCalls.map((x) => x.force === true), [false, false, true].slice(-removeCalls.length));
  } finally {
    c.close();
    await d.stop('test', false);
    await r.fake.close();
  }
});

test('M4: daemon restart re-attaches a running run; pane gone → failed (phase) or resumed (autonomous with resume_on_exit)', async () => {
  const r = await rig(ENABLED + `[orchestration.autonomous]\nresume_on_exit = true\nmax_resumes = 1\n`);
  driverRig(r);
  let d = r.newDaemon();
  await d.start();
  const c = new ControlClient(r.paths.controlSocket);
  await c.connect();
  let runId: string;
  try {
    await waitFor(() => r.fake.tokensOf('w1'));
    const { run } = await c.request<{ run?: RunRecord; plan: PlanResult }>('orchestrate.start', { root: r.project, unit: 'autonomous', confirm: true });
    assert.equal(run!.command, '/gsd-autonomous');
    runId = run!.id;
    await waitFor(() => (d.runs.get(runId)?.sawWorking ? true : undefined));
  } finally {
    c.close();
    await d.stop('test', false);
  }
  // restart: the pane still exists and is working → re-attached as running
  const subsBefore = r.fake.callsFor('events.subscribe').length;
  d = r.newDaemon();
  await d.start();
  try {
    const run = d.runs.get(runId!)!;
    assert.equal(run.status, 'running');
    assert.equal(run.lastAgentStatus, 'working');
    // both streams (lifecycle + pane status) open after start() resolves and Herdr never replays: wait for them
    await waitFor(() => (r.fake.callsFor('events.subscribe').length >= subsBefore + 2 ? true : undefined));
    // the session dies (pane closed) → resumed once: new pane, new prompt with GSD's --from hint
    const oldPane = run.target.paneId;
    r.fake.closePane(oldPane);
    r.fake.emit({ event: 'pane_closed', data: { type: 'pane_closed', pane_id: oldPane, workspace_id: run.target.workspaceId } });
    const resumed = await waitFor(
      () => {
        const x = d.runs.get(runId!);
        return x && x.resumes === 1 && x.status === 'running' ? x : undefined;
      },
      5000,
      () => ({ run: d.runs.get(runId!), calls: r.fake.calls.slice(-6).map((c) => c.method) }),
    );
    assert.notEqual(resumed!.target.paneId, oldPane);
    assert.match(resumed!.command, /^\/gsd-autonomous --from \d/);
    assert.equal(resumed!.prompts.length, 2);
    // dies again → budget exhausted → failed with a reason
    const p2 = resumed!.target.paneId;
    r.fake.closePane(p2);
    r.fake.emit({ event: 'pane_closed', data: { type: 'pane_closed', pane_id: p2, workspace_id: resumed!.target.workspaceId } });
    const failed = await waitFor(() => (d.runs.get(runId!)?.status === 'failed' ? d.runs.get(runId!) : undefined));
    assert.match(failed!.reason!, /remaining/);
  } finally {
    await d.stop('test', false);
    await r.fake.close();
  }
});

test('M4: autonomous run settles — Needs Human in STATE.md → waiting/human_stop; cleared → running again; idle with phases remaining → done with GSD resume hint', async () => {
  const r = await rig(ENABLED);
  driverRig(r);
  const d = r.newDaemon();
  await d.start();
  const c = new ControlClient(r.paths.controlSocket);
  await c.connect();
  try {
    await waitFor(() => r.fake.tokensOf('w1'));
    const { run } = await c.request<{ run?: RunRecord; plan: PlanResult }>('orchestrate.start', { root: r.project, unit: 'autonomous', confirm: true });
    await waitFor(() => (d.runs.get(run!.id)?.sawWorking ? true : undefined));
    const state = path.join(r.project, '.planning', 'STATE.md');
    const original = fs.readFileSync(state, 'utf8');
    fs.writeFileSync(state, original + '\n## Needs Human\n| 02 | needs_human | resolve blocker, then /gsd-autonomous --from 2 |\n');
    await waitFor(() => (d.projects.get(r.project)?.snapshot?.humanStops?.length ? true : undefined), 5000, () => d.projects.get(r.project)?.snapshot?.humanStops);
    r.fake.setAgentStatus(run!.target.paneId, 'idle');
    const waiting = await waitFor(() => (d.runs.get(run!.id)?.waitingFor === 'human_stop' ? d.runs.get(run!.id) : undefined));
    assert.match(waiting!.reason!, /needs_human/);
    // a new autonomous run is refused while the marker is there
    const plan = await c.request<PlanResult>('orchestrate.plan', { root: r.project, unit: 'autonomous' });
    assert.ok(plan.reasons.some((x) => x.includes('Needs Human')));
    fs.writeFileSync(state, original);
    const back = await waitFor(() => (d.runs.get(run!.id)?.status === 'running' ? d.runs.get(run!.id) : undefined));
    assert.equal(back!.waitingFor, undefined);
    // the harness works again then settles with phases remaining → done + resume hint
    r.fake.setAgentStatus(run!.target.paneId, 'working');
    r.fake.setAgentStatus(run!.target.paneId, 'done');
    const done = await waitFor(() => (d.runs.get(run!.id)?.status === 'done' ? d.runs.get(run!.id) : undefined));
    assert.match(done!.reason!, /resume with \/gsd-autonomous --from \d/);
  } finally {
    c.close();
    await d.stop('test', false);
    await r.fake.close();
  }
});

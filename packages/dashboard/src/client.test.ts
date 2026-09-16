import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as os from 'node:os';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { ControlServer } from '@herdr-gsd/daemon';
import type { ProjectDetail, ProjectSummary } from '@herdr-gsd/daemon';
import { DashboardClient, resolveControlSocket } from './client';

async function sockPath(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gsd-dash-'));
  return path.join(dir, 'gsdd.sock');
}

async function waitFor(pred: () => boolean, ms = 2000): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (pred()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.fail('condition not met in time');
}

const ROOT = '/home/u/myproj';

function makeDetail(status: string): ProjectDetail {
  return {
    root: ROOT,
    snapshot: {
      root: ROOT,
      planningDir: `${ROOT}/.planning`,
      observedAt: Date.now(),
      health: 'ok',
      project: { name: 'myproj' },
      position: { phase: { number: '03', slug: 'auth', status: 'executing' }, plan: { id: '03-02', index: 2, total: 4 } },
      phases: [{ number: '03', slug: 'auth', status: 'executing', plans: 4, summaries: 1 }],
      blockers: [],
    },
    next: 'verify-work 3',
    status,
    recent: [],
    bindings: [],
    tokens: { workspace: {} },
  };
}

interface Fake {
  server: ControlServer;
  path: string;
  calls: string[];
  prompts: unknown[];
  status: string;
  promptResult: unknown;
  listen(): Promise<void>;
}

async function fakeDaemon(p: string): Promise<Fake> {
  const f: Fake = {
    server: undefined as unknown as ControlServer,
    path: p,
    calls: [],
    prompts: [],
    status: 'executing',
    promptResult: { sent: true, paneId: 'pane-1' },
    listen: async () => {
      /* replaced below */
    },
  };
  const build = () => {
    const srv = new ControlServer(p);
    srv.register('projects.list', () => {
      f.calls.push('projects.list');
      return [{ root: ROOT, name: 'myproj', health: 'ok', status: f.status, next: 'verify-work 3', workspaces: [] }] satisfies ProjectSummary[];
    });
    srv.register('project.get', (params) => {
      f.calls.push(`project.get:${(params as { root: string }).root}`);
      return makeDetail(f.status);
    });
    srv.register('prompt.send', (params) => {
      f.prompts.push(params);
      return f.promptResult;
    });
    srv.register('project.rescan', () => ({ rescanned: [ROOT] }));
    srv.register('notify.test', () => ({ shown: true }));
    return srv;
  };
  f.listen = async () => {
    f.server = build();
    await f.server.listen();
  };
  await f.listen();
  return f;
}

test('resolveControlSocket: --socket override wins, else plugin env', () => {
  const env = { HERDR_PLUGIN_STATE_DIR: '/tmp/state-x', HERDR_SOCKET_PATH: '/tmp/herdr.sock' } as NodeJS.ProcessEnv;
  const derived = resolveControlSocket(undefined, env);
  assert.ok(derived.startsWith('/tmp/state-x/'), derived);
  assert.ok(derived.endsWith('gsdd.sock'), derived);
  // same env is stable, a different herdr socket hashes elsewhere
  assert.equal(resolveControlSocket(undefined, env), derived);
  assert.notEqual(resolveControlSocket(undefined, { ...env, HERDR_SOCKET_PATH: '/tmp/other.sock' }), derived);
  assert.equal(resolveControlSocket('/tmp/explicit.sock', env), '/tmp/explicit.sock');
});

test('fetches projects, re-fetches on snapshot.changed, applies activity/agent events', async () => {
  const p = await sockPath();
  const fake = await fakeDaemon(p);
  const client = new DashboardClient({ socketPath: p, autoEnsure: false, backoffMinMs: 20, backoffMaxMs: 40 });
  let changes = 0;
  client.onChange(() => changes++);
  await client.start();

  assert.equal(client.connected, true);
  assert.equal(client.projects.length, 1);
  assert.equal(client.projects[0]!.snapshot.project?.name, 'myproj');
  assert.deepEqual(fake.calls, ['projects.list', `project.get:${ROOT}`]);
  assert.ok(client.lastUpdateAt);

  // snapshot.changed triggers exactly one project.get for that root
  fake.status = 'verifying';
  fake.server.broadcast('snapshot.changed', { root: ROOT, keys: ['status'], status: 'verifying', snapshot: makeDetail('verifying').snapshot });
  await waitFor(() => client.projects[0]!.status === 'verifying');
  assert.deepEqual(fake.calls, ['projects.list', `project.get:${ROOT}`, `project.get:${ROOT}`]);

  // activity push updates the view + recent list without a re-fetch
  const ev = { v: 1 as const, ts: Date.now(), harness: 'claude-code' as const, cwd: ROOT, kind: 'tool.pre' as const, agent: 'gsd-executor', tool: 'Bash', detail: 'npm test' };
  fake.server.broadcast('activity', { root: ROOT, event: ev, view: { agent: 'gsd-executor', workers: 1, tool: 'Bash', sessionEnded: false } });
  await waitFor(() => client.projects[0]!.recent.length === 1);
  assert.equal(client.projects[0]!.activity?.tool, 'Bash');

  fake.server.broadcast('agent.status', { root: ROOT, paneId: 'pane-7', status: 'blocked' });
  await waitFor(() => client.projects[0]!.driverAgentStatus === 'blocked');
  assert.equal(client.projects[0]!.driverPaneId, 'pane-7');

  fake.server.broadcast('daemon.status', { pid: 1, version: '0.1.0', projects: 1 });
  await waitFor(() => client.daemonStatus !== undefined);
  assert.ok(changes > 3);

  client.stop();
  await fake.server.close();
});

test('prompt.send always carries confirm:true and surfaces agent_blocked', async () => {
  const p = await sockPath();
  const fake = await fakeDaemon(p);
  const client = new DashboardClient({ socketPath: p, autoEnsure: false });
  await client.start();

  assert.deepEqual(await client.sendPrompt(ROOT, '/gsd-verify-work 3'), { sent: true, paneId: 'pane-1' });
  assert.deepEqual(fake.prompts, [{ root: ROOT, text: '/gsd-verify-work 3', confirm: true }]);

  fake.promptResult = { sent: false, reason: 'agent_blocked', message: 'driver is blocked' };
  const blocked = await client.sendPrompt(ROOT, '/gsd-verify-work 3');
  assert.deepEqual(blocked, { sent: false, reason: 'agent_blocked', message: 'driver is blocked' });

  await client.rescan(ROOT);
  assert.deepEqual(await client.notifyTest(ROOT), { shown: true });

  client.stop();
  await fake.server.close();
});

test('reconnects with backoff after the daemon restarts', async () => {
  const p = await sockPath();
  const fake = await fakeDaemon(p);
  const client = new DashboardClient({ socketPath: p, autoEnsure: false, backoffMinMs: 20, backoffMaxMs: 60 });
  await client.start();
  assert.equal(client.connected, true);

  await fake.server.close();
  await waitFor(() => client.connected === false);
  assert.equal(client.projects.length, 0, 'projects are cleared while disconnected');

  // stays down (and keeps retrying) while the socket is gone
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(client.connected, false);

  fake.calls.length = 0;
  await fake.listen();
  await waitFor(() => client.connected === true, 3000);
  await waitFor(() => client.projects.length === 1);
  assert.deepEqual(fake.calls, ['projects.list', `project.get:${ROOT}`]);

  client.stop();
  await fake.server.close();
});

test('spawns `daemon ensure` once when the socket is missing, then keeps retrying', async () => {
  const p = await sockPath();
  const ensured: string[] = [];
  const client = new DashboardClient({ socketPath: p, backoffMinMs: 15, backoffMaxMs: 30, ensureFn: (s) => ensured.push(s) });
  await client.start();
  assert.equal(client.connected, false);
  await new Promise((r) => setTimeout(r, 120));
  assert.deepEqual(ensured, [p], 'ensure is spawned exactly once');
  assert.match(client.lastError ?? '', /ENOENT|connect/);

  // the daemon finally comes up: the retry loop finds it
  const fake = await fakeDaemon(p);
  await waitFor(() => client.connected === true, 3000);
  assert.equal(client.projects.length, 1);
  assert.deepEqual(ensured, [p]);

  client.stop();
  await fake.server.close();
});

test('request() rejects when not connected', async () => {
  const client = new DashboardClient({ socketPath: '/nonexistent/gsdd.sock', autoEnsure: false });
  await assert.rejects(client.request('ping'), /not connected/);
  client.stop();
});

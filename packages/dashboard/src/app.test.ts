import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as os from 'node:os';
import * as path from 'node:path';
import { EventEmitter } from 'node:events';
import { promises as fs } from 'node:fs';
import { ControlServer } from '@herdr-gsd/daemon';
import type { ProjectDetail } from '@herdr-gsd/daemon';
import { DashboardApp } from './app';
import { DashboardClient } from './client';
import { stripAnsi } from './render';

const ROOT = '/home/u/myproj';

function detail(root = ROOT, name = 'myproj'): ProjectDetail {
  return {
    root,
    snapshot: {
      root,
      planningDir: `${root}/.planning`,
      observedAt: Date.now(),
      health: 'ok',
      project: { name },
      position: { phase: { number: '03', slug: 'auth', status: 'executing' }, plan: { id: '03-02', index: 2, total: 4 } },
      phases: [{ number: '03', slug: 'auth', status: 'executing', plans: 4, summaries: 1 }],
      blockers: [],
    },
    next: 'verify-work 3',
    status: 'executing',
    recent: [],
    bindings: [],
    tokens: { workspace: {} },
  };
}

class FakeOut extends EventEmitter {
  columns = 80;
  rows = 24;
  chunks: string[] = [];
  write(s: string): boolean {
    this.chunks.push(s);
    return true;
  }
  text(): string {
    return stripAnsi(this.chunks.join(''));
  }
}

class FakeIn extends EventEmitter {
  isTTY = false;
  raw?: boolean;
  setRawMode(v: boolean): this {
    this.raw = v;
    return this;
  }
  setEncoding(): this {
    return this;
  }
  resume(): this {
    return this;
  }
  pause(): this {
    return this;
  }
}

async function harness(opts: { roots?: string[]; promptResult?: unknown; plan?: unknown; runs?: unknown[] } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gsd-app-'));
  const sock = path.join(dir, 'gsdd.sock');
  const roots = opts.roots ?? [ROOT];
  const seen: Array<{ method: string; params: unknown }> = [];
  const srv = new ControlServer(sock);
  srv.register('projects.list', () => {
    seen.push({ method: 'projects.list', params: undefined });
    return roots.map((r) => ({ root: r, name: path.basename(r), health: 'ok', status: 'executing', workspaces: [] }));
  });
  srv.register('project.get', (p) => ({ ...detail((p as { root: string }).root, path.basename((p as { root: string }).root)), runs: opts.runs, orchestration: { enabled: true, harness: 'claude-code' } }));
  srv.register('project.rescan', (p) => {
    seen.push({ method: 'project.rescan', params: p });
    return { rescanned: roots };
  });
  srv.register('notify.test', (p) => {
    seen.push({ method: 'notify.test', params: p });
    return { shown: true };
  });
  srv.register('prompt.send', (p) => {
    seen.push({ method: 'prompt.send', params: p });
    return opts.promptResult ?? { sent: true, paneId: 'pane-1' };
  });
  srv.register('orchestrate.plan', (p) => {
    seen.push({ method: 'orchestrate.plan', params: p });
    return opts.plan ?? { ok: true, unit: (p as { unit: string }).unit, reasons: [], warnings: [], command: '/gsd-execute-phase 3', kind: 'claude', branch: 'gsd/phase-03-auth', harness: 'claude-code', args: [], repo: ROOT };
  });
  srv.register('orchestrate.start', (p) => {
    seen.push({ method: 'orchestrate.start', params: p });
    return { run: { id: 'r1', status: 'running', target: { paneId: 'w1:p9', workspaceId: 'w1' }, command: '/gsd-execute-phase 3', unit: (p as { unit: string }).unit }, plan: { ok: true, reasons: [], warnings: [] } };
  });
  srv.register('orchestrate.stop', (p) => {
    seen.push({ method: 'orchestrate.stop', params: p });
    return [{ stopped: true, run: { id: 'r1', status: 'cancelled', reason: 'stopped by user; pane w1:p9 closed' } }];
  });
  await srv.listen();

  const client = new DashboardClient({ socketPath: sock, autoEnsure: false, backoffMinMs: 20, backoffMaxMs: 40 });
  const out = new FakeOut();
  const inp = new FakeIn();
  const exits: number[] = [];
  const app = new DashboardApp({
    client,
    stdin: inp as unknown as NodeJS.ReadStream,
    stdout: out as unknown as NodeJS.WriteStream,
    colors: false,
    frameIntervalMs: 0,
    onExit: (c) => exits.push(c),
  });
  await app.start();
  return { app, client, srv, out, inp, seen, exits, sock };
}

async function settle(ms = 40): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

test('start enters the alt screen and renders; q restores and exits', async () => {
  const h = await harness();
  assert.ok(h.out.chunks[0]!.includes('[?1049h'), 'alt screen on');
  assert.ok(h.out.chunks[0]!.includes('[?25l'), 'cursor hidden');
  assert.match(h.out.text(), / GSD · myproj · Phase 03 auth/);

  h.inp.emit('data', 'q');
  assert.deepEqual(h.exits, [0]);
  const tail = h.out.chunks.join('');
  assert.ok(tail.includes('[?25h') && tail.includes('[?1049l'), 'terminal restored');
  assert.equal(h.client.connected, false);
  await h.srv.close();
});

test('o plans then asks y/N, y starts the run; w plans an isolated run; a refused plan shows the first reason', async () => {
  const h = await harness();
  try {
    h.app.handleKey('o');
    await settle();
    assert.equal(h.seen.filter((s) => s.method === 'orchestrate.plan').length, 1);
    assert.deepEqual(h.seen.at(-1)?.params, { root: ROOT, unit: 'phase' });
    assert.ok(h.out.text().includes('start claude in a new pane and send /gsd-execute-phase 3? y/N'), h.out.text());
    h.app.handleKey('y');
    await settle();
    const start = h.seen.find((s) => s.method === 'orchestrate.start');
    assert.deepEqual(start?.params, { root: ROOT, unit: 'phase', confirm: true });
    assert.ok(h.out.text().includes('run r1 running in w1:p9'));
    h.app.handleKey('w');
    await settle();
    assert.ok(h.out.text().includes('worktree gsd/phase-03-auth'));
    h.app.handleKey('n'); // anything but y cancels
    await settle();
    assert.equal(h.seen.filter((s) => s.method === 'orchestrate.start').length, 1);
  } finally {
    h.app.stop();
    await h.srv.close();
  }
  const refused = await harness({ plan: { ok: false, unit: 'autonomous', reasons: ['STATE.md lists blockers: db down'], warnings: [] } });
  try {
    refused.app.handleKey('a');
    await settle();
    assert.ok(refused.out.text().includes('cannot start autonomous: STATE.md lists blockers'));
    assert.equal(refused.seen.filter((s) => s.method === 'orchestrate.start').length, 0);
  } finally {
    refused.app.stop();
    await refused.srv.close();
  }
});

test('x asks before stopping the active run, and says so when there is none', async () => {
  const none = await harness();
  try {
    none.app.handleKey('x');
    await settle();
    assert.ok(none.out.text().includes('no active run'));
  } finally {
    none.app.stop();
    await none.srv.close();
  }
  const active = await harness({ runs: [{ id: 'r1', unit: 'phase', status: 'waiting', waitingFor: 'agent_blocked', command: '/gsd-execute-phase 3', startedAt: 1, target: { paneId: 'w1:p9', workspaceId: 'w1' }, warnings: [], prompts: [] }] });
  try {
    active.app.handleKey('x');
    await settle();
    assert.ok(active.out.text().includes('stop run r1 (/gsd-execute-phase 3) and close pane w1:p9? y/N'), active.out.text());
    active.app.handleKey('y');
    await settle();
    assert.deepEqual(active.seen.find((s) => s.method === 'orchestrate.stop')?.params, { runId: 'r1', discard: false });
    assert.ok(active.out.text().includes('stopped: stopped by user'));
  } finally {
    active.app.stop();
    await active.srv.close();
  }
});

test('r rescans, n sends a notify test', async () => {
  const h = await harness();
  h.inp.emit('data', 'r');
  await settle();
  assert.ok(h.seen.some((s) => s.method === 'project.rescan'));
  assert.deepEqual(h.seen.find((s) => s.method === 'project.rescan')!.params, { root: ROOT });
  assert.match(h.out.text(), /rescan/);

  h.inp.emit('data', 'n');
  await settle();
  assert.ok(h.seen.some((s) => s.method === 'notify.test'));

  h.inp.emit('data', 'o');
  await settle();
  h.app.stop();
  await h.srv.close();
});

test('tab cycles projects', async () => {
  const h = await harness({ roots: [ROOT, '/home/u/second'] });
  assert.match(h.app.state().projects[0]!.root, /myproj/);
  assert.equal(h.app.state().selected, 0);
  h.inp.emit('data', '\t');
  await settle();
  assert.equal(h.app.state().selected, 1);
  assert.match(h.out.text(), /\[tab\] project 2\/2/);
  h.inp.emit('data', '\t');
  await settle();
  assert.equal(h.app.state().selected, 0);
  h.app.stop();
  await h.srv.close();
});

test('enter asks y/N, y sends /gsd-<next> with confirm, other keys cancel', async () => {
  const h = await harness();
  h.inp.emit('data', '\r');
  await settle();
  assert.equal(h.app.state().confirmPending?.text, 'send /gsd-verify-work 3 to driver pane? y/N');
  assert.match(h.out.text(), /send \/gsd-verify-work 3 to driver pane\? y\/N/);

  h.inp.emit('data', 'x');
  await settle();
  assert.equal(h.app.state().confirmPending, undefined);
  assert.equal(h.seen.filter((s) => s.method === 'prompt.send').length, 0, 'cancelled, nothing sent');
  assert.match(h.out.text(), /cancelled/);

  h.inp.emit('data', '\r');
  await settle();
  h.inp.emit('data', 'y');
  await settle();
  const sent = h.seen.find((s) => s.method === 'prompt.send');
  assert.deepEqual(sent!.params, { root: ROOT, text: '/gsd-verify-work 3', confirm: true });
  assert.match(h.out.text(), /sent \/gsd-verify-work 3 to pane pane-1/);
  h.app.stop();
  await h.srv.close();
});

test('a blocked driver shows the agent_blocked error in the message line', async () => {
  const h = await harness({ promptResult: { sent: false, reason: 'agent_blocked', message: 'driver agent is blocked' } });
  h.inp.emit('data', '\r');
  await settle();
  h.inp.emit('data', 'y');
  await settle();
  assert.match(h.out.text(), /driver agent is blocked/);
  assert.equal(h.app.state().message?.kind, 'error');
  h.app.stop();
  await h.srv.close();
});

test('redraws coalesce to the frame interval', async () => {
  const h = await harness();
  const app = h.app;
  // frameIntervalMs 0 in the harness renders eagerly; use a fresh app clock here
  const slow = new DashboardApp({
    client: h.client,
    stdin: h.inp as unknown as NodeJS.ReadStream,
    stdout: h.out as unknown as NodeJS.WriteStream,
    colors: false,
    frameIntervalMs: 250,
    now: () => 1_000_000,
    onExit: () => undefined,
  });
  const before = h.out.chunks.length;
  slow.render();
  slow.scheduleRender();
  slow.scheduleRender();
  slow.scheduleRender();
  assert.equal(h.out.chunks.length, before + 1, 'three scheduled redraws coalesce into the pending one');
  slow.stop();
  app.stop();
  await h.srv.close();
});

const CTRL_C = String.fromCharCode(3);
const ENTER = String.fromCharCode(13);

test('ctrl-C quits even at the confirm prompt; batched keystrokes are split', async () => {
  const h = await harness();
  h.inp.emit('data', ENTER);
  await settle();
  assert.ok(h.app.state().confirmPending);
  h.inp.emit('data', CTRL_C);
  assert.deepEqual(h.exits, [0]);
  assert.equal(h.seen.filter((s) => s.method === 'prompt.send').length, 0);
  await h.srv.close();
});

test('a multi-key chunk is handled key by key', async () => {
  const h = await harness();
  h.inp.emit('data', 'ro');
  await settle();
  assert.ok(h.seen.some((s) => s.method === 'project.rescan'), 'r was handled');
  assert.ok(h.seen.some((s) => s.method === 'orchestrate.plan'), 'o was handled');
  assert.match(h.out.text(), /start claude in a new pane/);
  h.app.stop();
  await h.srv.close();
});

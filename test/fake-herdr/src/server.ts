import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import {
  AgentInfo,
  AgentStatus,
  AnyEventEnvelope,
  EventEnvelope,
  MAX_TOKEN_KEYS_PER_REPORT,
  METADATA_SOURCE_PATTERN,
  MetadataTokens,
  NotificationShowReason,
  PaneInfo,
  PaneProcessInfo,
  PluginInfo,
  SessionSnapshot,
  StateLabels,
  SubscriptionSpec,
  TOKEN_KEY_PATTERN,
  TOKEN_VALUE_MAX_LENGTH,
  TTL_MS_MAX,
  TTL_MS_MIN,
  TabInfo,
  Tokens,
  WorkspaceInfo,
  WorktreeInfo,
  WorktreeSourceInfo,
} from '@herdr-gsd/herdr-client';

/**
 * Methods this fake implements, in the order the real server enumerates them.
 * An unknown method is answered with `invalid_request` and this list, exactly
 * like Herdr 0.9.0 (spike §1.2).
 */
export const FAKE_METHODS: readonly string[] = [
  'ping',
  'notification.show',
  'session.snapshot',
  'workspace.list',
  'workspace.get',
  'workspace.report_metadata',
  'worktree.list',
  'worktree.create',
  'worktree.open',
  'worktree.remove',
  'tab.list',
  'tab.get',
  'agent.list',
  'agent.get',
  'agent.send_keys',
  'agent.read',
  'agent.view.set',
  'agent.view.clear',
  'agent.start',
  'agent.prompt',
  'agent.wait',
  'pane.split',
  'pane.process_info',
  'pane.list',
  'pane.get',
  'pane.send_text',
  'pane.read',
  'pane.report_metadata',
  'pane.close',
  'events.subscribe',
  'plugin.list',
];

/** An error answered with the request id echoed back. */
export class FakeHerdrError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'FakeHerdrError';
  }
}

/** A deserialization failure: answered with `id: ""` (spike §1.2). */
export class InvalidRequestError extends Error {
  readonly code = 'invalid_request';
  constructor(message: string) {
    super(message);
    this.name = 'InvalidRequestError';
  }
}

export interface RecordedCall {
  order: number;
  method: string;
  params: unknown;
}

interface Subscriber {
  socket: net.Socket;
  subscriptions: SubscriptionSpec[];
  /** snake_case lifecycle event names this subscriber asked for. */
  lifecycle: Set<string>;
}

export interface FakeHerdrOptions {
  socketPath?: string;
  version?: string;
  protocol?: number;
}

export interface WorktreeRepo {
  source: WorktreeSourceInfo;
  worktrees: WorktreeInfo[];
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/**
 * A stand-in for the Herdr 0.9.0 socket server, faithful to the M0-H captures:
 * one request per connection then close, `events.subscribe` streams, results
 * are `{type: …}` tagged unions, and metadata reports obey the token/seq rules.
 */
export class FakeHerdr {
  readonly socketPath: string;
  readonly version: string;
  readonly protocol: number;

  /** Every request in arrival order — assert call ordering and seq monotonicity. */
  readonly calls: RecordedCall[] = [];
  /** Controls what `notification.show` answers. */
  notificationMode: NotificationShowReason = 'shown';
  /** Plugins visible to `plugin.list` / `agent.view.set` source gating. */
  plugins: PluginInfo[] = [];
  /** Last accepted `agent.view.set` params, or undefined after a clear. */
  agentView?: { source: string; label?: string | null; filter?: unknown; sort?: unknown };
  /** Override the `invalid_request` text for an unknown method (probe-failure tests). */
  unknownMethodMessage?: (method: string) => string;
  /**
   * What a started agent does after `agent.start` returns `launch_pending`
   * (spike M4 H1/H2): `idle` = reaches idle after `startupDelayMs`;
   * `blocked` = a startup dialog (Claude Code folder trust); `never` = stays unknown.
   */
  agentStartBehavior: 'idle' | 'blocked' | 'never' = 'idle';
  startupDelayMs = 20;
  /** After `agent.prompt` the agent goes `working`; tests settle it with `setAgentStatus`. */
  promptMakesWorking = true;
  /**
   * Real Herdr (spike M4 H10) pushes agent-status transitions only on the pane-scoped
   * `pane.agent_status_changed` subscription; `pane_updated` fires for other PaneInfo
   * changes and carries whatever status it had then. `false` reproduces that.
   */
  statusViaPaneUpdated = true;
  /** Worktree paths whose removal needs `force` (spike M4 H8). */
  readonly dirtyWorktrees = new Set<string>();
  /** Screen text answered by `pane.read` / `agent.read`, per pane id. */
  readonly screens = new Map<string, string>();
  private readonly statusWaiters = new Set<{ paneId: string; until: AgentStatus[]; resolve: (a: AgentInfo) => void }>();

  private server?: net.Server;
  private readonly sockets = new Set<net.Socket>();
  private readonly subscribers = new Set<Subscriber>();
  private readonly workspaces = new Map<string, WorkspaceInfo>();
  private readonly tabs = new Map<string, TabInfo>();
  private readonly panes = new Map<string, PaneInfo>();
  private readonly agentNames = new Map<string, string>(); // name -> pane_id
  private readonly processInfo = new Map<string, PaneProcessInfo>();
  private readonly repos = new Map<string, WorktreeRepo>();
  /** seq high-water mark per `${resource}|${source}` — never exposed by Herdr. */
  private readonly seqHighWater = new Map<string, number>();
  private readonly ttlTimers = new Map<string, NodeJS.Timeout>();
  private stateChangeSeq = 0;
  private callOrder = 0;
  private paneCounter = 0;
  private workspaceCounter = 0;
  private ownsSocketDir = false;

  constructor(opts: FakeHerdrOptions = {}) {
    this.socketPath = opts.socketPath ?? path.join(os.tmpdir(), `fake-herdr-${process.pid}-${Math.random().toString(36).slice(2)}.sock`);
    this.version = opts.version ?? '0.9.0';
    this.protocol = opts.protocol ?? 22;
  }

  /** Create, listen, and return a ready server. */
  static async start(opts: FakeHerdrOptions = {}): Promise<FakeHerdr> {
    const fake = new FakeHerdr(opts);
    await fake.listen();
    return fake;
  }

  async listen(): Promise<void> {
    await fs.mkdir(path.dirname(this.socketPath), { recursive: true });
    this.ownsSocketDir = true;
    await fs.unlink(this.socketPath).catch(() => undefined);
    this.server = net.createServer((sock) => this.accept(sock));
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(this.socketPath, () => {
        this.server!.off('error', reject);
        resolve();
      });
    });
  }

  async close(): Promise<void> {
    for (const t of this.ttlTimers.values()) clearTimeout(t);
    this.ttlTimers.clear();
    for (const s of this.sockets) s.destroy();
    this.sockets.clear();
    this.subscribers.clear();
    if (this.server) {
      await new Promise<void>((r) => this.server!.close(() => r()));
      this.server = undefined;
    }
    if (this.ownsSocketDir) await fs.unlink(this.socketPath).catch(() => undefined);
  }

  /* ------------------------------------------------------------------ */
  /* Test state injection                                                */
  /* ------------------------------------------------------------------ */

  addWorkspace(input: Partial<WorkspaceInfo> & { workspace_id?: string }): WorkspaceInfo {
    if (input.workspace_id) {
      const n = Number(/^w(\d+)$/.exec(input.workspace_id)?.[1]);
      if (Number.isInteger(n)) this.workspaceCounter = Math.max(this.workspaceCounter, n);
    }
    const id = input.workspace_id ?? `w${++this.workspaceCounter}`;
    const number = input.number ?? this.workspaces.size + 1;
    const ws: WorkspaceInfo = {
      workspace_id: id,
      number,
      label: input.label ?? id,
      focused: input.focused ?? false,
      pane_count: input.pane_count ?? 0,
      tab_count: input.tab_count ?? 1,
      active_tab_id: input.active_tab_id ?? `${id}:t1`,
      agent_status: input.agent_status ?? 'unknown',
      ...(input.tokens ? { tokens: { ...input.tokens } } : {}),
      ...(input.worktree ? { worktree: input.worktree } : {}),
    };
    this.workspaces.set(id, ws);
    if (!this.tabs.has(ws.active_tab_id)) {
      this.tabs.set(ws.active_tab_id, {
        tab_id: ws.active_tab_id,
        workspace_id: id,
        number: 1,
        label: '1',
        focused: ws.focused,
        pane_count: 0,
        agent_status: ws.agent_status,
      });
    }
    this.broadcast({ event: 'workspace_created', data: { type: 'workspace_created', workspace: clone(ws) } });
    return ws;
  }

  addPane(input: Partial<PaneInfo> & { workspace_id: string }): PaneInfo {
    const ws = this.workspaces.get(input.workspace_id) ?? this.addWorkspace({ workspace_id: input.workspace_id });
    if (input.pane_id) {
      const n = Number(/:p(\d+)$/.exec(input.pane_id)?.[1]);
      if (Number.isInteger(n)) this.paneCounter = Math.max(this.paneCounter, n);
    }
    const paneId = input.pane_id ?? `${ws.workspace_id}:p${++this.paneCounter}`;
    const tabId = input.tab_id ?? ws.active_tab_id;
    const pane: PaneInfo = {
      pane_id: paneId,
      terminal_id: input.terminal_id ?? `term_${paneId.replace(/[^a-z0-9]/gi, '')}`,
      workspace_id: ws.workspace_id,
      tab_id: tabId,
      focused: input.focused ?? false,
      agent_status: input.agent_status ?? 'unknown',
      revision: input.revision ?? 1,
      ...(input.cwd !== undefined ? { cwd: input.cwd } : {}),
      ...(input.foreground_cwd !== undefined ? { foreground_cwd: input.foreground_cwd } : {}),
      ...(input.agent !== undefined ? { agent: input.agent } : {}),
      ...(input.agent_session !== undefined ? { agent_session: input.agent_session } : {}),
      ...(input.terminal_title !== undefined ? { terminal_title: input.terminal_title } : {}),
      ...(input.terminal_title_stripped !== undefined ? { terminal_title_stripped: input.terminal_title_stripped } : {}),
      ...(input.tokens ? { tokens: { ...input.tokens } } : {}),
      ...(input.scroll !== undefined ? { scroll: input.scroll } : {}),
    };
    this.panes.set(paneId, pane);
    ws.pane_count = [...this.panes.values()].filter((p) => p.workspace_id === ws.workspace_id).length;
    const tab = this.tabs.get(tabId);
    if (tab) tab.pane_count = [...this.panes.values()].filter((p) => p.tab_id === tabId).length;
    this.broadcast({ event: 'pane_created', data: { type: 'pane_created', pane: clone(pane) } });
    return pane;
  }

  /** Register `pane.process_info` output for a pane. */
  setProcessInfo(paneId: string, info: Omit<PaneProcessInfo, 'pane_id'>): void {
    this.processInfo.set(paneId, { pane_id: paneId, ...info });
  }

  /** Register a repo for `worktree.list`, keyed by `source.repo_root`. */
  addWorktreeRepo(repo: WorktreeRepo): void {
    this.repos.set(repo.source.repo_root, repo);
  }

  /** Register a plugin so `plugin.list` shows it and `agent.view.set` accepts its source. */
  addPlugin(input: Partial<PluginInfo> & { plugin_id: string }): PluginInfo {
    const plugin: PluginInfo = {
      plugin_id: input.plugin_id,
      name: input.name ?? input.plugin_id,
      version: input.version ?? '0.1.0',
      manifest_path: input.manifest_path ?? `/plugins/${input.plugin_id}/herdr-plugin.toml`,
      plugin_root: input.plugin_root ?? `/plugins/${input.plugin_id}`,
      enabled: input.enabled ?? true,
      ...(input.warnings ? { warnings: input.warnings } : {}),
    };
    this.plugins.push(plugin);
    return plugin;
  }

  /**
   * Change a pane's semantic status: emits `pane_updated` to lifecycle
   * subscribers and `pane.agent_status_changed` (the dotted, pane-scoped
   * envelope) to subscribers that asked for that pane.
   */
  setAgentStatus(paneId: string, status: AgentStatus): void {
    const pane = this.panes.get(paneId);
    if (!pane) throw new Error(`fake-herdr: no such pane ${paneId}`);
    pane.agent_status = status;
    pane.revision += 1;
    this.stateChangeSeq += 1;
    const ws = this.workspaces.get(pane.workspace_id);
    if (ws) ws.agent_status = status;
    const tab = this.tabs.get(pane.tab_id);
    if (tab) tab.agent_status = status;
    if (this.statusViaPaneUpdated) this.broadcast({ event: 'pane_updated', data: { type: 'pane_updated', pane: clone(pane) } });
    this.resolveWaiters(pane);
    for (const sub of this.subscribers) {
      for (const spec of sub.subscriptions) {
        if (spec.type !== 'pane.agent_status_changed' || spec.pane_id !== paneId) continue;
        if (spec.agent_status && spec.agent_status !== status) continue;
        this.send(sub.socket, {
          event: 'pane.agent_status_changed',
          data: {
            pane_id: pane.pane_id,
            workspace_id: pane.workspace_id,
            agent_status: status,
            ...(pane.agent ? { agent: pane.agent } : {}),
          },
        });
      }
    }
  }

  closePane(paneId: string): void {
    const pane = this.panes.get(paneId);
    if (!pane) return;
    this.panes.delete(paneId);
    for (const [name, id] of this.agentNames) if (id === paneId) this.agentNames.delete(name);
    for (const w of [...this.statusWaiters]) if (w.paneId === paneId) this.statusWaiters.delete(w);
    const ws = this.workspaces.get(pane.workspace_id);
    if (ws) ws.pane_count = [...this.panes.values()].filter((p) => p.workspace_id === ws.workspace_id).length;
    const tab = this.tabs.get(pane.tab_id);
    if (tab) tab.pane_count = [...this.panes.values()].filter((p) => p.tab_id === pane.tab_id).length;
    this.broadcast({ event: 'pane_closed', data: { type: 'pane_closed', pane_id: paneId, workspace_id: pane.workspace_id } });
  }

  /** Close a workspace (its tabs go too) and broadcast `workspace_closed`. */
  closeWorkspace(workspaceId: string): void {
    const ws = this.workspaces.get(workspaceId);
    if (!ws) return;
    this.workspaces.delete(workspaceId);
    for (const [id, tab] of this.tabs) if (tab.workspace_id === workspaceId) this.tabs.delete(id);
    for (const [name, paneId] of this.agentNames) if (!this.panes.has(paneId)) this.agentNames.delete(name);
    this.broadcast({ event: 'workspace_closed', data: { type: 'workspace_closed', workspace_id: workspaceId, workspace: clone(ws) } });
  }

  /** Resolve once the pane's agent status is one of `until`, or throw `timeout` (spike M4 H2). */
  waitForStatus(paneId: string, until: AgentStatus[], timeoutMs: number): Promise<AgentInfo> {
    const pane = this.panes.get(paneId);
    if (pane?.agent && until.includes(pane.agent_status)) return Promise.resolve(this.resolveAgentOrThrow(paneId));
    return new Promise<AgentInfo>((resolve, reject) => {
      const waiter = { paneId, until, resolve: (a: AgentInfo) => { clearTimeout(t); resolve(a); } };
      const t = setTimeout(() => {
        this.statusWaiters.delete(waiter);
        reject(new FakeHerdrError('timeout', `agent wait timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      t.unref?.();
      this.statusWaiters.add(waiter);
    });
  }

  private resolveWaiters(pane: PaneInfo): void {
    for (const w of [...this.statusWaiters]) {
      if (w.paneId !== pane.pane_id || !w.until.includes(pane.agent_status)) continue;
      this.statusWaiters.delete(w);
      w.resolve(this.agentFor(pane, [...this.agentNames].find(([, id]) => id === pane.pane_id)?.[0]));
    }
  }

  /** Push an arbitrary envelope to every subscriber that asked for it. */
  emit(envelope: AnyEventEnvelope): void {
    if (envelope.event.includes('.')) {
      const paneId = (envelope.data as { pane_id?: string }).pane_id;
      for (const sub of this.subscribers) {
        const wanted = sub.subscriptions.some((s) => s.type === envelope.event && (!('pane_id' in s) || s.pane_id === paneId));
        if (wanted) this.send(sub.socket, envelope);
      }
      return;
    }
    this.broadcast(envelope as EventEnvelope);
  }

  /** Tokens currently retained on a workspace or pane, or undefined. */
  tokensOf(id: string): Tokens | undefined {
    const target = this.workspaces.get(id) ?? this.panes.get(id);
    return target?.tokens ? { ...target.tokens } : undefined;
  }

  workspace(id: string): WorkspaceInfo | undefined {
    return this.workspaces.get(id);
  }
  pane(id: string): PaneInfo | undefined {
    return this.panes.get(id);
  }
  /** Requests recorded for one method, oldest first. */
  callsFor(method: string): RecordedCall[] {
    return this.calls.filter((c) => c.method === method);
  }
  get subscriberCount(): number {
    return this.subscribers.size;
  }

  /** Kill every open subscription connection (server restart / handoff simulation). */
  dropSubscribers(): number {
    const subs = [...this.subscribers];
    this.subscribers.clear();
    for (const sub of subs) sub.socket.destroy();
    return subs.length;
  }

  /* ------------------------------------------------------------------ */
  /* Connection handling: one request per connection, then close         */
  /* ------------------------------------------------------------------ */

  private accept(sock: net.Socket): void {
    this.sockets.add(sock);
    sock.setEncoding('utf8');
    let buf = '';
    let answered = false;
    sock.on('error', () => undefined);
    sock.on('close', () => {
      this.sockets.delete(sock);
      for (const sub of this.subscribers) if (sub.socket === sock) this.subscribers.delete(sub);
    });
    sock.on('data', (chunk: string) => {
      buf += chunk;
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (!line.trim()) continue;
        if (answered) return; // real server has already closed; ignore pipelining
        answered = true;
        void this.dispatch(sock, line).then((keepOpen) => {
          if (!keepOpen) sock.end();
        });
      }
    });
  }

  /** @returns true when the connection must stay open (subscription). */
  private async dispatch(sock: net.Socket, line: string): Promise<boolean> {
    let req: { id?: unknown; method?: unknown; params?: unknown };
    try {
      req = JSON.parse(line) as typeof req;
    } catch {
      this.send(sock, { id: '', error: { code: 'invalid_request', message: `invalid request: expected value at line 1 column 1` } });
      return false;
    }
    const id = typeof req.id === 'string' ? req.id : '';
    const method = typeof req.method === 'string' ? req.method : '';
    const params = (req.params ?? {}) as Record<string, unknown>;
    this.calls.push({ order: ++this.callOrder, method, params: clone(params) });

    if (!FAKE_METHODS.includes(method)) {
      const expected = FAKE_METHODS.map((m) => `\`${m}\``).join(', ');
      const message =
        this.unknownMethodMessage?.(method) ?? `invalid request: unknown variant \`${method}\`, expected one of ${expected} at line 1 column ${line.length}`;
      this.send(sock, { id: '', error: { code: 'invalid_request', message } });
      return false;
    }

    if (method === 'events.subscribe') {
      const subs = Array.isArray(params['subscriptions']) ? (params['subscriptions'] as SubscriptionSpec[]) : [];
      const lifecycle = new Set<string>();
      for (const s of subs) if (typeof s?.type === 'string') lifecycle.add(s.type.replace(/\./g, '_'));
      this.subscribers.add({ socket: sock, subscriptions: subs, lifecycle });
      this.send(sock, { id, result: { type: 'subscription_started' } });
      return true;
    }

    try {
      this.send(sock, { id, result: await this.handle(method, params) });
    } catch (e) {
      if (e instanceof InvalidRequestError) this.send(sock, { id: '', error: { code: e.code, message: e.message } });
      else if (e instanceof FakeHerdrError) this.send(sock, { id, error: { code: e.code, message: e.message } });
      else this.send(sock, { id, error: { code: 'internal', message: e instanceof Error ? e.message : String(e) } });
    }
    return false;
  }

  private send(sock: net.Socket, msg: unknown): void {
    if (!sock.destroyed) sock.write(JSON.stringify(msg) + '\n');
  }

  private broadcast(envelope: EventEnvelope): void {
    for (const sub of this.subscribers) if (sub.lifecycle.has(envelope.event)) this.send(sub.socket, envelope);
  }

  /* ------------------------------------------------------------------ */
  /* Method handlers                                                     */
  /* ------------------------------------------------------------------ */

  private async handle(method: string, params: Record<string, unknown>): Promise<unknown> {
    switch (method) {
      case 'ping':
        return {
          type: 'pong',
          version: this.version,
          protocol: this.protocol,
          capabilities: { live_handoff: true, detached_server_daemon: true, endpoint_protocol_generation: 1, surface_interest: true, health_check: true },
        };
      case 'session.snapshot':
        return { type: 'session_snapshot', snapshot: this.snapshot() };
      case 'workspace.list':
        return { type: 'workspace_list', workspaces: clone([...this.workspaces.values()]) };
      case 'workspace.get':
        return { type: 'workspace_info', workspace: clone(this.requireWorkspace(this.str(params, 'workspace_id'))) };
      case 'tab.list':
        return { type: 'tab_list', tabs: clone([...this.tabs.values()]) };
      case 'tab.get': {
        const tabId = this.str(params, 'tab_id');
        const tab = this.tabs.get(tabId);
        if (!tab) throw new FakeHerdrError('tab_not_found', `tab ${tabId} not found`);
        return { type: 'tab_info', tab: clone(tab) };
      }
      case 'pane.list': {
        const wsId = this.optStr(params, 'workspace_id');
        const panes = [...this.panes.values()].filter((p) => !wsId || p.workspace_id === wsId);
        return { type: 'pane_list', panes: clone(panes) };
      }
      case 'pane.get':
        return { type: 'pane_info', pane: clone(this.requirePane(this.str(params, 'pane_id'))) };
      case 'pane.read': {
        const pane = this.requirePane(this.str(params, 'pane_id'));
        return {
          type: 'pane_read',
          read: {
            pane_id: pane.pane_id,
            workspace_id: pane.workspace_id,
            tab_id: pane.tab_id,
            source: this.str(params, 'source'),
            format: this.optStr(params, 'format') ?? 'text',
            text: this.screens.get(pane.pane_id) ?? '',
            revision: pane.revision,
            truncated: false,
          },
        };
      }
      case 'pane.process_info': {
        const paneId = this.optStr(params, 'pane_id') ?? this.focusedPaneId();
        if (!paneId) throw new FakeHerdrError('pane_not_found', 'pane not found');
        this.requirePane(paneId);
        return { type: 'pane_process_info', process_info: clone(this.processInfo.get(paneId) ?? { pane_id: paneId, foreground_processes: [] }) };
      }
      case 'agent.list':
        return { type: 'agent_list', agents: clone(this.agents()) };
      case 'agent.get': {
        const target = this.str(params, 'target');
        const agent = this.resolveAgent(target);
        if (!agent) throw new FakeHerdrError('agent_not_found', `agent target ${target} not found`);
        return { type: 'agent_info', agent: clone(agent) };
      }
      case 'plugin.list': {
        const pluginId = this.optStr(params, 'plugin_id');
        return { type: 'plugin_list', plugins: clone(this.plugins.filter((p) => !pluginId || p.plugin_id === pluginId)) };
      }
      case 'worktree.list':
        return this.worktreeList(params);
      case 'worktree.create':
        return this.worktreeCreate(params);
      case 'worktree.open':
        return this.worktreeOpen(params);
      case 'worktree.remove':
        return this.worktreeRemove(params);
      case 'workspace.report_metadata':
        return this.workspaceReportMetadata(params);
      case 'pane.report_metadata':
        return this.paneReportMetadata(params);
      case 'notification.show':
        return this.notificationShow(params);
      case 'agent.view.set':
        return this.agentViewSet(params);
      case 'agent.view.clear':
        this.agentView = undefined;
        return { type: 'agent_view', active: false };
      case 'agent.send_keys':
        this.resolveAgentOrThrow(this.str(params, 'target'));
        return { type: 'ok' };
      case 'agent.start':
        return this.agentStart(params);
      case 'agent.prompt': {
        const agent = this.resolveAgentOrThrow(this.str(params, 'target'));
        this.str(params, 'text');
        if (agent.agent_status === 'blocked') throw new FakeHerdrError('agent_blocked', 'agent is blocked');
        if (this.promptMakesWorking) this.setAgentStatus(agent.pane_id, 'working');
        const wait = params['wait'];
        if (wait && typeof wait === 'object') {
          const w = wait as { until?: AgentStatus[]; timeout_ms?: number };
          const settled = await this.waitForStatus(agent.pane_id, w.until ?? ['idle', 'done', 'blocked'], w.timeout_ms ?? 30_000);
          return { type: 'agent_prompted', agent: clone(settled) };
        }
        return { type: 'agent_prompted', agent: clone(this.resolveAgentOrThrow(agent.pane_id)) };
      }
      case 'agent.wait': {
        const agent = this.resolveAgentOrThrow(this.str(params, 'target'));
        const until: AgentStatus[] = Array.isArray(params['until']) ? (params['until'] as AgentStatus[]) : ['idle', 'done', 'blocked'];
        const timeout = typeof params['timeout_ms'] === 'number' ? params['timeout_ms'] : 30_000;
        return { type: 'agent_info', agent: clone(await this.waitForStatus(agent.pane_id, until, timeout)) };
      }
      case 'agent.read': {
        const agent = this.resolveAgentOrThrow(this.str(params, 'target'));
        const pane = this.requirePane(agent.pane_id);
        return {
          type: 'pane_read',
          read: { pane_id: pane.pane_id, workspace_id: pane.workspace_id, tab_id: pane.tab_id, source: this.str(params, 'source'), format: this.optStr(params, 'format') ?? 'text', text: this.screens.get(pane.pane_id) ?? '', revision: pane.revision, truncated: false },
        };
      }
      case 'pane.send_text':
        this.requirePane(this.str(params, 'pane_id'));
        this.str(params, 'text');
        return { type: 'ok' };
      case 'pane.split':
        return this.paneSplit(params);
      case 'pane.close': {
        // Closing the last pane closes its workspace (spike M4 H5).
        const paneId = this.str(params, 'pane_id');
        const pane = this.requirePane(paneId);
        this.closePane(paneId);
        const ws = this.workspaces.get(pane.workspace_id);
        if (ws && ws.pane_count === 0) this.closeWorkspace(ws.workspace_id);
        return { type: 'ok' };
      }
      default:
        throw new FakeHerdrError('not_implemented', `fake-herdr has no handler for ${method}`);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Metadata                                                            */
  /* ------------------------------------------------------------------ */

  private workspaceReportMetadata(params: Record<string, unknown>): unknown {
    const workspaceId = this.str(params, 'workspace_id');
    const source = this.metadataSource(params);
    if (!('tokens' in params)) throw new InvalidRequestError('invalid request: missing field `tokens` at line 1 column 1');
    const tokens = this.metadataTokens(params);
    const ttl = this.metadataTtl(params);
    const ws = this.requireWorkspace(workspaceId);
    if (!this.acceptSeq(`workspace:${workspaceId}`, source, params['seq'])) return { type: 'ok' };
    const changed = this.applyTokens(ws, workspaceId, tokens, ttl);
    if (changed) this.broadcast({ event: 'workspace_metadata_updated', data: { type: 'workspace_metadata_updated', workspace: clone(ws) } });
    return { type: 'ok' };
  }

  private paneReportMetadata(params: Record<string, unknown>): unknown {
    const paneId = this.str(params, 'pane_id');
    const source = this.metadataSource(params);
    const tokens = 'tokens' in params ? this.metadataTokens(params) : undefined;
    const ttl = this.metadataTtl(params);
    const pane = this.requirePane(paneId);
    if (!this.acceptSeq(`pane:${paneId}`, source, params['seq'])) return { type: 'ok' };

    let changed = false;
    if (tokens) changed = this.applyTokens(pane, paneId, tokens, ttl);
    if (typeof params['title'] === 'string') {
      pane.title = params['title'];
      changed = true;
    }
    if (params['clear_title'] === true) {
      delete pane.title;
      changed = true;
    }
    if (typeof params['display_agent'] === 'string') {
      pane.display_agent = params['display_agent'];
      changed = true;
    }
    if (params['clear_display_agent'] === true) {
      delete pane.display_agent;
      changed = true;
    }
    if (params['state_labels'] && typeof params['state_labels'] === 'object') {
      pane.state_labels = { ...(params['state_labels'] as StateLabels) };
      changed = true;
    }
    if (params['clear_state_labels'] === true) {
      delete pane.state_labels;
      changed = true;
    }
    if (changed) {
      pane.revision += 1;
      this.broadcast({ event: 'pane_updated', data: { type: 'pane_updated', pane: clone(pane) } });
    }
    return { type: 'ok' };
  }

  private metadataSource(params: Record<string, unknown>): string {
    const source = this.str(params, 'source');
    if (!METADATA_SOURCE_PATTERN.test(source)) {
      throw new FakeHerdrError('invalid_metadata_source', 'metadata source may contain only ASCII letters, digits, colon, dot, underscore, and hyphen');
    }
    return source;
  }

  private metadataTokens(params: Record<string, unknown>): MetadataTokens {
    const raw = params['tokens'];
    if (raw === undefined || raw === null) return {};
    if (typeof raw !== 'object' || Array.isArray(raw)) throw new InvalidRequestError('invalid request: invalid type for field `tokens` at line 1 column 1');
    const tokens = raw as MetadataTokens;
    const keys = Object.keys(tokens);
    if (keys.length > MAX_TOKEN_KEYS_PER_REPORT) {
      throw new FakeHerdrError('invalid_metadata_token', `too many metadata tokens: ${keys.length}`);
    }
    for (const key of keys) if (!TOKEN_KEY_PATTERN.test(key)) throw new FakeHerdrError('invalid_metadata_token', `invalid metadata token key: ${key}`);
    return tokens;
  }

  private metadataTtl(params: Record<string, unknown>): number | undefined {
    const ttl = params['ttl_ms'];
    if (ttl === undefined || ttl === null) return undefined;
    if (typeof ttl !== 'number' || !Number.isInteger(ttl)) throw new InvalidRequestError('invalid request: invalid type for field `ttl_ms` at line 1 column 1');
    if (ttl < TTL_MS_MIN) throw new FakeHerdrError('invalid_metadata_ttl', 'metadata ttl_ms must be 1 or more');
    if (ttl > TTL_MS_MAX) throw new FakeHerdrError('invalid_metadata_ttl', `metadata ttl_ms must be ${TTL_MS_MAX} or less`);
    return ttl;
  }

  /**
   * The seq high-water rule (spike §4, finding 1): a report whose seq is <= the
   * mark for this (resource, source) is accepted with `ok` and silently NOT
   * applied. A report with no seq always applies.
   */
  private acceptSeq(resource: string, source: string, seq: unknown): boolean {
    if (seq === undefined || seq === null) return true;
    if (typeof seq !== 'number' || !Number.isInteger(seq)) throw new InvalidRequestError('invalid request: invalid type for field `seq` at line 1 column 1');
    const key = `${resource}|${source}`;
    const mark = this.seqHighWater.get(key);
    if (mark !== undefined && seq <= mark) return false;
    this.seqHighWater.set(key, seq);
    return true;
  }

  /** Apply a token patch: `null`/`""` clear, values truncate at 80, empty map removes `tokens`. */
  private applyTokens(target: { tokens?: Tokens }, resourceId: string, tokens: MetadataTokens, ttlMs?: number): boolean {
    let changed = false;
    const current: Tokens = { ...(target.tokens ?? {}) };
    for (const [key, raw] of Object.entries(tokens)) {
      this.clearTtl(resourceId, key);
      if (raw === null || raw === '') {
        if (key in current) {
          delete current[key];
          changed = true;
        }
        continue;
      }
      const value = String(raw).slice(0, TOKEN_VALUE_MAX_LENGTH);
      if (current[key] !== value) changed = true;
      current[key] = value;
      if (ttlMs !== undefined) this.scheduleTtl(resourceId, key, ttlMs);
    }
    if (Object.keys(current).length === 0) delete target.tokens;
    else target.tokens = current;
    return changed;
  }

  private clearTtl(resourceId: string, key: string): void {
    const t = this.ttlTimers.get(`${resourceId}|${key}`);
    if (t) {
      clearTimeout(t);
      this.ttlTimers.delete(`${resourceId}|${key}`);
    }
  }

  private scheduleTtl(resourceId: string, key: string, ttlMs: number): void {
    const timer = setTimeout(() => {
      this.ttlTimers.delete(`${resourceId}|${key}`);
      const ws = this.workspaces.get(resourceId);
      const pane = this.panes.get(resourceId);
      const target = ws ?? pane;
      if (!target?.tokens || !(key in target.tokens)) return;
      delete target.tokens[key];
      if (Object.keys(target.tokens).length === 0) delete target.tokens;
      if (ws) this.broadcast({ event: 'workspace_metadata_updated', data: { type: 'workspace_metadata_updated', workspace: clone(ws) } });
      if (pane) {
        pane.revision += 1;
        this.broadcast({ event: 'pane_updated', data: { type: 'pane_updated', pane: clone(pane) } });
      }
    }, ttlMs);
    timer.unref?.();
    this.ttlTimers.set(`${resourceId}|${key}`, timer);
  }

  /* ------------------------------------------------------------------ */
  /* Other handlers                                                      */
  /* ------------------------------------------------------------------ */

  private notificationShow(params: Record<string, unknown>): unknown {
    const title = this.str(params, 'title');
    if (title.trim() === '') throw new FakeHerdrError('invalid_params', 'notification title is empty');
    return { type: 'notification_show', shown: this.notificationMode === 'shown', reason: this.notificationMode };
  }

  private agentViewSet(params: Record<string, unknown>): unknown {
    const source = this.metadataSource(params);
    const pluginMatch = /^plugin:(.+)$/.exec(source);
    if (pluginMatch) {
      const id = pluginMatch[1];
      const plugin = this.plugins.find((p) => p.plugin_id === id);
      if (!plugin || !plugin.enabled) throw new FakeHerdrError('plugin_not_found', 'plugin not found');
    }
    const label = typeof params['label'] === 'string' ? params['label'] : null;
    this.agentView = { source, label, filter: params['filter'], sort: params['sort'] };
    return { type: 'agent_view', active: true, label, source };
  }

  private agentStart(params: Record<string, unknown>): unknown {
    const name = this.str(params, 'name');
    const kind = this.str(params, 'kind');
    const paneId = this.str(params, 'pane_id');
    const pane = this.requirePane(paneId);
    if (!/^[a-z][a-z0-9_-]{0,31}$/.test(name)) throw new FakeHerdrError('invalid_agent_name', `invalid agent name ${name}`);
    if (this.agentNames.has(name)) throw new FakeHerdrError('invalid_agent_name', `agent name ${name} already in use`);
    if (pane.agent) throw new FakeHerdrError('pane_busy', `pane ${paneId} already runs ${pane.agent}`);
    pane.agent = kind;
    pane.agent_status = 'unknown';
    pane.revision += 1;
    this.agentNames.set(name, paneId);
    this.stateChangeSeq += 1;
    const agent = { ...this.agentFor(pane, name), launch_pending: true };
    this.broadcast({ event: 'pane_updated', data: { type: 'pane_updated', pane: clone(pane) } });
    if (this.agentStartBehavior !== 'never') {
      const target: AgentStatus = this.agentStartBehavior === 'blocked' ? 'blocked' : 'idle';
      const t = setTimeout(() => {
        if (this.panes.get(paneId)?.agent === kind) this.setAgentStatus(paneId, target);
      }, this.startupDelayMs);
      t.unref?.();
    }
    const args = Array.isArray(params['args']) ? (params['args'] as string[]) : [];
    return { type: 'agent_started', agent: clone(agent), argv: args.length ? [kind, '--', ...args] : [kind] };
  }

  private paneSplit(params: Record<string, unknown>): unknown {
    const direction = this.str(params, 'direction');
    if (direction !== 'right' && direction !== 'down') throw new InvalidRequestError('invalid request: unknown variant `' + direction + '`, expected `right` or `down` at line 1 column 1');
    const targetPaneId = this.optStr(params, 'target_pane_id');
    const base = targetPaneId ? this.requirePane(targetPaneId) : this.panes.get(this.focusedPaneId() ?? '');
    const workspaceId = this.optStr(params, 'workspace_id') ?? base?.workspace_id;
    if (!workspaceId) throw new FakeHerdrError('workspace_not_found', 'workspace not found');
    const pane = this.addPane({
      workspace_id: workspaceId,
      tab_id: base?.tab_id,
      cwd: this.optStr(params, 'cwd') ?? base?.cwd ?? null,
      foreground_cwd: this.optStr(params, 'cwd') ?? base?.cwd ?? null,
      agent_status: 'unknown',
    });
    return { type: 'pane_split', pane: clone(pane) };
  }

  private worktreeList(params: Record<string, unknown>): unknown {
    const repo = this.resolveRepo(params);
    if (!repo) throw new FakeHerdrError('not_found', 'no repository for that workspace or cwd');
    return { type: 'worktree_list', source: clone(repo.source), worktrees: clone(repo.worktrees) };
  }

  private worktreeCreate(params: Record<string, unknown>): unknown {
    const repo = this.resolveRepo(params);
    if (!repo) throw new FakeHerdrError('not_found', 'no repository for that workspace or cwd');
    const branch = this.optStr(params, 'branch') ?? 'work';
    const wtPath = this.optStr(params, 'path') ?? path.join(repo.source.repo_root, '..', `${repo.source.repo_name}-${branch}`);
    const label = this.optStr(params, 'label') ?? branch;
    const ws = this.addWorkspace({ label, worktree: { repo_key: repo.source.repo_key, repo_name: repo.source.repo_name, repo_root: repo.source.repo_root, checkout_path: wtPath, is_linked_worktree: true } });
    const tab = this.tabs.get(ws.active_tab_id)!;
    const rootPane = this.addPane({ workspace_id: ws.workspace_id, cwd: wtPath, foreground_cwd: wtPath });
    const worktree: WorktreeInfo = {
      path: wtPath,
      branch,
      is_bare: false,
      is_detached: false,
      is_prunable: false,
      is_linked_worktree: true,
      open_workspace_id: ws.workspace_id,
      label,
    };
    repo.worktrees.push(worktree);
    this.broadcast({ event: 'worktree_created', data: { type: 'worktree_created', workspace: clone(ws), worktree: clone(worktree) } });
    return { type: 'worktree_created', workspace: clone(ws), tab: clone(tab), root_pane: clone(rootPane), worktree: clone(worktree) };
  }

  private worktreeOpen(params: Record<string, unknown>): unknown {
    const repo = this.resolveRepo(params);
    if (!repo) throw new FakeHerdrError('not_found', 'no repository for that workspace or cwd');
    const wanted = this.optStr(params, 'path');
    const branch = this.optStr(params, 'branch');
    const worktree = repo.worktrees.find((w) => (wanted ? w.path === wanted : branch ? w.branch === branch : false));
    if (!worktree) throw new FakeHerdrError('not_found', 'worktree not found');
    if (worktree.open_workspace_id) {
      const ws = this.requireWorkspace(worktree.open_workspace_id);
      const tab = this.tabs.get(ws.active_tab_id)!;
      const rootPane = [...this.panes.values()].find((p) => p.workspace_id === ws.workspace_id);
      return { type: 'worktree_opened', workspace: clone(ws), tab: clone(tab), root_pane: clone(rootPane), worktree: clone(worktree), already_open: true };
    }
    const ws = this.addWorkspace({ label: worktree.label });
    const tab = this.tabs.get(ws.active_tab_id)!;
    const rootPane = this.addPane({ workspace_id: ws.workspace_id, cwd: worktree.path, foreground_cwd: worktree.path });
    worktree.open_workspace_id = ws.workspace_id;
    this.broadcast({ event: 'worktree_opened', data: { type: 'worktree_opened', workspace: clone(ws), worktree: clone(worktree), already_open: false } });
    return { type: 'worktree_opened', workspace: clone(ws), tab: clone(tab), root_pane: clone(rootPane), worktree: clone(worktree), already_open: false };
  }

  private worktreeRemove(params: Record<string, unknown>): unknown {
    const workspaceId = this.str(params, 'workspace_id');
    const ws = this.requireWorkspace(workspaceId);
    let found: WorktreeInfo | undefined;
    let owner: WorktreeRepo | undefined;
    for (const repo of this.repos.values()) {
      const wt = repo.worktrees.find((w) => w.open_workspace_id === workspaceId);
      if (wt) {
        found = wt;
        owner = repo;
        break;
      }
    }
    if (!found || !owner) throw new FakeHerdrError('not_linked_worktree', `workspace ${workspaceId} is not a linked worktree`);
    const forced = params['force'] === true;
    if (this.dirtyWorktrees.has(found.path) && !forced) {
      throw new FakeHerdrError('dirty_worktree_requires_force', `fatal: '${found.path}' contains modified or untracked files, use --force to delete it`);
    }
    owner.worktrees.splice(owner.worktrees.indexOf(found), 1);
    for (const pane of [...this.panes.values()]) if (pane.workspace_id === workspaceId) this.closePane(pane.pane_id);
    this.closeWorkspace(workspaceId);
    this.broadcast({ event: 'worktree_removed', data: { type: 'worktree_removed', workspace_id: workspaceId, worktree: clone(found), forced, workspace: clone(ws) } });
    return { type: 'worktree_removed', workspace_id: workspaceId, path: found.path, forced };
  }

  private resolveRepo(params: Record<string, unknown>): WorktreeRepo | undefined {
    const workspaceId = this.optStr(params, 'workspace_id');
    if (workspaceId) {
      const ws = this.requireWorkspace(workspaceId);
      for (const repo of this.repos.values()) {
        if (ws.worktree?.repo_root === repo.source.repo_root) return repo;
        if (repo.source.source_workspace_id === workspaceId) return repo;
        if (repo.worktrees.some((w) => w.open_workspace_id === workspaceId)) return repo;
      }
      return undefined;
    }
    const cwd = this.optStr(params, 'cwd');
    if (!cwd) throw new FakeHerdrError('invalid_params', 'worktree methods need workspace_id or cwd');
    for (const repo of this.repos.values()) if (cwd === repo.source.repo_root || cwd.startsWith(repo.source.repo_root + path.sep)) return repo;
    return undefined;
  }

  /* ------------------------------------------------------------------ */
  /* Derived state and helpers                                           */
  /* ------------------------------------------------------------------ */

  private snapshot(): SessionSnapshot {
    return clone({
      version: this.version,
      protocol: this.protocol,
      focused_workspace_id: [...this.workspaces.values()].find((w) => w.focused)?.workspace_id ?? null,
      focused_tab_id: [...this.tabs.values()].find((t) => t.focused)?.tab_id ?? null,
      focused_pane_id: this.focusedPaneId() ?? null,
      workspaces: [...this.workspaces.values()],
      tabs: [...this.tabs.values()],
      panes: [...this.panes.values()],
      layouts: [],
      agents: this.agents(),
    });
  }

  private agents(): AgentInfo[] {
    const byPane = new Map<string, string>();
    for (const [name, paneId] of this.agentNames) byPane.set(paneId, name);
    return [...this.panes.values()].filter((p) => p.agent).map((p) => this.agentFor(p, byPane.get(p.pane_id)));
  }

  private agentFor(pane: PaneInfo, name?: string): AgentInfo {
    return {
      terminal_id: pane.terminal_id,
      pane_id: pane.pane_id,
      workspace_id: pane.workspace_id,
      tab_id: pane.tab_id,
      focused: pane.focused,
      agent_status: pane.agent_status,
      revision: pane.revision,
      state_change_seq: this.stateChangeSeq,
      ...(pane.agent ? { agent: pane.agent } : {}),
      ...(pane.agent_session ? { agent_session: pane.agent_session } : {}),
      ...(pane.terminal_title ? { terminal_title: pane.terminal_title } : {}),
      ...(pane.terminal_title_stripped ? { terminal_title_stripped: pane.terminal_title_stripped } : {}),
      ...(pane.cwd ? { cwd: pane.cwd } : {}),
      ...(pane.foreground_cwd ? { foreground_cwd: pane.foreground_cwd } : {}),
      ...(pane.tokens ? { tokens: { ...pane.tokens } } : {}),
      ...(name ? { name } : {}),
    };
  }

  /** `target` is a pane id or an agent name — never an agent kind. */
  private resolveAgent(target: string): AgentInfo | undefined {
    const paneId = this.panes.has(target) ? target : this.agentNames.get(target);
    if (!paneId) return undefined;
    const pane = this.panes.get(paneId);
    if (!pane?.agent) return undefined;
    return this.agentFor(pane, this.agentNames.has(target) ? target : undefined);
  }

  private resolveAgentOrThrow(target: string): AgentInfo {
    const agent = this.resolveAgent(target);
    if (!agent) throw new FakeHerdrError('agent_not_found', `agent target ${target} not found`);
    return agent;
  }

  private focusedPaneId(): string | undefined {
    return [...this.panes.values()].find((p) => p.focused)?.pane_id;
  }

  private requireWorkspace(id: string): WorkspaceInfo {
    const ws = this.workspaces.get(id);
    if (!ws) throw new FakeHerdrError('workspace_not_found', `workspace ${id} not found`);
    return ws;
  }

  private requirePane(id: string): PaneInfo {
    const pane = this.panes.get(id);
    if (!pane) throw new FakeHerdrError('pane_not_found', `pane ${id} not found`);
    return pane;
  }

  private str(params: Record<string, unknown>, field: string): string {
    const v = params[field];
    if (typeof v !== 'string') throw new InvalidRequestError(`invalid request: missing field \`${field}\` at line 1 column 1`);
    return v;
  }

  private optStr(params: Record<string, unknown>, field: string): string | undefined {
    const v = params[field];
    return typeof v === 'string' ? v : undefined;
  }
}

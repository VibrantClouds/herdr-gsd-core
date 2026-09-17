import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  loadConfig,
  readProjectSnapshot,
  diffSnapshots,
  resolveGsdTools,
  ThrottledRunner,
  tailSpool,
  rotateIfNeeded,
  readContextPercent,
  shortHash,
  DEFAULT_CONFIG_TOML,
  type ActivityEvent,
  type ChangeKey,
  type PluginConfig,
  type ProjectSnapshot,
  type SpoolTailState,
} from '@herdr-gsd/core';
import { HerdrClient, HerdrError, probeMethods, type AgentInfo, type AnyEventEnvelope, type PaneInfo, type SubscriptionHandle, type WorkspaceInfo } from '@herdr-gsd/herdr-client';
import { ActivityTracker, type ActivityView } from './activity';
import { BindingStore, findPlanningRoot, type Binding } from './bindings';
import { ControlError, ControlServer, type ControlConnection } from './control';
import { Logger } from './log';
import { Notifier } from './notifier';
import { daemonPaths, pluginEnv, type DaemonPaths, type PluginEnv } from './paths';
import { CLEARED_WORKSPACE_TOKENS, paneTitle, paneTokens, statusFromSnapshot, tokenDelta, workspaceTokens, type PaneTokens, type WorkspaceTokens } from './projection';
import { Orchestrator, RunStore, describeRun, type RunRecord, type RunUnit, type StartSpec } from './orchestration';
import type { ActivityPushEvent, AgentStatusEvent, ProjectDetail, ProjectSummary, PromptResult, RunChangedEvent, SnapshotChangedEvent, StatusResult } from './protocol';
import { SeqStore } from './seq';
import { recordCrash, writePid } from './supervise';
import { PlanningWatcher } from './watcher';

export const DAEMON_VERSION = '0.1.0';

/** Herdr socket methods the daemon needs (spec §2.3.6). M4-only methods are probed as optional. */
export const REQUIRED_METHODS = ['ping', 'session.snapshot', 'workspace.list', 'pane.list', 'agent.list', 'plugin.list', 'workspace.report_metadata', 'pane.report_metadata', 'notification.show', 'events.subscribe'];
export const OPTIONAL_METHODS = ['pane.process_info', 'agent.view.set', 'agent.view.clear', 'worktree.list', 'agent.prompt', 'agent.wait', 'agent.send_keys', 'agent.start', 'pane.split', 'pane.send_text', 'pane.close', 'worktree.create', 'worktree.open', 'worktree.remove'];

/** Harness kinds Herdr reports on `PaneInfo.agent` that can drive a GSD session. */
export const HARNESS_KINDS = new Set(['claude', 'codex', 'opencode', 'kilo', 'pi', 'kimi', 'copilot', 'cursor', 'droid', 'qwen', 'hermes', 'devin', 'gemini']);

const PANE_TTL_MS = 90_000;
const TOOL_TTL_MS = 15_000;
const HEARTBEAT_MS = 30_000;
const SPOOL_POLL_MS = 1_000;

interface ProjectState {
  root: string;
  snapshot?: ProjectSnapshot;
  previous?: ProjectSnapshot;
  watcher?: PlanningWatcher;
  tools?: ThrottledRunner;
  toolsSource?: string;
  activity: ActivityTracker;
  /** last workspace tokens per workspace id */
  wsTokens: Map<string, WorkspaceTokens>;
  /** last pane tokens for the driver pane */
  paneTokensLast?: PaneTokens & { gsd_tool: string | null };
  driverPaneId?: string;
  driverAgentStatus?: string;
  titleSet?: string;
  refreshing?: Promise<void>;
  dirty: boolean;
}

export interface DaemonOptions {
  env?: PluginEnv;
  paths?: DaemonPaths;
  /** override for tests */
  client?: HerdrClient;
  logToStderr?: boolean;
  heartbeatMs?: number;
  spoolPollMs?: number;
  watcherOptions?: { debounceMs?: number; forcePoll?: boolean };
  notifierOptions?: { coalesceMs?: number; retryMs?: number };
  /** skip gsd-tools resolution (filesystem-only mode; also used by fast tests) */
  disableTools?: boolean;
  now?: () => number;
  /** orchestrator test seams */
  orchestratorOptions?: { stallMs?: number; git?: import('./orchestration').GitExec };
}

export class Daemon {
  readonly env: PluginEnv;
  readonly paths: DaemonPaths;
  log: Logger;
  readonly startedAt: number;
  config!: PluginConfig;
  configWarnings: string[] = [];
  client!: HerdrClient;
  control!: ControlServer;
  seq!: SeqStore;
  bindings!: BindingStore;
  notifier!: Notifier;
  runs!: RunStore;
  orchestrator!: Orchestrator;
  projects = new Map<string, ProjectState>();
  /** workspace id → WorkspaceInfo, from the last resync + events */
  workspaces = new Map<string, WorkspaceInfo>();
  panes = new Map<string, PaneInfo>();
  agents = new Map<string, AgentInfo>();
  focusedPaneId?: string;
  herdrVersion?: string;
  herdrProtocol?: number;
  missingMethods: string[] = [];
  herdrConnected = false;
  viewApplied = false;
  lastError?: string;
  private subscription?: SubscriptionHandle;
  /**
   * Pane-scoped `pane.agent_status_changed` stream. Live probe (docs/spikes/M4-orchestration.md
   * H10): `pane.updated` does NOT carry agent-status transitions for Claude Code; only the
   * pane-scoped subscription does, and it needs every pane id up front, so it is rebuilt
   * whenever the set of agent panes changes.
   */
  private statusSub?: SubscriptionHandle;
  private statusSubKey = '';
  private statusSubTimer?: NodeJS.Timeout;
  private readonly statusSubscribed = new Set<string>();
  private heartbeat?: NodeJS.Timeout;
  private spoolTimer?: NodeJS.Timeout;
  private spoolState = new Map<string, SpoolTailState>();
  private spoolRoots = new Map<string, string | null>();
  private stopping = false;
  private readonly now: () => number;
  private readonly opts: DaemonOptions;
  private resyncing?: Promise<void>;
  private herdrFailures = 0;
  private stoppedResolve!: () => void;
  /** resolves once stop() has completed (used by `daemon run` to stay alive) */
  readonly whenStopped: Promise<void> = new Promise((r) => (this.stoppedResolve = r));
  private readyResolve!: () => void;
  /** resolves once start() finished its first resync (orchestrate.* requests wait for this) */
  readonly whenReady: Promise<void> = new Promise((r) => (this.readyResolve = r));

  constructor(opts: DaemonOptions = {}) {
    this.opts = opts;
    this.env = opts.env ?? pluginEnv();
    this.paths = opts.paths ?? daemonPaths(this.env.stateDir, this.env.herdrSocket);
    this.now = opts.now ?? Date.now;
    this.startedAt = this.now();
    fs.mkdirSync(this.paths.logDir, { recursive: true });
    this.log = new Logger({ file: this.paths.logFile, level: 'info', stderr: opts.logToStderr ?? false });
  }

  /* ------------------------------------------------------------------ */
  /* lifecycle                                                           */
  /* ------------------------------------------------------------------ */

  async start(): Promise<void> {
    const cfgFile = path.join(this.env.configDir, 'config.toml');
    const loaded = await loadConfig(cfgFile);
    this.config = loaded.config;
    this.configWarnings = loaded.warnings;
    if (loaded.missing) {
      try {
        fs.mkdirSync(this.env.configDir, { recursive: true });
        fs.writeFileSync(cfgFile, DEFAULT_CONFIG_TOML, { flag: 'wx' });
      } catch {
        /* config dir may be read-only */
      }
    }
    this.log = new Logger({ file: this.paths.logFile, level: this.config.log.level, stderr: this.opts.logToStderr ?? false });
    for (const w of this.configWarnings) this.log.warn(w);
    this.log.info(`gsdd ${DAEMON_VERSION} starting`, { pid: process.pid, socket: this.env.herdrSocket, state: this.paths.dir });

    fs.mkdirSync(this.paths.spoolDir, { recursive: true });
    this.seq = new SeqStore(this.paths.seqFile);
    await this.seq.load();
    this.bindings = new BindingStore(this.paths.bindingsFile);
    const { dropped } = await this.bindings.load();
    if (dropped.length) this.log.info('dropped stale bindings', dropped);
    this.runs = new RunStore(this.paths.orchestrationDir);
    const loadedRuns = await this.runs.load();
    if (loadedRuns.corrupt.length) this.log.warn('corrupt run records ignored', loadedRuns.corrupt);

    this.client =
      this.opts.client ??
      new HerdrClient({
        socketPath: this.env.herdrSocket,
        source: `plugin:${this.env.pluginId}`,
        timeoutMs: 5000,
        log: (level, msg, meta) => this.log.log(level, `herdr: ${msg}`, meta),
      });
    this.notifier = new Notifier({
      config: this.config.notify,
      show: async (p) => {
        const r = await this.client.notificationShow({ title: p.title, body: p.body, sound: p.sound });
        return { shown: r.shown, reason: r.reason ?? undefined };
      },
      isFocused: (root) => {
        const p = this.projects.get(root);
        return !!p?.driverPaneId && p.driverPaneId === this.focusedPaneId;
      },
      log: (m, d) => this.log.info(m, d),
      coalesceMs: this.opts.notifierOptions?.coalesceMs,
      retryMs: this.opts.notifierOptions?.retryMs,
    });

    this.orchestrator = new Orchestrator({
      client: this.client,
      config: () => this.config,
      store: this.runs,
      log: this.log,
      notify: (title, body, sound) => this.notifyRun(title, body, sound),
      now: this.now,
      project: (root) => {
        const p = this.projects.get(root);
        if (!p?.snapshot) return undefined;
        return { root, snapshot: p.snapshot, status: statusFromSnapshot(p.snapshot), driver: p.driverPaneId ? { paneId: p.driverPaneId, agentStatus: p.driverAgentStatus ?? 'unknown' } : undefined };
      },
      pane: (id) => this.panes.get(id),
      panesFor: (root) => {
        const ws = new Set(this.bindings.byRoot(root).map((b) => b.workspaceId));
        return [...this.panes.values()].filter((p) => ws.has(p.workspace_id));
      },
      missingMethods: () => this.missingMethods,
      onChange: (run) => this.control.broadcast('run.changed', { run } satisfies RunChangedEvent),
      statusStream: (paneId, agent) => this.refreshStatusSubscription({ immediate: true, ensurePane: { paneId, agent } }),
      git: this.opts.orchestratorOptions?.git,
      stallMs: this.opts.orchestratorOptions?.stallMs,
    });

    this.control = new ControlServer(this.paths.controlSocket);
    this.registerControl();
    await this.control.listen();
    writePid(this.paths.pidFile, process.pid);

    await this.probe();
    await this.resync('startup');
    if (this.herdrConnected) await this.orchestrator.reattach(this.startedAt).catch((e) => this.log.warn('run re-attach failed', (e as Error).message));
    this.openSubscription();
    this.refreshStatusSubscription();
    this.readyResolve();
    this.heartbeat = setInterval(() => void this.tick(), this.opts.heartbeatMs ?? HEARTBEAT_MS);
    this.spoolTimer = setInterval(() => void this.pollSpool(), this.opts.spoolPollMs ?? SPOOL_POLL_MS);
    this.log.info('gsdd ready', { projects: this.projects.size, bindings: this.bindings.all().length });
  }

  async stop(reason: string, clearTokens = true): Promise<void> {
    if (this.stopping) return;
    this.stopping = true;
    this.log.info(`gsdd stopping: ${reason}`);
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.spoolTimer) clearInterval(this.spoolTimer);
    if (this.statusSubTimer) clearTimeout(this.statusSubTimer);
    this.subscription?.close();
    this.statusSub?.close();
    for (const p of this.projects.values()) p.watcher?.stop();
    if (clearTokens && this.herdrConnected) {
      for (const p of this.projects.values()) {
        for (const wsId of p.wsTokens.keys()) await this.reportWorkspace(wsId, CLEARED_WORKSPACE_TOKENS).catch(() => undefined);
        if (p.driverPaneId) await this.reportPane(p.driverPaneId, { gsd_agent: null, gsd_workers: null, gsd_ctx: null, gsd_tool: null }, undefined).catch(() => undefined);
      }
    }
    await this.seq.flush().catch(() => undefined);
    await this.bindings.save().catch(() => undefined);
    await this.control.close().catch(() => undefined);
    try {
      fs.unlinkSync(this.paths.pidFile);
    } catch {
      /* none */
    }
    this.stoppedResolve();
  }

  private async probe(): Promise<void> {
    try {
      const r = await probeMethods(this.client, [...REQUIRED_METHODS, ...OPTIONAL_METHODS]);
      this.herdrVersion = r.version;
      this.herdrProtocol = r.protocol;
      this.herdrConnected = true;
      this.missingMethods = r.missing;
      const missingRequired = r.missing.filter((m) => REQUIRED_METHODS.includes(m));
      if (missingRequired.length) {
        this.lastError = `Herdr is missing required methods: ${missingRequired.join(', ')}`;
        this.log.error(this.lastError);
        await this.client.notificationShow({ title: 'GSD plugin: incompatible Herdr', body: this.lastError.slice(0, 240), sound: 'none' }).catch(() => undefined);
      } else if (r.missing.length) this.log.warn('optional Herdr methods missing', r.missing);
      this.log.info('herdr probe ok', { version: r.version, protocol: r.protocol });
    } catch (e) {
      this.herdrConnected = false;
      this.lastError = `Herdr probe failed: ${(e as Error).message}`;
      this.log.error(this.lastError);
    }
  }

  /* ------------------------------------------------------------------ */
  /* resync: session.snapshot → bindings → snapshots → tokens            */
  /* ------------------------------------------------------------------ */

  resync(reason: string): Promise<void> {
    if (this.resyncing) return this.resyncing;
    this.resyncing = this.doResync(reason).finally(() => (this.resyncing = undefined));
    return this.resyncing;
  }

  private async doResync(reason: string): Promise<void> {
    this.log.info(`resync (${reason})`);
    let snap;
    try {
      snap = await this.client.sessionSnapshot();
      this.herdrConnected = true;
      this.herdrFailures = 0;
    } catch (e) {
      this.herdrConnected = false;
      this.lastError = `session.snapshot failed: ${(e as Error).message}`;
      this.log.warn(this.lastError);
      return;
    }
    this.workspaces = new Map(snap.workspaces.map((w) => [w.workspace_id, w]));
    this.panes = new Map(snap.panes.map((p) => [p.pane_id, p]));
    this.agents = new Map(snap.agents.map((a) => [a.pane_id, a]));
    this.focusedPaneId = snap.focused_pane_id ?? undefined;
    await this.rebind();
    for (const wsId of this.bindings.all().map((b) => b.workspaceId)) {
      const p = this.projects.get(this.bindings.get(wsId)!.root);
      if (p) p.wsTokens.delete(wsId); // force full re-report with fresh seq
    }
    // Projects refresh concurrently: each one's filesystem pass reports tokens at once,
    // and one project's gsd-tools enrichment must never delay another's first tokens.
    await Promise.all(
      [...this.projects.values()].map(async (p) => {
        await this.refreshProject(p.root, true);
        await this.projectTokens(p, true);
      }),
    );
    await this.applyView();
    await this.bindings.save().catch((e) => this.log.warn('bindings save failed', e));
    this.refreshStatusSubscription();
  }

  /**
   * (Re)subscribe `pane.agent_status_changed` for every pane that hosts an agent.
   * Debounced and a no-op when the pane set is unchanged. Resolves once the new
   * stream is open (or immediately when nothing changed), so a caller that just
   * started an agent can wait for its status events to be live before prompting.
   */
  refreshStatusSubscription(opts: { immediate?: boolean; ensurePane?: { paneId: string; agent: string } } = {}): Promise<void> {
    if (this.stopping || this.missingMethods.includes('events.subscribe') || !this.herdrConnected) return Promise.resolve();
    if (opts.ensurePane) {
      const p = this.panes.get(opts.ensurePane.paneId);
      if (p && !p.agent) p.agent = opts.ensurePane.agent;
    }
    if (this.statusSubTimer) clearTimeout(this.statusSubTimer);
    return new Promise<void>((resolve) => {
      const apply = () => {
        this.statusSubTimer = undefined;
        const ids = [...this.panes.values()].filter((p) => p.agent).map((p) => p.pane_id).sort();
        const key = ids.join(',');
        if (key === this.statusSubKey) return resolve();
        this.statusSubKey = key;
        this.statusSub?.close();
        this.statusSub = undefined;
        this.statusSubscribed.clear();
        if (ids.length === 0) return resolve();
        for (const id of ids) this.statusSubscribed.add(id);
        let opened = false;
        this.statusSub = this.client.subscribeWithReconnect(
          ids.map((pane_id) => ({ type: 'pane.agent_status_changed' as const, pane_id })),
          {
            onEvent: (env) => void this.onPaneStatusEvent(env),
            onOpen: () => {
              if (!opened) {
                opened = true;
                resolve();
              }
            },
            onClose: (err) => {
              if (err) this.log.warn('status stream closed', err.message);
              if (!opened) resolve();
            },
            onGap: () => void this.resync('status stream gap'),
          },
        );
        this.log.debug('status subscription', { panes: ids });
      };
      if (opts.immediate) apply();
      else {
        this.statusSubTimer = setTimeout(apply, 50);
        this.statusSubTimer.unref?.();
      }
    });
  }

  private async onPaneStatusEvent(env: AnyEventEnvelope): Promise<void> {
    if (env.event !== 'pane.agent_status_changed') return;
    const data = env.data as { pane_id: string; workspace_id: string; agent_status: PaneInfo['agent_status']; agent?: string | null };
    const pane = this.panes.get(data.pane_id);
    if (!pane) {
      await this.rebindSoon();
      return;
    }
    const before = pane.agent_status;
    if (before === data.agent_status) return;
    pane.agent_status = data.agent_status;
    if (data.agent) pane.agent = data.agent;
    this.log.debug('agent status', { pane: pane.pane_id, from: before, to: data.agent_status });
    try {
      this.onAgentStatus(pane, before);
      await this.orchestrator.onPaneStatus(pane, before);
    } catch (e) {
      this.log.warn('status handling failed', { pane: pane.pane_id, error: (e as Error).message });
    }
  }

  /** Discover / refresh bindings for every known workspace (spec §4.1). */
  private async rebind(): Promise<void> {
    const seen = new Set<string>();
    /** workspaces that told us nothing this pass — their bindings are left alone */
    const silent = new Set<string>();
    for (const ws of this.workspaces.values()) {
      const { root, sawCwd } = await this.resolveWorkspace(ws);
      if (!root) {
        if (!sawCwd) silent.add(ws.workspace_id);
        continue;
      }
      seen.add(ws.workspace_id);
      const existing = this.bindings.get(ws.workspace_id);
      const via: Binding['via'] = ws.worktree?.checkout_path ? 'worktree' : 'pane_cwd';
      this.bindings.set({ workspaceId: ws.workspace_id, root, role: existing?.role ?? 'observer', driverPaneId: existing?.driverPaneId, via, updatedAt: this.now() });
    }
    // A binding that this pass did not re-affirm is gone, *including* one whose
    // workspace is still open in Herdr. Requiring the workspace to have vanished
    // too meant a workspace bound once — e.g. at `workspace.created`, before its
    // pane's shell had cd'd into the project — kept that root forever and went on
    // rendering another project's phase in its sidebar.
    for (const b of this.bindings.all()) {
      if (b.via === 'manual' || seen.has(b.workspaceId) || silent.has(b.workspaceId)) continue;
      this.bindings.delete(b.workspaceId);
      this.log.info('binding dropped', { workspaceId: b.workspaceId, root: b.root, stillOpen: this.workspaces.has(b.workspaceId) });
      const p = this.projects.get(b.root);
      p?.wsTokens.delete(b.workspaceId);
      if (this.workspaces.has(b.workspaceId)) await this.clearWorkspaceTokens(b.workspaceId);
    }
    await this.ensureProjectsForBindings();
    this.assignRoles();
  }

  /**
   * Workspace metadata is reported without a TTL (unlike pane metadata), so
   * Herdr keeps rendering whatever it was last told until something overwrites
   * it. Anything that stops owning a workspace must clear it explicitly.
   */
  private async clearWorkspaceTokens(workspaceId: string): Promise<void> {
    if (!this.herdrConnected) return;
    await this.reportWorkspace(workspaceId, CLEARED_WORKSPACE_TOKENS).catch((e) => this.log.warn('token clear failed', { workspaceId, error: (e as Error).message }));
  }

  /** Workspaces have no cwd (spike M0-H): derive from worktree checkout_path or the panes' cwd. */
  /**
   * `sawCwd` distinguishes the two ways this can fail to find a root, which the
   * prune in `rebind` must treat very differently:
   *   - the workspace reported directories and none is a GSD project → it has
   *     genuinely moved out of the tree, so the binding is wrong
   *   - the workspace reported no directory at all (its last pane just closed,
   *     or the panes have not reported a cwd yet) → no evidence either way, so
   *     the existing binding stands. Unbinding here would drop a project mid-run.
   */
  private async resolveWorkspace(ws: WorkspaceInfo): Promise<{ root?: string; sawCwd: boolean }> {
    const candidates: string[] = [];
    if (ws.worktree?.checkout_path) candidates.push(ws.worktree.checkout_path);
    // Ordered, not "whatever `this.panes` iterates first": the focused pane, then
    // the pane already known to drive this workspace, then the rest. Otherwise an
    // incidental pane parked in another project's tree decides for the workspace.
    const mine = [...this.panes.values()].filter((p) => p.workspace_id === ws.workspace_id);
    const driverPaneId = this.bindings.get(ws.workspace_id)?.driverPaneId;
    const rank = (p: PaneInfo): number => (p.pane_id === this.focusedPaneId ? 0 : p.pane_id === driverPaneId ? 1 : p.agent ? 2 : 3);
    for (const p of mine.sort((a, b) => rank(a) - rank(b))) {
      if (p.foreground_cwd) candidates.push(p.foreground_cwd);
      if (p.cwd) candidates.push(p.cwd);
    }
    const unique = [...new Set(candidates)];
    for (const c of unique) {
      const root = await findPlanningRoot(c);
      if (root) return { root, sawCwd: true };
    }
    return { sawCwd: unique.length > 0 };
  }

  private async ensureProjectsForBindings(): Promise<void> {
    const wanted = new Set(this.bindings.roots());
    for (const root of wanted) if (!this.projects.has(root)) await this.addProject(root);
    for (const [root, p] of this.projects) {
      if (!wanted.has(root)) {
        p.watcher?.stop();
        // Any workspace still showing this project's tokens must be cleared:
        // workspace metadata has no TTL, so it would otherwise stay on screen.
        for (const workspaceId of p.wsTokens.keys()) if (this.workspaces.has(workspaceId)) await this.clearWorkspaceTokens(workspaceId);
        if (p.driverPaneId) await this.reportPane(p.driverPaneId, { gsd_agent: null, gsd_workers: null, gsd_ctx: null, gsd_tool: null }, undefined).catch(() => undefined);
        this.projects.delete(root);
        this.log.info('project unbound', root);
      }
    }
  }

  private async addProject(root: string): Promise<ProjectState> {
    const state: ProjectState = { root, activity: new ActivityTracker({ toolTtlMs: TOOL_TTL_MS }), wsTokens: new Map(), dirty: true };
    this.projects.set(root, state);
    const loc = this.opts.disableTools ? undefined : await resolveGsdTools(root);
    if (loc) {
      state.tools = new ThrottledRunner(loc, root, 2000);
      state.toolsSource = loc.source;
    }
    const watcher = new PlanningWatcher(path.join(root, '.planning'), { debounceMs: this.opts.watcherOptions?.debounceMs ?? 300, forcePoll: this.opts.watcherOptions?.forcePoll });
    watcher.on('change', (files: string[]) => {
      this.log.debug('planning changed', { root, files: files.slice(0, 10) });
      void this.refreshProject(root, false).then(() => this.projectTokens(state, false));
    });
    watcher.on('watch-error', (e) => this.log.warn('watcher error, using polling', { root, error: String(e) }));
    watcher.start();
    state.watcher = watcher;
    this.log.info('project bound', { root, tools: state.toolsSource ?? 'none', watch: watcher.mode });
    return state;
  }

  /** Roles (spec §4.1.3): the workspace whose pane hosts a harness process is the driver. */
  private assignRoles(): void {
    for (const p of this.projects.values()) {
      const bound = this.bindings.byRoot(p.root);
      const lastSession = p.activity.snapshot(this.now()).lastSessionId;
      const lastPane = p.activity.snapshot(this.now()).lastPaneId;
      let driver: PaneInfo | undefined;
      const candidates = [...this.panes.values()].filter((pane) => bound.some((b) => b.workspaceId === pane.workspace_id));
      if (lastPane) driver = candidates.find((pane) => pane.pane_id === lastPane);
      if (!driver && lastSession) driver = candidates.find((pane) => pane.agent_session?.value === lastSession);
      if (!driver) {
        const withAgent = candidates.filter((pane) => pane.agent && HARNESS_KINDS.has(pane.agent));
        driver = withAgent.find((pane) => pane.agent_status === 'working' || pane.agent_status === 'blocked') ?? withAgent[0];
      }
      const previous = p.driverPaneId;
      p.driverPaneId = driver?.pane_id;
      p.driverAgentStatus = driver?.agent_status;
      for (const b of bound) {
        b.role = driver && b.workspaceId === driver.workspace_id ? 'driver' : 'observer';
        b.driverPaneId = b.role === 'driver' ? driver!.pane_id : undefined;
        this.bindings.set(b);
      }
      if (previous && previous !== p.driverPaneId) {
        void this.reportPane(previous, { gsd_agent: null, gsd_workers: null, gsd_ctx: null, gsd_tool: null }, undefined).catch(() => undefined);
        p.paneTokensLast = undefined;
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* project refresh + projection                                        */
  /* ------------------------------------------------------------------ */

  private async refreshProject(root: string, initial: boolean): Promise<void> {
    const p = this.projects.get(root);
    if (!p) return;
    if (p.refreshing) {
      p.dirty = true;
      return p.refreshing;
    }
    p.refreshing = (async () => {
      // Filesystem first (spec §2.3.2): tokens must appear within 2 s even when gsd-tools takes seconds.
      const passes: Array<ThrottledRunner | undefined> = p.tools && (initial || !p.snapshot) ? [undefined, p.tools] : [p.tools];
      do {
        p.dirty = false;
        for (const tools of passes) {
        let snap: ProjectSnapshot;
        try {
          snap = await readProjectSnapshot(root, { tools, previous: p.snapshot, now: this.now });
        } catch (e) {
          this.log.error('snapshot failed', { root, error: (e as Error).message });
          snap = { root, planningDir: path.join(root, '.planning'), observedAt: this.now(), health: 'parse_error', phases: p.snapshot?.phases ?? [], blockers: [], diagnostics: [String(e)] };
        }
        p.previous = p.snapshot;
        p.snapshot = snap;
        const keys: ChangeKey[] = p.previous ? diffSnapshots(p.previous, snap) : [];
        if (keys.length && !initial) {
          this.notifier.push({ root, project: snap.project?.name ?? path.basename(root), keys, before: p.previous, after: snap, next: nextOf(snap) });
        }
        if (keys.length || initial) {
          const ev: SnapshotChangedEvent = { root, keys, snapshot: snap, next: nextOf(snap), status: statusFromSnapshot(snap) };
          this.control.broadcast('snapshot.changed', ev);
          if (this.orchestrator) void this.orchestrator.onSnapshot(root, snap).catch((e) => this.log.warn('orchestrator snapshot hook failed', (e as Error).message));
        }
        if (snap.diagnostics?.length) this.log.debug('snapshot diagnostics', { root, diagnostics: snap.diagnostics.slice(0, 5) });
        if (passes.length > 1 && tools === undefined) await this.projectTokens(p, true);
        }
      } while (p.dirty);
    })().finally(() => (p.refreshing = undefined));
    return p.refreshing;
  }

  /** Report workspace tokens to every bound workspace and pane tokens to the driver pane. */
  private async projectTokens(p: ProjectState, force: boolean): Promise<void> {
    if (!p.snapshot || !this.herdrConnected) return;
    const snap = p.snapshot;
    let extraErr: string | undefined;
    if (!p.tools) extraErr = undefined; // filesystem-only is a supported mode (spec §2.3.2); not an error
    if (snap.health === 'ok' && (snap as ProjectSnapshot & { tools?: { available?: boolean; error?: string } }).tools?.available === false && p.tools) extraErr = 'gsd-tools failing';
    const tokens = workspaceTokens(snap, nextOf(snap), extraErr);
    for (const b of this.bindings.byRoot(p.root)) {
      const prev = p.wsTokens.get(b.workspaceId);
      const delta = force ? tokens : tokenDelta(prev, tokens);
      if (Object.keys(delta).length === 0) continue;
      try {
        await this.reportWorkspace(b.workspaceId, delta);
        p.wsTokens.set(b.workspaceId, tokens);
      } catch (e) {
        this.log.warn('workspace.report_metadata failed', { workspaceId: b.workspaceId, error: (e as Error).message });
      }
    }
    await this.driverPaneTokens(p, force);
  }

  private async driverPaneTokens(p: ProjectState, force: boolean): Promise<void> {
    if (!p.driverPaneId || !p.snapshot) return;
    const view = p.activity.snapshot(this.now());
    const ctx = view.lastSessionId && view.lastHarness === 'claude-code' ? await readContextPercent(view.lastSessionId).catch(() => undefined) : undefined;
    const base = paneTokens(view, ctx);
    const tokens = { ...base, gsd_tool: view.tool ?? null };
    const delta = force ? tokens : tokenDelta(p.paneTokensLast, tokens);
    if (Object.keys(delta).length === 0 && !force) return;
    try {
      await this.reportPane(p.driverPaneId, delta, p.titleSet === undefined ? this.titleFor(p) : undefined);
      p.paneTokensLast = tokens;
    } catch (e) {
      this.log.warn('pane.report_metadata failed', { paneId: p.driverPaneId, error: (e as Error).message });
    }
  }

  /** Title only if the pane has no user/other title (spec §3.3). */
  private titleFor(p: ProjectState): string | undefined {
    const pane = p.driverPaneId ? this.panes.get(p.driverPaneId) : undefined;
    if (!pane || !p.snapshot) return undefined;
    if (pane.title && !pane.title.startsWith('GSD ·')) return undefined;
    if (pane.label) return undefined;
    const t = paneTitle(p.snapshot);
    p.titleSet = t;
    return t;
  }

  private async reportWorkspace(workspaceId: string, tokens: Partial<WorkspaceTokens>): Promise<void> {
    await this.client.reportWorkspaceMetadata({ workspace_id: workspaceId, tokens: tokens as Record<string, string | null>, seq: this.seq.next(`workspace:${workspaceId}`) });
  }

  /** Two reports when both long-lived and short-lived tokens change (TTL is per report, spike M0-H). */
  private async reportPane(paneId: string, tokens: Partial<PaneTokens & { gsd_tool: string | null }>, title: string | undefined): Promise<void> {
    const { gsd_tool, ...longLived } = tokens;
    if (Object.keys(longLived).length || title !== undefined) {
      await this.client.reportPaneMetadata({ pane_id: paneId, tokens: longLived as Record<string, string | null>, ttl_ms: PANE_TTL_MS, seq: this.seq.next(`pane:${paneId}`), ...(title !== undefined ? { title } : {}) });
    }
    if (gsd_tool !== undefined) {
      await this.client.reportPaneMetadata({ pane_id: paneId, tokens: { gsd_tool }, ttl_ms: gsd_tool === null ? PANE_TTL_MS : TOOL_TTL_MS, seq: this.seq.next(`pane:${paneId}`) });
    }
  }

  private async applyView(): Promise<void> {
    if (!this.config.views.enabled || this.missingMethods.includes('agent.view.set')) {
      this.viewApplied = false;
      return;
    }
    try {
      await this.client.agentViewSet({
        label: 'gsd',
        filter: { op: 'any', filters: [{ op: 'exists', field: { token: 'gsd_phase' } }, { op: 'in', field: 'status', values: ['blocked', 'done'] }] },
        sort: [{ field: 'attention', order: 'desc' }, { field: { token: 'gsd_phase' }, order: 'asc' }, { field: 'state_change_seq', order: 'desc' }],
      });
      this.viewApplied = true;
      fs.writeFileSync(this.paths.viewFile, JSON.stringify({ label: 'gsd', appliedAt: this.now() }));
    } catch (e) {
      this.viewApplied = false;
      this.log.warn('agent.view.set failed', (e as Error).message);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Herdr events                                                        */
  /* ------------------------------------------------------------------ */

  private openSubscription(): void {
    if (this.missingMethods.includes('events.subscribe')) return;
    this.subscription = this.client.subscribeWithReconnect(
      [
        { type: 'workspace.created' },
        { type: 'workspace.updated' },
        { type: 'workspace.closed' },
        { type: 'workspace.focused' },
        { type: 'worktree.created' },
        { type: 'worktree.opened' },
        { type: 'worktree.removed' },
        { type: 'pane.created' },
        { type: 'pane.closed' },
        { type: 'pane.updated' },
        { type: 'pane.focused' },
        { type: 'pane.exited' },
        { type: 'pane.agent_detected' },
      ],
      {
        onEvent: (env) => void this.onHerdrEvent(env),
        onClose: (err) => {
          if (err) this.log.warn('event stream closed', err.message);
        },
        onGap: () => void this.resync('event gap'),
      },
    );
  }

  private async onHerdrEvent(env: AnyEventEnvelope): Promise<void> {
    if (env.event === 'pane.agent_status_changed') return this.onPaneStatusEvent(env);
    const name = String((env as { event: string }).event).replace(/_/g, '.');
    const data = (env as { data?: Record<string, unknown> }).data ?? {};
    const ws = data.workspace as WorkspaceInfo | undefined;
    const pane = data.pane as PaneInfo | undefined;
    try {
      if (name.startsWith('workspace.')) {
        if (name === 'workspace.closed') {
          const id = (ws?.workspace_id ?? data.workspace_id) as string | undefined;
          if (id) {
            this.workspaces.delete(id);
            for (const p of this.panes.values()) if (p.workspace_id === id) this.panes.delete(p.pane_id);
            this.bindings.delete(id);
            await this.ensureProjectsForBindings();
            await this.orchestrator.onWorkspaceGone(id);
          }
          return;
        }
        if (ws) this.workspaces.set(ws.workspace_id, ws);
        // A just-created workspace's pane still reports the cwd it was spawned
        // from — the shell has not cd'd yet — so binding on this event's own tick
        // attributes the new workspace to the *previous* project. Learn the
        // structure now, decide the binding on the debounced pass.
        if (name === 'workspace.created') {
          await this.resync(name);
          await this.rebindSoon();
        }
        return;
      }
      if (name.startsWith('worktree.')) {
        await this.resync(name);
        return;
      }
      if (name.startsWith('pane.')) {
        if (name === 'pane.closed' || name === 'pane.exited') {
          const id = (pane?.pane_id ?? data.pane_id) as string | undefined;
          if (id) {
            if (name === 'pane.closed') this.panes.delete(id);
            for (const p of this.projects.values()) if (p.driverPaneId === id) this.assignRoles();
            await this.orchestrator.onPaneGone(id);
            this.refreshStatusSubscription();
          }
          if (name === 'pane.closed') await this.rebindSoon();
          return;
        }
        if (!pane) return;
        const before = this.panes.get(pane.pane_id);
        // For panes on the dedicated status stream, `pane.updated` carries a possibly stale
        // agent_status (spike M4 H10): keep the streamed value.
        const merged = this.statusSubscribed.has(pane.pane_id) && before ? { ...pane, agent_status: before.agent_status } : pane;
        this.panes.set(pane.pane_id, merged);
        if (name === 'pane.focused' || pane.focused) this.focusedPaneId = pane.focused ? pane.pane_id : this.focusedPaneId;
        if (name === 'pane.created' || name === 'pane.agent_detected' || before?.cwd !== pane.cwd || before?.agent !== pane.agent) {
          await this.rebindSoon();
          this.refreshStatusSubscription();
        }
        if (!this.statusSubscribed.has(pane.pane_id) && before?.agent_status !== merged.agent_status) {
          this.onAgentStatus(merged, before?.agent_status);
          await this.orchestrator.onPaneStatus(merged, before?.agent_status);
        }
      }
    } catch (e) {
      this.log.warn('event handling failed', { event: name, error: (e as Error).message });
    }
  }

  private rebindTimer?: NodeJS.Timeout;
  private rebindSoon(): Promise<void> {
    return new Promise((resolve) => {
      if (this.rebindTimer) clearTimeout(this.rebindTimer);
      this.rebindTimer = setTimeout(() => {
        this.rebindTimer = undefined;
        void this.rebind()
          .then(async () => {
            for (const p of this.projects.values()) {
              if (!p.snapshot) await this.refreshProject(p.root, true);
              await this.projectTokens(p, false);
            }
          })
          .finally(resolve);
      }, 200);
    });
  }

  /** Herdr's own semantic status changed on a pane (spec §4.4 blocked notifications). */
  private onAgentStatus(pane: PaneInfo, previous: string | undefined): void {
    for (const p of this.projects.values()) {
      if (p.driverPaneId !== pane.pane_id) continue;
      p.driverAgentStatus = pane.agent_status;
      const ev: AgentStatusEvent = { root: p.root, paneId: pane.pane_id, status: pane.agent_status, previous };
      this.control.broadcast('agent.status', ev);
      if (pane.agent_status === 'blocked' && previous !== 'blocked' && p.snapshot) {
        void this.notifier.blocked(p.root, p.snapshot.project?.name ?? path.basename(p.root), p.snapshot, nextOf(p.snapshot));
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* activity spool                                                      */
  /* ------------------------------------------------------------------ */

  async pollSpool(): Promise<void> {
    let files: string[];
    try {
      files = fs.readdirSync(this.paths.spoolDir).filter((f) => f.endsWith('.jsonl'));
    } catch {
      return;
    }
    for (const f of files) {
      const file = path.join(this.paths.spoolDir, f);
      const state = this.spoolState.get(file) ?? { offset: 0 };
      const r = await tailSpool(file, state, this.now());
      this.spoolState.set(file, r.state);
      if (r.corrupt) this.log.warn('corrupt spool lines skipped', { file: f, count: r.corrupt });
      for (const ev of r.events) await this.onActivity(ev);
      if (await rotateIfNeeded(file)) this.spoolState.delete(file);
    }
  }

  private async onActivity(ev: ActivityEvent): Promise<void> {
    let root = this.spoolRoots.get(ev.cwd);
    if (root === undefined) {
      root = (await findPlanningRoot(ev.cwd)) ?? null;
      this.spoolRoots.set(ev.cwd, root);
    }
    if (!root) return;
    let p = this.projects.get(root);
    if (!p) {
      // activity from a project no workspace is bound to: bind by pane id if we can
      if (ev.paneId && this.panes.has(ev.paneId)) {
        const pane = this.panes.get(ev.paneId)!;
        this.bindings.set({ workspaceId: pane.workspace_id, root, role: 'driver', driverPaneId: pane.pane_id, via: 'event', updatedAt: this.now() });
        p = await this.addProject(root);
        await this.refreshProject(root, true);
      } else return;
    }
    p.activity.ingest(ev);
    if (ev.paneId && p.driverPaneId !== ev.paneId && this.panes.has(ev.paneId)) this.assignRoles();
    const push: ActivityPushEvent = { root, event: ev, view: p.activity.snapshot(this.now()) };
    this.control.broadcast('activity', push);
    await this.driverPaneTokens(p, false);
  }

  /* ------------------------------------------------------------------ */
  /* heartbeat                                                           */
  /* ------------------------------------------------------------------ */

  async tick(): Promise<void> {
    if (this.stopping) return;
    try {
      await this.client.ping();
      this.herdrConnected = true;
      this.herdrFailures = 0;
    } catch (e) {
      this.herdrConnected = false;
      this.herdrFailures++;
      this.log.warn('herdr ping failed', { attempt: this.herdrFailures, error: (e as Error).message });
      if (this.herdrFailures >= 2) {
        await this.stop('herdr socket gone', false);
        process.exit(0);
      }
      return;
    }
    try {
      const plugins = await this.client.pluginList();
      const me = plugins.find((pl) => pl.plugin_id === this.env.pluginId);
      if (plugins.length && me && !me.enabled) {
        await this.stop('plugin disabled', true);
        process.exit(0);
      }
      const warnings = (me as { warnings?: string[] } | undefined)?.warnings;
      if (warnings?.length) this.log.warn('plugin warnings from herdr', warnings);
    } catch {
      /* plugin.list may be unavailable outside a plugin context */
    }
    // refresh TTL'd pane tokens so they don't expire while activity is quiet but the session is alive
    for (const p of this.projects.values()) if (p.driverPaneId && p.paneTokensLast) await this.driverPaneTokens(p, true);
    await this.orchestrator.tick().catch((e) => this.log.warn('orchestrator tick failed', (e as Error).message));
  }

  /** Run notifications go straight out (not coalesced with change sets); `notify.sound = none` silences them. */
  private async notifyRun(title: string, body: string, sound: 'none' | 'done' | 'request'): Promise<void> {
    if (!this.herdrConnected) return;
    try {
      await this.client.notificationShow({ title, body, sound: this.config.notify.sound === 'none' ? 'none' : sound });
    } catch (e) {
      this.log.warn('run notification failed', (e as Error).message);
    }
  }

  /* ------------------------------------------------------------------ */
  /* control socket                                                      */
  /* ------------------------------------------------------------------ */

  /**
   * Project roots are keyed by the path Herdr reports for the pane, which is the
   * *real* path. Callers (CLI, dashboard, tests) may spell the same directory through
   * a symlink — macOS `/var/folders/…` → `/private/var/…`, `/tmp` → `/private/tmp`
   * (caught by CI on macos-latest) — so every incoming `root` is canonicalised.
   */
  private canonicalRoot(root: string): string {
    const resolved = path.resolve(root);
    if (this.projects.has(resolved)) return resolved;
    const realOf = (p: string): string => {
      try {
        return fs.realpathSync(p);
      } catch {
        return p;
      }
    };
    const real = realOf(resolved);
    if (this.projects.has(real)) return real;
    // stored keys are whatever path Herdr (or a test) reported, which may itself be a symlink spelling
    for (const key of this.projects.keys()) if (realOf(key) === real) return key;
    // no bound project matches: keep the caller's spelling (a manual bind stores what the user gave)
    return resolved;
  }

  private registerControl(): void {
    const c = this.control;
    // every handler sees params.root canonicalised (see canonicalRoot)
    const register = c.register.bind(c);
    c.register = (method, handler) =>
      register(method, (params, conn) => {
        if (params && typeof params === 'object' && typeof (params as { root?: unknown }).root === 'string') {
          params = { ...(params as Record<string, unknown>), root: this.canonicalRoot((params as { root: string }).root) };
        }
        return handler(params, conn);
      });
    c.register('ping', () => ({ pong: true, pid: process.pid, version: DAEMON_VERSION, uptimeMs: this.now() - this.startedAt }));
    c.register('status', () => this.status());
    c.register('projects.list', () => this.projectSummaries());
    c.register('project.get', (params) => {
      const q = (params ?? {}) as { root?: string; workspaceId?: string };
      const root = q.root ?? (q.workspaceId ? this.bindings.get(q.workspaceId)?.root : undefined) ?? [...this.projects.keys()][0];
      const p = root ? this.projects.get(root) : undefined;
      if (!p || !p.snapshot) throw new ControlError('not_found', `no project for ${q.root ?? q.workspaceId ?? '(none)'}`);
      return this.projectDetail(p);
    });
    c.register('project.rescan', async (params) => {
      const q = (params ?? {}) as { root?: string; workspaceId?: string };
      if (q.root && this.projects.has(q.root)) {
        await this.refreshProject(q.root, true);
        await this.projectTokens(this.projects.get(q.root)!, true);
        return { rescanned: [q.root] };
      }
      await this.resync('rescan');
      return { rescanned: [...this.projects.keys()] };
    });
    c.register('bindings.set', async (params) => {
      const q = (params ?? {}) as { workspaceId?: string; root?: string | null; role?: Binding['role'] };
      if (!q.workspaceId) throw new ControlError('invalid_params', 'workspaceId required');
      if (q.root === null) {
        this.bindings.delete(q.workspaceId);
        await this.ensureProjectsForBindings();
        await this.bindings.save();
        return null;
      }
      if (!q.root) throw new ControlError('invalid_params', 'root required');
      const root = path.resolve(q.root);
      if (!fs.existsSync(path.join(root, '.planning'))) throw new ControlError('not_found', `${root}/.planning does not exist`);
      const b: Binding = { workspaceId: q.workspaceId, root, role: q.role ?? 'observer', via: 'manual', updatedAt: this.now() };
      this.bindings.set(b);
      await this.ensureProjectsForBindings();
      await this.refreshProject(root, true);
      await this.projectTokens(this.projects.get(root)!, true);
      await this.bindings.save();
      return b;
    });
    c.register('notify.test', async (params) => {
      const q = (params ?? {}) as { root?: string; workspaceId?: string };
      const root = q.root ?? (q.workspaceId ? this.bindings.get(q.workspaceId)?.root : undefined) ?? [...this.projects.keys()][0];
      const p = root ? this.projects.get(root) : undefined;
      const name = p?.snapshot?.project?.name ?? (root ? path.basename(root) : 'no project');
      const r = await this.client.notificationShow({ title: `GSD · ${name}: test notification`, body: p?.snapshot ? `next: ${nextOf(p.snapshot) ?? '—'}` : 'gsdd is running', sound: this.config.notify.sound });
      return { shown: r.shown, reason: r.reason ?? undefined };
    });
    c.register('activity.recent', (params) => {
      const q = (params ?? {}) as { root?: string; limit?: number };
      const p = q.root ? this.projects.get(q.root) : undefined;
      if (!p) throw new ControlError('not_found', 'no such project');
      return p.activity.recent().slice(-(q.limit ?? 50));
    });
    c.register('prompt.send', (params) => this.promptSend((params ?? {}) as { root?: string; text?: string; confirm?: boolean }));
    const runSpec = (params: unknown): StartSpec => {
      const q = (params ?? {}) as { root?: string; workspaceId?: string; unit?: RunUnit; command?: string; phase?: string; from?: string; to?: string };
      const root = q.root ?? (q.workspaceId ? this.bindings.get(q.workspaceId)?.root : undefined) ?? [...this.projects.keys()][0];
      if (!root) throw new ControlError('not_found', 'no bound project');
      if (!q.unit || !['phase', 'phase-isolated', 'autonomous'].includes(q.unit)) throw new ControlError('invalid_params', 'unit must be phase | phase-isolated | autonomous');
      return { root, unit: q.unit, command: q.command, phase: q.phase, from: q.from, to: q.to };
    };
    c.register('orchestrate.plan', async (params) => {
      await this.whenReady;
      return this.orchestrator.plan(runSpec(params));
    });
    c.register('orchestrate.start', async (params) => {
      await this.whenReady;
      const spec = runSpec(params);
      if (!(params as { confirm?: boolean })?.confirm) throw new ControlError('confirm_required', 'orchestrate.start needs confirm: true');
      return this.orchestrator.start(spec);
    });
    c.register('orchestrate.stop', async (params) => {
      const q = (params ?? {}) as { runId?: string; root?: string; workspaceId?: string; discard?: boolean; all?: boolean };
      let ids: string[] = [];
      if (q.runId) ids = [q.runId];
      else {
        const root = q.root ?? (q.workspaceId ? this.bindings.get(q.workspaceId)?.root : undefined);
        const active = this.runs.active().filter((r) => !root || r.project === root || r.target.workspaceId === q.workspaceId);
        ids = (q.all ? active : active.slice(0, 1)).map((r) => r.id);
      }
      if (!ids.length) throw new ControlError('not_found', 'no active run');
      const results = [];
      for (const id of ids) results.push(await this.orchestrator.stop(id, { discard: q.discard }));
      return results;
    });
    c.register('orchestrate.list', (params) => {
      const q = (params ?? {}) as { root?: string; workspaceId?: string; active?: boolean };
      const root = q.root ?? (q.workspaceId ? this.bindings.get(q.workspaceId)?.root : undefined);
      const list = this.orchestrator.list(root);
      return q.active ? list.filter((r) => ['planned', 'starting', 'running', 'waiting'].includes(r.status)) : list;
    });
    c.register('orchestrate.get', (params) => {
      const q = (params ?? {}) as { runId?: string };
      const run = q.runId ? this.orchestrator.get(q.runId) : undefined;
      if (!run) throw new ControlError('not_found', `no run ${q.runId ?? ''}`);
      return run;
    });
    c.register('orchestrate.status', async (params) => {
      const q = (params ?? {}) as { workspaceId?: string; notify?: boolean };
      const active = this.runs.active();
      const lines = active.map(describeRun);
      if (q.notify) await this.notifyRun(`GSD runs: ${active.length} active`, lines.join('\n').slice(0, 240) || 'no active runs', 'none');
      return { active: active.length, runs: active };
    });
    c.register('shutdown', async () => {
      setTimeout(() => void this.stop('control shutdown', true).then(() => process.exit(0)), 10);
      return { ok: true };
    });
    c.on('connect', (conn: ControlConnection) => this.log.debug('control client connected', conn.id));
    c.on('subscribe', (conn: ControlConnection, events: string[]) => {
      if (events.includes('daemon.status') || events.includes('*')) conn.push('daemon.status', this.status());
    });
  }

  /** Dashboard [enter] (spec §6): only after confirmation, only to the driver pane, refuse when blocked. */
  private async promptSend(q: { root?: string; text?: string; confirm?: boolean }): Promise<PromptResult> {
    const p = q.root ? this.projects.get(q.root) : undefined;
    if (!p) return { sent: false, reason: 'error', message: 'no such project' };
    if (!q.confirm) return { sent: false, reason: 'confirm_required' };
    if (!p.driverPaneId) return { sent: false, reason: 'no_driver', message: 'no pane is running a harness for this project' };
    if (!q.text) return { sent: false, reason: 'error', message: 'text required' };
    const pane = this.panes.get(p.driverPaneId);
    if (pane?.agent_status === 'blocked') return { sent: false, reason: 'agent_blocked', message: 'driver agent is blocked; answer it first' };
    if (this.missingMethods.includes('agent.prompt')) return { sent: false, reason: 'error', message: 'agent.prompt unavailable' };
    try {
      await this.client.agentPrompt({ target: p.driverPaneId, text: q.text });
      return { sent: true, paneId: p.driverPaneId };
    } catch (e) {
      const err = e as HerdrError;
      if (err.code === 'agent_blocked') return { sent: false, reason: 'agent_blocked', message: err.message };
      return { sent: false, reason: 'error', message: err.message };
    }
  }

  status(): StatusResult {
    return {
      pid: process.pid,
      version: DAEMON_VERSION,
      startedAt: this.startedAt,
      herdr: { socket: this.env.herdrSocket, connected: this.herdrConnected, version: this.herdrVersion, protocol: this.herdrProtocol, missingMethods: this.missingMethods },
      gsdTools: { found: [...this.projects.values()].some((p) => !!p.tools), source: [...this.projects.values()].find((p) => p.toolsSource)?.toolsSource, version: [...this.projects.values()].find((p) => p.snapshot?.gsdVersion)?.snapshot?.gsdVersion },
      projects: this.projects.size,
      bindings: this.bindings.all(),
      notifications: { ...this.notifier.stats },
      watchers: [...this.projects.values()].map((p) => ({ root: p.root, mode: p.watcher?.mode ?? 'stopped' })),
      lastError: this.lastError,
      configWarnings: this.configWarnings,
      viewApplied: this.viewApplied,
      runs: { active: this.runs?.active().length ?? 0, total: this.runs?.all().length ?? 0 },
    };
  }

  projectSummaries(): ProjectSummary[] {
    return [...this.projects.values()].map((p) => ({
      root: p.root,
      name: p.snapshot?.project?.name ?? path.basename(p.root),
      health: p.snapshot?.health ?? 'parse_error',
      status: p.snapshot ? statusFromSnapshot(p.snapshot) : 'idle',
      phase: p.snapshot?.position?.phase ? `${p.snapshot.position.phase.number} ${p.snapshot.position.phase.slug}` : undefined,
      next: p.snapshot ? nextOf(p.snapshot) : undefined,
      workspaces: this.bindings.byRoot(p.root).map((b) => b.workspaceId),
      driverPaneId: p.driverPaneId,
      driverAgentStatus: p.driverAgentStatus,
      activeRun: this.runs.active().find((r) => r.project === p.root)?.id,
    }));
  }

  projectDetail(p: ProjectState): ProjectDetail {
    const view: ActivityView = p.activity.snapshot(this.now());
    return {
      root: p.root,
      snapshot: p.snapshot!,
      next: nextOf(p.snapshot!),
      status: statusFromSnapshot(p.snapshot!),
      activity: view,
      recent: p.activity.recent().slice(-30),
      bindings: this.bindings.byRoot(p.root),
      driverPaneId: p.driverPaneId,
      driverAgentStatus: p.driverAgentStatus,
      tokens: { workspace: (p.wsTokens.values().next().value as WorkspaceTokens | undefined) ?? workspaceTokens(p.snapshot!, nextOf(p.snapshot!)), pane: p.paneTokensLast },
      runs: this.runs.byProject(p.root).slice(0, 10),
      orchestration: { enabled: this.config.orchestration.enabled, harness: this.config.orchestration.harness },
    };
  }
}

function nextOf(snap: ProjectSnapshot): string | undefined {
  return (snap as ProjectSnapshot & { next?: { command?: string } }).next?.command;
}

/** Entry used by `herdr-gsd daemon run`. */
export async function runDaemon(opts: DaemonOptions = {}): Promise<Daemon> {
  const d = new Daemon(opts);
  const crashLog = path.join(d.paths.dir, 'gsdd.crashes.json');
  const onSignal = (sig: string) => {
    void d.stop(`signal ${sig}`, true).then(() => process.exit(0));
  };
  process.on('SIGTERM', () => onSignal('SIGTERM'));
  process.on('SIGINT', () => onSignal('SIGINT'));
  process.on('SIGHUP', () => onSignal('SIGHUP'));
  process.on('uncaughtException', (e) => {
    d.log.error('uncaught exception', e);
    recordCrash(crashLog);
    void d.stop('uncaught exception', false).then(() => process.exit(1));
  });
  process.on('unhandledRejection', (e) => {
    d.log.error('unhandled rejection', e instanceof Error ? e : new Error(String(e)));
  });
  try {
    await d.start();
  } catch (e) {
    d.log.error('startup failed', e instanceof Error ? e : new Error(String(e)));
    recordCrash(crashLog);
    await d.stop('startup failed', false);
    process.exit(1);
  }
  return d;
}

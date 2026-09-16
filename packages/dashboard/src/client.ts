import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ControlClient, daemonPaths, pluginEnv } from '@herdr-gsd/daemon';
import type { ActivityPushEvent, AgentStatusEvent, PlanResult, ProjectDetail, ProjectSummary, PromptResult, RunChangedEvent, RunRecord, RunUnit, SnapshotChangedEvent, StatusResult, StopResult } from '@herdr-gsd/daemon';

/**
 * Dashboard side of the gsdd control socket (spec §3.5 / §6).
 *
 * Owns: socket-path resolution from the plugin env, one `daemon ensure` spawn
 * when the socket is missing, the `projects.list` + `project.get` fetch, the
 * `subscribe` set, and reconnect-with-backoff so the pane survives a daemon
 * restart (M3 acceptance criterion).
 */
export interface DashboardClientOptions {
  /** explicit `--socket <path>` override */
  socketPath?: string;
  env?: NodeJS.ProcessEnv;
  /** plugin checkout root, used to locate the CLI for `daemon ensure` */
  pluginRoot?: string;
  backoffMinMs?: number;
  backoffMaxMs?: number;
  requestTimeoutMs?: number;
  /** when false, never spawn `daemon ensure` (tests) */
  autoEnsure?: boolean;
  /** test seam replacing the `daemon ensure` spawn */
  ensureFn?: (socketPath: string) => void;
}

/** `--socket` wins; otherwise HERDR_PLUGIN_STATE_DIR + HERDR_SOCKET_PATH (paths.ts). */
export function resolveControlSocket(override?: string, env: NodeJS.ProcessEnv = process.env): string {
  if (override) return path.resolve(override);
  const pe = pluginEnv(env);
  return daemonPaths(pe.stateDir, pe.herdrSocket).controlSocket;
}

const SUBSCRIBED_EVENTS = ['snapshot.changed', 'activity', 'agent.status', 'daemon.status', 'run.changed'] as const;

export class DashboardClient extends EventEmitter {
  readonly socketPath: string;
  private client?: ControlClient;
  private timer?: NodeJS.Timeout;
  private backoff: number;
  private readonly backoffMin: number;
  private readonly backoffMax: number;
  private readonly requestTimeoutMs: number;
  private readonly autoEnsure: boolean;
  private readonly ensureFn: (socketPath: string) => void;
  private readonly pluginRoot: string;
  private ensured = false;
  private stopped = false;
  private details: ProjectDetail[] = [];
  private inflight = new Set<string>();

  connected = false;
  lastUpdateAt?: number;
  lastError?: string;
  daemonStatus?: StatusResult;

  constructor(opts: DashboardClientOptions = {}) {
    super();
    const env = opts.env ?? process.env;
    this.socketPath = resolveControlSocket(opts.socketPath, env);
    this.pluginRoot = opts.pluginRoot ?? pluginEnv(env).pluginRoot;
    this.backoffMin = opts.backoffMinMs ?? 500;
    this.backoffMax = opts.backoffMaxMs ?? 5000;
    this.backoff = this.backoffMin;
    this.requestTimeoutMs = opts.requestTimeoutMs ?? 5000;
    this.autoEnsure = opts.autoEnsure ?? true;
    this.ensureFn = opts.ensureFn ?? ((p) => this.spawnEnsure(p));
  }

  /** Current projects, in `projects.list` order. */
  get projects(): ProjectDetail[] {
    return this.details;
  }

  /** Subscribe to any state change; returns an unsubscribe function. */
  onChange(cb: () => void): () => void {
    this.on('change', cb);
    return () => this.off('change', cb);
  }

  /** Connect (retrying in the background on failure). Resolves after the first attempt. */
  async start(): Promise<void> {
    this.stopped = false;
    await this.attempt();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.client?.removeAllListeners();
    this.client?.close();
    this.client = undefined;
    this.connected = false;
  }

  /** Raw control request against the live connection. */
  async request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.client || !this.client.connected) throw new Error('not connected');
    return this.client.request<T>(method, params);
  }

  async rescan(root?: string): Promise<void> {
    await this.request('project.rescan', root ? { root } : {});
  }

  async notifyTest(root?: string): Promise<{ shown: boolean; reason?: string }> {
    return this.request('notify.test', root ? { root } : {});
  }

  /** `[enter]` path: always sends `confirm: true` (the pane asks y/N first). */
  async sendPrompt(root: string, text: string): Promise<PromptResult> {
    return this.request<PromptResult>('prompt.send', { root, text, confirm: true });
  }

  /** M4: plan a run (never starts anything). */
  async planRun(root: string, unit: RunUnit): Promise<PlanResult> {
    return this.request<PlanResult>('orchestrate.plan', { root, unit });
  }

  /** M4: start a run; the pane asks y/N first, so `confirm: true` always. */
  async startRun(root: string, unit: RunUnit): Promise<{ run?: RunRecord; plan: PlanResult }> {
    return this.request<{ run?: RunRecord; plan: PlanResult }>('orchestrate.start', { root, unit, confirm: true });
  }

  async stopRun(runId: string, discard = false): Promise<StopResult[]> {
    return this.request<StopResult[]>('orchestrate.stop', { runId, discard });
  }

  private async attempt(): Promise<void> {
    if (this.stopped) return;
    if (!fs.existsSync(this.socketPath) && this.autoEnsure && !this.ensured) {
      this.ensured = true;
      try {
        this.ensureFn(this.socketPath);
      } catch {
        /* the daemon may simply not be installed yet; keep retrying */
      }
    }
    const client = new ControlClient(this.socketPath, { timeoutMs: this.requestTimeoutMs });
    try {
      await client.connect();
    } catch (e) {
      client.removeAllListeners();
      client.close();
      this.lastError = e instanceof Error ? e.message : String(e);
      this.setConnected(false);
      this.scheduleRetry();
      return;
    }
    this.client = client;
    this.backoff = this.backoffMin;
    client.on('close', () => {
      if (this.client !== client) return;
      this.client = undefined;
      this.setConnected(false);
      this.scheduleRetry();
    });
    client.on('event', (name: string, params: unknown) => this.onEvent(name, params));
    try {
      await client.subscribe([...SUBSCRIBED_EVENTS]);
      await this.refresh();
      this.lastError = undefined;
      this.setConnected(true);
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
      this.emit('change');
    }
  }

  private scheduleRetry(): void {
    if (this.stopped || this.timer) return;
    const delay = this.backoff;
    this.backoff = Math.min(this.backoff * 2, this.backoffMax);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.attempt();
    }, delay);
    this.timer.unref?.();
  }

  private setConnected(v: boolean): void {
    this.connected = v;
    if (!v) this.details = [];
    this.emit('change');
  }

  /** `projects.list` then one `project.get` per root. */
  async refresh(): Promise<void> {
    const list = await this.request<ProjectSummary[]>('projects.list', {});
    const next: ProjectDetail[] = [];
    for (const s of list ?? []) {
      try {
        next.push(await this.request<ProjectDetail>('project.get', { root: s.root }));
      } catch {
        /* a project can vanish between list and get */
      }
    }
    this.details = next;
    this.touch();
  }

  private touch(): void {
    this.lastUpdateAt = Date.now();
    this.emit('change');
  }

  private onEvent(name: string, params: unknown): void {
    switch (name) {
      case 'snapshot.changed': {
        const p = params as SnapshotChangedEvent;
        if (p?.root) void this.refetch(p.root);
        break;
      }
      case 'activity': {
        const p = params as ActivityPushEvent;
        const d = this.details.find((x) => x.root === p?.root);
        if (d) {
          d.activity = p.view;
          d.recent = [...d.recent.filter((e) => e.ts !== p.event.ts || e.kind !== p.event.kind), p.event].slice(-50);
          this.touch();
        }
        break;
      }
      case 'agent.status': {
        const p = params as AgentStatusEvent;
        const d = this.details.find((x) => x.root === p?.root);
        if (d) {
          d.driverPaneId = p.paneId;
          d.driverAgentStatus = p.status;
          this.touch();
        }
        break;
      }
      case 'daemon.status': {
        this.daemonStatus = params as StatusResult;
        this.touch();
        break;
      }
      case 'run.changed': {
        const p = params as RunChangedEvent;
        const d = this.details.find((x) => x.root === p?.run?.project);
        if (d) {
          const runs = (d.runs ?? []).filter((r) => r.id !== p.run.id);
          d.runs = [p.run, ...runs].sort((a, b) => b.startedAt - a.startedAt).slice(0, 10);
          this.touch();
        }
        break;
      }
      default:
        break;
    }
  }

  /** Re-fetch one project (coalesced per root). */
  private async refetch(root: string): Promise<void> {
    if (this.inflight.has(root)) return;
    this.inflight.add(root);
    try {
      const detail = await this.request<ProjectDetail>('project.get', { root });
      const i = this.details.findIndex((d) => d.root === root);
      if (i >= 0) this.details[i] = detail;
      else this.details.push(detail);
      this.touch();
    } catch {
      /* transient: the next event or reconnect resyncs */
    } finally {
      this.inflight.delete(root);
    }
  }

  private spawnEnsure(_socketPath: string): void {
    const main = path.join(this.pluginRoot, 'packages', 'cli', 'dist', 'main.js');
    if (!fs.existsSync(main)) return;
    const child = spawn(process.execPath, [main, 'daemon', 'ensure'], { detached: true, stdio: 'ignore' });
    child.on('error', () => undefined);
    child.unref();
  }
}

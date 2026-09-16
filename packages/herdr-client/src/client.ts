import * as net from 'node:net';
import {
  AgentInfo,
  AgentInfoResult,
  AgentListResult,
  AgentPromptParams,
  AgentPromptedResult,
  AgentReadParams,
  AgentStartParams,
  AgentStartedResult,
  AgentStatus,
  AgentViewResult,
  AgentViewSetParams,
  AnyEventEnvelope,
  EventsSubscribeParams,
  MetadataTokens,
  MAX_TOKEN_KEYS_PER_REPORT,
  NOTIFICATION_BODY_MAX_LENGTH,
  NOTIFICATION_TITLE_MAX_LENGTH,
  NotificationShowParams,
  NotificationShowResult,
  OkResult,
  PaneInfo,
  PaneInfoResult,
  PaneListResult,
  PaneProcessInfo,
  PaneProcessInfoResult,
  PaneReadParams,
  PaneReadResult,
  PaneReadResultEnvelope,
  PaneReportMetadataParams,
  PaneSplitParams,
  PaneSplitResult,
  PingResult,
  PluginInfo,
  PluginListResult,
  SessionSnapshot,
  SessionSnapshotResult,
  SubscriptionSpec,
  TOKEN_KEY_PATTERN,
  TOKEN_VALUE_MAX_LENGTH,
  WorkspaceInfo,
  WorkspaceInfoResult,
  WorkspaceListResult,
  WorkspaceReportMetadataParams,
  WorktreeCreateParams,
  WorktreeCreatedResult,
  WorktreeListParams,
  WorktreeListResult,
  WorktreeOpenParams,
  WorktreeOpenedResult,
  WorktreeRemoveParams,
  WorktreeRemovedResult,
} from './types';

/**
 * Client-side deadline added on top of a server-side wait (`agent.wait`,
 * `agent.prompt{wait}`, `agent.start`) and used alone for `worktree.*`, which
 * run git server-side (spike M4: seconds, not milliseconds).
 */
export const LONG_CALL_GRACE_MS = 60_000;

/** Any failure talking to Herdr, including locally-detected ones. */
export class HerdrError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HerdrError';
  }
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogFn = (level: LogLevel, message: string, meta?: Record<string, unknown>) => void;

export interface HerdrClientOptions {
  socketPath: string;
  /** Metadata source stamped on every report, e.g. `plugin:herdr-gsd-core`. */
  source: string;
  /** Per-request deadline. Default 5000 ms. */
  timeoutMs?: number;
  log?: LogFn;
}

export interface SubscriptionHandlers {
  onEvent: (envelope: AnyEventEnvelope) => void;
  /** Called once when the stream ends; `err` is set for an abnormal end. */
  onClose?: (err?: HerdrError) => void;
}

export interface ReconnectingSubscriptionHandlers extends SubscriptionHandlers {
  /**
   * Called after every successful *re*-subscription. There is no replay, so
   * events between the disconnect and this call are lost: resync from
   * `session.snapshot`.
   */
  onGap?: () => void;
  /** Called after every successful subscription, including the first (the stream is live from here). */
  onOpen?: () => void;
}

export interface SubscriptionHandle {
  close(): void;
}

export interface ReconnectOptions {
  /** First retry delay. Default 250 ms. */
  initialBackoffMs?: number;
  /** Retry delay ceiling. Default 5000 ms. */
  maxBackoffMs?: number;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** Map a socket-level failure onto a `HerdrError`. */
function mapSocketError(err: NodeJS.ErrnoException): HerdrError {
  if (err.code === 'ECONNREFUSED' || err.code === 'ENOENT') {
    return new HerdrError('socket_unavailable', `herdr socket unavailable (${err.code}): ${err.message}`);
  }
  return new HerdrError('socket_error', err.message);
}

/**
 * Parse one response line into a result, or throw the mapped error.
 * Deserialization failures answer with `id: ""`, so the id is never trusted.
 */
export function parseResponseLine<R>(line: string): R {
  let msg: unknown;
  try {
    msg = JSON.parse(line);
  } catch {
    throw new HerdrError('bad_response', `herdr sent invalid JSON: ${line.slice(0, 200)}`);
  }
  if (!isRecord(msg)) throw new HerdrError('bad_response', 'herdr sent a non-object response');
  const err = msg['error'];
  if (isRecord(err)) {
    const code = typeof err['code'] === 'string' ? err['code'] : 'unknown_error';
    const message = typeof err['message'] === 'string' ? err['message'] : 'herdr error';
    throw new HerdrError(code, message);
  }
  if (!('result' in msg)) throw new HerdrError('bad_response', 'herdr response had neither result nor error');
  return msg['result'] as R;
}

/** Split a growing buffer into complete NDJSON lines. */
export class LineSplitter {
  private buf = '';
  constructor(private readonly maxLineBytes = 8 * 1024 * 1024) {}
  push(chunk: string): string[] {
    this.buf += chunk;
    const out: string[] = [];
    let nl: number;
    while ((nl = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, nl);
      this.buf = this.buf.slice(nl + 1);
      if (line.trim()) out.push(line);
    }
    if (this.buf.length > this.maxLineBytes) throw new HerdrError('bad_response', 'herdr response line too large');
    return out;
  }
}

/** Truncate to `max` characters, marking the cut with a trailing `…` inside the limit. */
export function clampValue(value: string, max: number): string {
  if (value.length <= max) return value;
  if (max <= 1) return value.slice(0, max);
  return value.slice(0, max - 1) + '…';
}

/**
 * Validate token keys and clamp values before they reach Herdr. The server
 * rejects bad keys with `invalid_metadata_token` but silently truncates long
 * values, so clamping locally is the only way to keep the projection honest.
 */
export function normalizeTokens(tokens: MetadataTokens): MetadataTokens {
  const keys = Object.keys(tokens);
  if (keys.length > MAX_TOKEN_KEYS_PER_REPORT) {
    throw new HerdrError('invalid_metadata_token', `too many metadata tokens in one report: ${keys.length} > ${MAX_TOKEN_KEYS_PER_REPORT}`);
  }
  const out: MetadataTokens = {};
  for (const key of keys) {
    if (!TOKEN_KEY_PATTERN.test(key)) {
      throw new HerdrError('invalid_metadata_token', `invalid metadata token key: ${key}`);
    }
    const value = tokens[key];
    out[key] = value === null || value === undefined ? null : clampValue(String(value), TOKEN_VALUE_MAX_LENGTH);
  }
  return out;
}

/**
 * Herdr 0.9.0 client.
 *
 * Transport is **connection-per-request**: the server answers one request and
 * closes (spike §1.1). Only `events.subscribe` keeps a connection open, so
 * there is exactly one long-lived socket per subscription and one short-lived
 * socket per call. Do not add id-keyed multiplexing.
 */
export class HerdrClient {
  readonly socketPath: string;
  readonly source: string;
  readonly timeoutMs: number;
  private readonly log: LogFn;
  private nextId = 1;

  constructor(opts: HerdrClientOptions) {
    this.socketPath = opts.socketPath;
    this.source = opts.source;
    this.timeoutMs = opts.timeoutMs ?? 5000;
    this.log = opts.log ?? (() => undefined);
  }

  private newId(prefix = 'req'): string {
    return `${prefix}_${process.pid.toString(36)}_${(this.nextId++).toString(36)}`;
  }

  /** One request, one connection, one response line. */
  call<R = unknown>(method: string, params: unknown = {}, opts: { timeoutMs?: number } = {}): Promise<R> {
    const timeoutMs = opts.timeoutMs ?? this.timeoutMs;
    return new Promise<R>((resolve, reject) => {
      const id = this.newId();
      const sock = net.createConnection(this.socketPath);
      const splitter = new LineSplitter();
      let settled = false;
      const finish = (err?: HerdrError, value?: R): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        sock.destroy();
        if (err) reject(err);
        else resolve(value as R);
      };
      const timer = setTimeout(() => {
        this.log('warn', 'herdr call timed out', { method, timeoutMs });
        finish(new HerdrError('timeout', `herdr call ${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      timer.unref?.();

      sock.setEncoding('utf8');
      sock.on('error', (e: NodeJS.ErrnoException) => finish(mapSocketError(e)));
      sock.on('connect', () => {
        sock.write(JSON.stringify({ id, method, params }) + '\n');
      });
      sock.on('data', (chunk: string) => {
        let lines: string[];
        try {
          lines = splitter.push(chunk);
        } catch (e) {
          finish(e as HerdrError);
          return;
        }
        const line = lines[0];
        if (line === undefined) return;
        try {
          finish(undefined, parseResponseLine<R>(line));
        } catch (e) {
          finish(e instanceof HerdrError ? e : new HerdrError('bad_response', String(e)));
        }
      });
      sock.on('close', () => finish(new HerdrError('connection_closed', `herdr closed the connection before answering ${method}`)));
    });
  }

  /* ------------------------------------------------------------------ */
  /* Events                                                              */
  /* ------------------------------------------------------------------ */

  /**
   * Open the single long-lived connection, subscribe, then stream envelopes.
   * Resolves once the server answers `subscription_started`.
   */
  subscribe(subscriptions: SubscriptionSpec[], handlers: SubscriptionHandlers): Promise<SubscriptionHandle> {
    return new Promise<SubscriptionHandle>((resolve, reject) => {
      const id = this.newId('sub');
      const sock = net.createConnection(this.socketPath);
      const splitter = new LineSplitter();
      let started = false;
      let closed = false;
      const startTimer = setTimeout(() => {
        if (started) return;
        sock.destroy();
        reject(new HerdrError('timeout', 'events.subscribe timed out'));
      }, this.timeoutMs);
      startTimer.unref?.();

      const fail = (err: HerdrError): void => {
        if (closed) return;
        closed = true;
        clearTimeout(startTimer);
        sock.destroy();
        if (started) handlers.onClose?.(err);
        else reject(err);
      };

      sock.setEncoding('utf8');
      sock.on('error', (e: NodeJS.ErrnoException) => fail(mapSocketError(e)));
      sock.on('close', () => {
        if (closed) return;
        closed = true;
        clearTimeout(startTimer);
        if (started) handlers.onClose?.();
        else reject(new HerdrError('connection_closed', 'herdr closed the subscription connection'));
      });
      sock.on('connect', () => {
        const params: EventsSubscribeParams = { subscriptions };
        sock.write(JSON.stringify({ id, method: 'events.subscribe', params }) + '\n');
      });
      sock.on('data', (chunk: string) => {
        let lines: string[];
        try {
          lines = splitter.push(chunk);
        } catch (e) {
          fail(e as HerdrError);
          return;
        }
        for (const line of lines) {
          if (!started) {
            try {
              parseResponseLine(line);
            } catch (e) {
              fail(e instanceof HerdrError ? e : new HerdrError('bad_response', String(e)));
              return;
            }
            started = true;
            clearTimeout(startTimer);
            resolve({
              close: () => {
                if (closed) return;
                closed = true;
                sock.destroy();
                handlers.onClose?.();
              },
            });
            continue;
          }
          let msg: unknown;
          try {
            msg = JSON.parse(line);
          } catch {
            this.log('warn', 'dropping unparseable event line', { line: line.slice(0, 200) });
            continue;
          }
          if (isRecord(msg) && typeof msg['event'] === 'string' && 'data' in msg) {
            handlers.onEvent(msg as unknown as AnyEventEnvelope);
          } else {
            this.log('debug', 'ignoring non-event frame on subscription connection');
          }
        }
      });
    });
  }

  /**
   * `subscribe` that re-subscribes on any disconnect with 250 ms → 5 s backoff
   * until `close()`. `onGap` fires after each successful re-subscription: no
   * replay exists, so the caller must resync.
   */
  subscribeWithReconnect(
    subscriptions: SubscriptionSpec[],
    handlers: ReconnectingSubscriptionHandlers,
    opts: ReconnectOptions = {},
  ): SubscriptionHandle {
    const initial = opts.initialBackoffMs ?? 250;
    const max = opts.maxBackoffMs ?? 5000;
    let stopped = false;
    let current: SubscriptionHandle | undefined;
    let timer: NodeJS.Timeout | undefined;
    let backoff = initial;
    let attempts = 0;

    const scheduleRetry = (): void => {
      if (stopped) return;
      const delay = backoff;
      backoff = Math.min(backoff * 2, max);
      timer = setTimeout(() => {
        timer = undefined;
        void attempt();
      }, delay);
      timer.unref?.();
    };

    const attempt = async (): Promise<void> => {
      if (stopped) return;
      attempts += 1;
      try {
        current = await this.subscribe(subscriptions, {
          onEvent: handlers.onEvent,
          onClose: (err) => {
            current = undefined;
            if (stopped) {
              handlers.onClose?.(err);
              return;
            }
            this.log('warn', 'herdr subscription dropped; reconnecting', { code: err?.code });
            scheduleRetry();
          },
        });
        if (stopped) {
          current.close();
          return;
        }
        backoff = initial;
        handlers.onOpen?.();
        if (attempts > 1) handlers.onGap?.();
      } catch (err) {
        if (stopped) return;
        this.log('warn', 'herdr subscribe failed; retrying', { code: err instanceof HerdrError ? err.code : 'unknown' });
        scheduleRetry();
      }
    };

    void attempt();

    return {
      close: () => {
        if (stopped) return;
        stopped = true;
        if (timer) clearTimeout(timer);
        timer = undefined;
        current?.close();
        current = undefined;
      },
    };
  }

  /* ------------------------------------------------------------------ */
  /* Read wrappers                                                       */
  /* ------------------------------------------------------------------ */

  async ping(): Promise<PingResult> {
    return this.call<PingResult>('ping', {});
  }

  async sessionSnapshot(): Promise<SessionSnapshot> {
    return (await this.call<SessionSnapshotResult>('session.snapshot', {})).snapshot;
  }

  async workspaceList(): Promise<WorkspaceInfo[]> {
    return (await this.call<WorkspaceListResult>('workspace.list', {})).workspaces;
  }

  async workspaceGet(workspaceId: string): Promise<WorkspaceInfo> {
    return (await this.call<WorkspaceInfoResult>('workspace.get', { workspace_id: workspaceId })).workspace;
  }

  async paneList(workspaceId?: string): Promise<PaneInfo[]> {
    return (await this.call<PaneListResult>('pane.list', workspaceId ? { workspace_id: workspaceId } : {})).panes;
  }

  async paneGet(paneId: string): Promise<PaneInfo> {
    return (await this.call<PaneInfoResult>('pane.get', { pane_id: paneId })).pane;
  }

  async paneRead(params: PaneReadParams): Promise<PaneReadResult> {
    return (await this.call<PaneReadResultEnvelope>('pane.read', params)).read;
  }

  async agentList(): Promise<AgentInfo[]> {
    return (await this.call<AgentListResult>('agent.list', {})).agents;
  }

  /** `target` is a pane id or a live agent name — an agent *kind* is `agent_not_found`. */
  async agentGet(target: string): Promise<AgentInfo> {
    return (await this.call<AgentInfoResult>('agent.get', { target })).agent;
  }

  async paneProcessInfo(paneId?: string): Promise<PaneProcessInfo> {
    return (await this.call<PaneProcessInfoResult>('pane.process_info', paneId ? { pane_id: paneId } : {})).process_info;
  }

  async pluginList(pluginId?: string): Promise<PluginInfo[]> {
    return (await this.call<PluginListResult>('plugin.list', pluginId ? { plugin_id: pluginId } : {})).plugins;
  }

  /** Repo-scoped: pass a workspace id or a cwd inside the repo, never nothing. */
  async worktreeList(root: string | WorktreeListParams): Promise<WorktreeListResult> {
    const params: WorktreeListParams = typeof root === 'string' ? { cwd: root } : root;
    return this.call<WorktreeListResult>('worktree.list', params);
  }

  /* ------------------------------------------------------------------ */
  /* Metadata (presentation only — never lifecycle authority)            */
  /* ------------------------------------------------------------------ */

  /**
   * `workspace.report_metadata`. Keys are validated, values clamped to 80
   * chars, `source` stamped from options, `seq` passed through untouched
   * (Herdr silently drops seq <= its per-(resource, source) high-water mark).
   */
  async reportWorkspaceMetadata(input: Omit<WorkspaceReportMetadataParams, 'source'>): Promise<OkResult> {
    const params: WorkspaceReportMetadataParams = {
      ...input,
      tokens: normalizeTokens(input.tokens),
      source: this.source,
    };
    return this.call<OkResult>('workspace.report_metadata', params);
  }

  /** `pane.report_metadata`. Same validation rules as the workspace variant. */
  async reportPaneMetadata(input: Omit<PaneReportMetadataParams, 'source'>): Promise<OkResult> {
    const params: PaneReportMetadataParams = { ...input, source: this.source };
    if (input.tokens) params.tokens = normalizeTokens(input.tokens);
    return this.call<OkResult>('pane.report_metadata', params);
  }

  /* ------------------------------------------------------------------ */
  /* Presentation and views                                              */
  /* ------------------------------------------------------------------ */

  /** Title clamped to 80, body to 240. `shown:false` carries a `reason`. */
  async notificationShow(params: NotificationShowParams): Promise<NotificationShowResult> {
    const out: NotificationShowParams = { ...params, title: clampValue(params.title, NOTIFICATION_TITLE_MAX_LENGTH) };
    if (typeof params.body === 'string') out.body = clampValue(params.body, NOTIFICATION_BODY_MAX_LENGTH);
    return this.call<NotificationShowResult>('notification.show', out);
  }

  /** Rejected with `plugin_not_found` until the plugin is linked and enabled. */
  async agentViewSet(params: Omit<AgentViewSetParams, 'source'>): Promise<AgentViewResult> {
    return this.call<AgentViewResult>('agent.view.set', { ...params, source: this.source });
  }

  async agentViewClear(): Promise<AgentViewResult> {
    return this.call<AgentViewResult>('agent.view.clear', { source: this.source });
  }

  /* ------------------------------------------------------------------ */
  /* Orchestration                                                       */
  /* ------------------------------------------------------------------ */

  /** Returns `agent_blocked` *without sending input* if the target is already blocked. */
  async agentPrompt(params: AgentPromptParams): Promise<AgentPromptedResult> {
    const serverWait = params.wait?.timeout_ms ?? undefined;
    return this.call<AgentPromptedResult>('agent.prompt', params, { timeoutMs: params.wait ? (serverWait ?? 0) + LONG_CALL_GRACE_MS : LONG_CALL_GRACE_MS });
  }

  /** Default `until` is `[idle, done, blocked]`; returns immediately if already matching. */
  async agentWait(target: string, until?: AgentStatus[], timeoutMs?: number): Promise<AgentInfoResult> {
    const params: Record<string, unknown> = { target };
    if (until) params['until'] = until;
    if (timeoutMs !== undefined) params['timeout_ms'] = timeoutMs;
    return this.call<AgentInfoResult>('agent.wait', params, { timeoutMs: (timeoutMs ?? 0) + LONG_CALL_GRACE_MS });
  }

  async agentSendKeys(target: string, keys: string[]): Promise<OkResult> {
    return this.call<OkResult>('agent.send_keys', { target, keys });
  }

  /** Requires a pane that already exists and sits at its shell prompt. */
  async agentStart(params: AgentStartParams): Promise<AgentStartedResult> {
    return this.call<AgentStartedResult>('agent.start', params, { timeoutMs: (params.timeout_ms ?? 30_000) + LONG_CALL_GRACE_MS });
  }

  /** `agent.read` — same sources as `pane.read`, addressed by agent target. */
  async agentRead(params: AgentReadParams): Promise<PaneReadResult> {
    return (await this.call<PaneReadResultEnvelope>('agent.read', params)).read;
  }

  async paneSendText(paneId: string, text: string): Promise<OkResult> {
    return this.call<OkResult>('pane.send_text', { pane_id: paneId, text });
  }

  /** Only `right` and `down` exist. */
  async paneSplit(params: PaneSplitParams): Promise<PaneInfo> {
    return (await this.call<PaneSplitResult>('pane.split', params)).pane;
  }

  async paneClose(paneId: string): Promise<OkResult> {
    return this.call<OkResult>('pane.close', { pane_id: paneId });
  }

  /** Runs `git worktree add` server-side; can take seconds on a large repo. */
  async worktreeCreate(params: WorktreeCreateParams): Promise<WorktreeCreatedResult> {
    return this.call<WorktreeCreatedResult>('worktree.create', params, { timeoutMs: LONG_CALL_GRACE_MS });
  }

  async worktreeOpen(params: WorktreeOpenParams): Promise<WorktreeOpenedResult> {
    return this.call<WorktreeOpenedResult>('worktree.open', params, { timeoutMs: LONG_CALL_GRACE_MS });
  }

  /** Addressed by workspace id: only a worktree Herdr has open can be removed. */
  async worktreeRemove(params: WorktreeRemoveParams): Promise<WorktreeRemovedResult> {
    return this.call<WorktreeRemovedResult>('worktree.remove', params, { timeoutMs: LONG_CALL_GRACE_MS });
  }
}

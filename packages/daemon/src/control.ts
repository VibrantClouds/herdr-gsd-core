import * as net from 'node:net';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { EventEmitter } from 'node:events';

/**
 * gsdd control socket (spec §3.5): NDJSON over a Unix socket, same envelope
 * shape as Herdr. Request `{id, method, params}`; response `{id, ok, result}`
 * or `{id, ok:false, error:{code,message}}`; server-push `{event, params}`.
 */
export interface ControlRequest {
  id: number | string;
  method: string;
  params?: unknown;
}
export interface ControlOk {
  id: number | string;
  ok: true;
  result: unknown;
}
export interface ControlErr {
  id: number | string;
  ok: false;
  error: { code: string; message: string };
}
export interface ControlPush {
  event: string;
  params: unknown;
}
export type ControlResponse = ControlOk | ControlErr;

export class ControlError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ControlError';
  }
}

export type Handler = (params: unknown, conn: ControlConnection) => Promise<unknown> | unknown;

export class ControlConnection {
  readonly subscriptions = new Set<string>();
  constructor(
    readonly socket: net.Socket,
    readonly id: number,
  ) {}
  push(event: string, params: unknown): void {
    if (this.socket.destroyed) return;
    this.socket.write(JSON.stringify({ event, params } satisfies ControlPush) + '\n');
  }
}

export class ControlServer extends EventEmitter {
  private server?: net.Server;
  private conns = new Set<ControlConnection>();
  private handlers = new Map<string, Handler>();
  private nextConnId = 1;

  constructor(readonly socketPath: string) {
    super();
  }

  register(method: string, handler: Handler): this {
    this.handlers.set(method, handler);
    return this;
  }

  methods(): string[] {
    return [...this.handlers.keys()];
  }

  async listen(): Promise<void> {
    await fs.mkdir(path.dirname(this.socketPath), { recursive: true });
    try {
      await fs.unlink(this.socketPath);
    } catch {
      /* none */
    }
    this.server = net.createServer((sock) => this.accept(sock));
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(this.socketPath, () => {
        this.server!.off('error', reject);
        resolve();
      });
    });
    await fs.chmod(this.socketPath, 0o600).catch(() => undefined);
  }

  /** Broadcast to every connection subscribed to `event` (or to all when `all`). */
  broadcast(event: string, params: unknown, all = false): void {
    for (const c of this.conns) if (all || c.subscriptions.has(event) || c.subscriptions.has('*')) c.push(event, params);
  }

  connectionCount(): number {
    return this.conns.size;
  }

  async close(): Promise<void> {
    for (const c of this.conns) c.socket.destroy();
    this.conns.clear();
    if (this.server) {
      await new Promise<void>((r) => this.server!.close(() => r()));
      this.server = undefined;
    }
    await fs.unlink(this.socketPath).catch(() => undefined);
  }

  private accept(sock: net.Socket): void {
    const conn = new ControlConnection(sock, this.nextConnId++);
    this.conns.add(conn);
    let buf = '';
    sock.setEncoding('utf8');
    sock.on('data', (chunk: string) => {
      buf += chunk;
      if (buf.length > 1_000_000) {
        sock.destroy();
        return;
      }
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (line.trim()) void this.dispatch(conn, line);
      }
    });
    sock.on('error', () => undefined);
    sock.on('close', () => {
      this.conns.delete(conn);
      this.emit('disconnect', conn);
    });
    this.emit('connect', conn);
  }

  private async dispatch(conn: ControlConnection, line: string): Promise<void> {
    let req: ControlRequest;
    try {
      req = JSON.parse(line) as ControlRequest;
    } catch {
      conn.socket.write(JSON.stringify({ id: null, ok: false, error: { code: 'bad_json', message: 'invalid JSON' } }) + '\n');
      return;
    }
    if (typeof req !== 'object' || req === null || typeof req.method !== 'string') {
      conn.socket.write(JSON.stringify({ id: (req as ControlRequest)?.id ?? null, ok: false, error: { code: 'bad_request', message: 'missing method' } }) + '\n');
      return;
    }
    const send = (msg: ControlResponse) => {
      if (!conn.socket.destroyed) conn.socket.write(JSON.stringify(msg) + '\n');
    };
    if (req.method === 'subscribe') {
      const events = (req.params as { events?: string[] } | undefined)?.events ?? ['*'];
      for (const e of events) conn.subscriptions.add(e);
      send({ id: req.id, ok: true, result: { subscribed: [...conn.subscriptions] } });
      this.emit('subscribe', conn, events);
      return;
    }
    const h = this.handlers.get(req.method);
    if (!h) {
      send({ id: req.id, ok: false, error: { code: 'unknown_method', message: `unknown method ${req.method}` } });
      return;
    }
    try {
      const result = await h(req.params, conn);
      send({ id: req.id, ok: true, result: result ?? null });
    } catch (e) {
      const err = e instanceof ControlError ? e : new ControlError('internal', e instanceof Error ? e.message : String(e));
      send({ id: req.id, ok: false, error: { code: err.code, message: err.message } });
    }
  }
}

export interface ControlClientOptions {
  timeoutMs?: number;
}

/** Client side used by the CLI and dashboard. */
export class ControlClient extends EventEmitter {
  private sock?: net.Socket;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  private buf = '';
  private readonly timeoutMs: number;

  constructor(
    readonly socketPath: string,
    opts: ControlClientOptions = {},
  ) {
    super();
    this.timeoutMs = opts.timeoutMs ?? 5000;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const sock = net.createConnection(this.socketPath);
      sock.setEncoding('utf8');
      const onErr = (e: Error) => reject(e);
      sock.once('error', onErr);
      sock.once('connect', () => {
        sock.off('error', onErr);
        sock.on('error', (e) => this.failAll(e));
        sock.on('close', () => {
          this.failAll(new Error('control socket closed'));
          this.emit('close');
        });
        sock.on('data', (chunk: string) => this.onData(chunk));
        this.sock = sock;
        resolve();
      });
    });
  }

  get connected(): boolean {
    return !!this.sock && !this.sock.destroyed;
  }

  request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.sock || this.sock.destroyed) return Promise.reject(new ControlError('not_connected', 'not connected'));
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new ControlError('timeout', `${method} timed out`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      this.sock!.write(JSON.stringify({ id, method, params } satisfies ControlRequest) + '\n');
    });
  }

  subscribe(events: string[]): Promise<unknown> {
    return this.request('subscribe', { events });
  }

  close(): void {
    this.sock?.destroy();
    this.sock = undefined;
  }

  private onData(chunk: string): void {
    this.buf += chunk;
    let nl;
    while ((nl = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, nl);
      this.buf = this.buf.slice(nl + 1);
      if (!line.trim()) continue;
      let msg: ControlResponse | ControlPush;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      if ('event' in msg) {
        this.emit('event', msg.event, msg.params);
        this.emit(`event:${msg.event}`, msg.params);
        continue;
      }
      const p = this.pending.get(msg.id as number);
      if (!p) continue;
      this.pending.delete(msg.id as number);
      clearTimeout(p.timer);
      if (msg.ok) p.resolve(msg.result);
      else p.reject(new ControlError(msg.error.code, msg.error.message));
    }
  }

  private failAll(e: Error): void {
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(e);
      this.pending.delete(id);
    }
  }
}

/** One-shot: connect, request, close. */
export async function controlCall<T = unknown>(socketPath: string, method: string, params?: unknown, timeoutMs = 5000): Promise<T> {
  const c = new ControlClient(socketPath, { timeoutMs });
  await c.connect();
  try {
    return await c.request<T>(method, params);
  } finally {
    c.close();
  }
}

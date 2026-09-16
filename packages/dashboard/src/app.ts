import type { PromptResult, RunUnit } from '@herdr-gsd/daemon';
import type { DashboardClient } from './client';
import { renderFrame, type DashboardSize, type DashboardState } from './render';

/**
 * The pane loop (spec §6): raw-mode stdin, alt screen, at most 4 Hz redraws,
 * and the key table. The terminal is restored on every exit path.
 */
const ESC = '\u001b';
const ALT_ON = `${ESC}[?1049h`;
const ALT_OFF = `${ESC}[?1049l`;
const CURSOR_HIDE = `${ESC}[?25l`;
const CURSOR_SHOW = `${ESC}[?25h`;
const HOME = `${ESC}[H`;
const CLEAR = `${ESC}[2J`;
const CLEAR_EOL = `${ESC}[K`;

export interface AppOptions {
  client: DashboardClient;
  stdin?: NodeJS.ReadStream;
  stdout?: NodeJS.WriteStream;
  colors?: boolean;
  /** minimum ms between redraws (4 Hz default) */
  frameIntervalMs?: number;
  now?: () => number;
  onExit?: (code: number) => void;
}

export class DashboardApp {
  private readonly client: DashboardClient;
  private readonly stdin: NodeJS.ReadStream;
  private readonly stdout: NodeJS.WriteStream;
  private readonly colors: boolean;
  private readonly frameIntervalMs: number;
  private readonly now: () => number;
  private readonly onExit: (code: number) => void;

  private selected = 0;
  private message?: DashboardState['message'];
  private confirmPending?: { text: string; root: string; command: string } | { text: string; root: string; unit: RunUnit } | { text: string; runId: string };
  private lastFrameAt = 0;
  private frameTimer?: NodeJS.Timeout;
  private running = false;
  private restored = false;
  private unsubscribe?: () => void;
  private readonly onData = (chunk: string | Buffer) => this.handleKey(chunk.toString());
  private readonly onResize = () => this.render();
  private readonly onProcessExit = () => this.restore();
  private readonly onSignal = () => this.quit(0);

  constructor(opts: AppOptions) {
    this.client = opts.client;
    this.stdin = opts.stdin ?? process.stdin;
    this.stdout = opts.stdout ?? process.stdout;
    this.colors = opts.colors ?? true;
    this.frameIntervalMs = opts.frameIntervalMs ?? 250;
    this.now = opts.now ?? (() => Date.now());
    this.onExit = opts.onExit ?? ((code) => process.exit(code));
  }

  size(): DashboardSize {
    return { cols: this.stdout.columns ?? 80, rows: this.stdout.rows ?? 24 };
  }

  state(): DashboardState {
    const projects = this.client.projects;
    if (this.selected >= projects.length) this.selected = Math.max(0, projects.length - 1);
    return {
      connected: this.client.connected,
      projects,
      selected: this.selected,
      lastUpdateAt: this.client.lastUpdateAt,
      message: this.message,
      confirmPending: this.confirmPending ? { text: this.confirmPending.text } : undefined,
      now: this.now(),
    };
  }

  async start(): Promise<void> {
    this.running = true;
    this.stdout.write(ALT_ON + CURSOR_HIDE + CLEAR);
    if (this.stdin.isTTY) this.stdin.setRawMode?.(true);
    this.stdin.resume();
    this.stdin.setEncoding?.('utf8');
    this.stdin.on('data', this.onData);
    this.stdout.on?.('resize', this.onResize);
    process.on('exit', this.onProcessExit);
    process.on('SIGINT', this.onSignal);
    process.on('SIGTERM', this.onSignal);
    process.on('uncaughtException', this.onFatal);
    process.on('unhandledRejection', this.onFatal);
    this.unsubscribe = this.client.onChange(() => this.scheduleRender());
    this.render();
    await this.client.start();
    this.scheduleRender();
  }

  private readonly onFatal = (err: unknown) => {
    this.restore();
    process.stderr.write(`gsd dashboard: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
    this.onExit(1);
  };

  /** Coalesced redraw, at most once per `frameIntervalMs`. */
  scheduleRender(): void {
    if (!this.running) return;
    const since = this.now() - this.lastFrameAt;
    if (since >= this.frameIntervalMs) {
      this.render();
      return;
    }
    if (this.frameTimer) return;
    this.frameTimer = setTimeout(() => {
      this.frameTimer = undefined;
      this.render();
    }, this.frameIntervalMs - since);
    this.frameTimer.unref?.();
  }

  render(): void {
    this.lastFrameAt = this.now();
    const rows = renderFrame(this.state(), this.size(), { colors: this.colors });
    this.stdout.write(HOME + rows.map((r) => r + CLEAR_EOL).join('\r\n'));
  }

  handleKey(key: string): void {
    if (!key) return;
    // Ctrl-C always quits, even at a y/N prompt.
    if (key.includes('\u0003')) {
      this.quit(0);
      return;
    }
    // a single read can carry several keystrokes; escape sequences stay whole
    if (key.length > 1 && !key.startsWith(ESC)) {
      for (const ch of key) this.handleKey(ch);
      return;
    }
    if (this.confirmPending) {
      const pending = this.confirmPending;
      this.confirmPending = undefined;
      if (key === 'y' || key === 'Y') {
        if ('command' in pending) void this.sendPrompt(pending.root, pending.command);
        else if ('unit' in pending) void this.startRun(pending.root, pending.unit);
        else void this.stopRun(pending.runId);
      } else this.setMessage('cancelled', 'info');
      return;
    }
    switch (key) {
      case 'q':
      case '\u0003':
        this.quit(0);
        return;
      case 'r':
        void this.run('rescan', () => this.client.rescan(this.currentRoot()));
        return;
      case 'n':
        void this.run('notify test sent', () => this.client.notifyTest(this.currentRoot()));
        return;
      case '\t':
        if (this.client.projects.length > 1) {
          this.selected = (this.selected + 1) % this.client.projects.length;
          this.message = undefined;
          this.scheduleRender();
        }
        return;
      case '\r':
      case '\n':
        this.askConfirm();
        return;
      case 'o':
        void this.askRun('phase');
        return;
      case 'w':
        void this.askRun('phase-isolated');
        return;
      case 'a':
        void this.askRun('autonomous');
        return;
      case 'x':
        this.askStop();
        return;
      default:
        return;
    }
  }

  private currentProject() {
    return this.client.projects[this.selected];
  }

  private currentRoot(): string | undefined {
    return this.currentProject()?.root;
  }

  private askConfirm(): void {
    const p = this.currentProject();
    if (!p) return;
    const next = p.next ?? p.snapshot.next?.command;
    if (!next) {
      this.setMessage('no recommended next command', 'info');
      return;
    }
    const command = next.startsWith('/') ? next : `/gsd-${next}`;
    this.confirmPending = { root: p.root, command, text: `send ${command} to driver pane? y/N` };
    this.scheduleRender();
  }

  /** Plan first so the y/N line can say exactly what will happen, or why it will not. */
  private async askRun(unit: RunUnit): Promise<void> {
    const p = this.currentProject();
    if (!p) return;
    if (p.orchestration && !p.orchestration.enabled) {
      this.setMessage('orchestration is off: set [orchestration] enabled = true in config.toml', 'info');
      return;
    }
    try {
      const plan = await this.client.planRun(p.root, unit);
      if (!plan.ok) {
        this.setMessage(`cannot start ${unit}: ${plan.reasons[0] ?? 'refused'}`, 'error');
        return;
      }
      const where = unit === 'phase-isolated' ? `worktree ${plan.branch ?? ''}` : 'a new pane';
      const warn = plan.warnings.length ? ` (${plan.warnings.length} warning${plan.warnings.length > 1 ? 's' : ''})` : '';
      this.confirmPending = { root: p.root, unit, text: `start ${plan.kind} in ${where} and send ${plan.command}?${warn} y/N` };
      this.scheduleRender();
    } catch (e) {
      this.setMessage(`orchestrate.plan failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  }

  private async startRun(root: string, unit: RunUnit): Promise<void> {
    try {
      const r = await this.client.startRun(root, unit);
      if (r.run) this.setMessage(`run ${r.run.id} ${r.run.status}${r.run.reason ? `: ${r.run.reason}` : ` in ${r.run.target.paneId}`}`, r.run.status === 'failed' ? 'error' : 'info');
      else this.setMessage(`refused: ${r.plan.reasons[0] ?? 'unknown'}`, 'error');
    } catch (e) {
      this.setMessage(`orchestrate.start failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  }

  private askStop(): void {
    const p = this.currentProject();
    const run = p?.runs?.find((r) => ['planned', 'starting', 'running', 'waiting'].includes(r.status));
    if (!run) {
      this.setMessage('no active run for this project', 'info');
      return;
    }
    const what = run.target.worktree ? `remove worktree ${run.target.worktree.branch} (kept if dirty)` : `close pane ${run.target.paneId}`;
    this.confirmPending = { runId: run.id, text: `stop run ${run.id} (${run.command}) and ${what}? y/N` };
    this.scheduleRender();
  }

  private async stopRun(runId: string): Promise<void> {
    try {
      const [r] = await this.client.stopRun(runId);
      if (r?.stopped) this.setMessage(`stopped: ${r.run.reason ?? runId}`, 'info');
      else this.setMessage(`not stopped: ${r?.reason ?? 'unknown'}`, 'error');
    } catch (e) {
      this.setMessage(`orchestrate.stop failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  }

  private async sendPrompt(root: string, command: string): Promise<void> {
    try {
      const res: PromptResult = await this.client.sendPrompt(root, command);
      if (res.sent) this.setMessage(`sent ${command} to pane ${res.paneId}`, 'info');
      else if (res.reason === 'agent_blocked') this.setMessage(res.message ?? 'agent_blocked: driver agent is blocked, not sent', 'error');
      else this.setMessage(`not sent: ${res.reason}${res.message ? ` — ${res.message}` : ''}`, 'error');
    } catch (e) {
      this.setMessage(`prompt.send failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  }

  private async run(okText: string, fn: () => Promise<unknown>): Promise<void> {
    try {
      await fn();
      this.setMessage(okText, 'info');
    } catch (e) {
      this.setMessage(e instanceof Error ? e.message : String(e), 'error');
    }
  }

  private setMessage(text: string, kind: 'info' | 'error' | 'confirm'): void {
    this.message = { text, kind };
    this.scheduleRender();
  }

  quit(code: number): void {
    this.stop();
    this.onExit(code);
  }

  stop(): void {
    this.running = false;
    if (this.frameTimer) clearTimeout(this.frameTimer);
    this.frameTimer = undefined;
    this.unsubscribe?.();
    this.client.stop();
    this.stdin.off('data', this.onData);
    this.stdout.off?.('resize', this.onResize);
    process.off('exit', this.onProcessExit);
    process.off('SIGINT', this.onSignal);
    process.off('SIGTERM', this.onSignal);
    process.off('uncaughtException', this.onFatal);
    process.off('unhandledRejection', this.onFatal);
    this.restore();
  }

  /** Idempotent terminal restore; safe from a process `exit` handler. */
  restore(): void {
    if (this.restored) return;
    this.restored = true;
    try {
      if (this.stdin.isTTY) this.stdin.setRawMode?.(false);
      this.stdin.pause();
    } catch {
      /* stdin may already be closed */
    }
    try {
      this.stdout.write(CURSOR_SHOW + ALT_OFF);
    } catch {
      /* stdout may already be closed */
    }
  }
}

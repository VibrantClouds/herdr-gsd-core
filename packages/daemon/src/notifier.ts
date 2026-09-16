import type { ChangeKey, PluginConfig, ProjectSnapshot } from '@herdr-gsd/core';

/**
 * Notification policy (spec §4.4): one `notification.show` per change-set
 * batch, coalesced within 2 s; rate_limited/busy → retry once after 5 s then
 * drop; per-category toggles; `blocked` only when the driver pane's semantic
 * status became blocked AND the snapshot is not complete.
 */
export interface NotificationPayload {
  title: string;
  body: string;
  sound: 'none' | 'done' | 'request';
}

export interface ShowResult {
  shown: boolean;
  reason?: string;
}

export type ShowFn = (p: NotificationPayload) => Promise<ShowResult>;

export interface PendingChange {
  root: string;
  project: string;
  keys: ChangeKey[];
  before?: ProjectSnapshot;
  after: ProjectSnapshot;
  next?: string;
}

export interface NotifierOptions {
  config: PluginConfig['notify'];
  show: ShowFn;
  /** is the driver pane for this root currently focused? (quiet_when_focused) */
  isFocused?: (root: string) => boolean;
  coalesceMs?: number;
  retryMs?: number;
  log?: (msg: string, data?: unknown) => void;
  setTimeoutFn?: typeof setTimeout;
}

export const TITLE_MAX = 80;
export const BODY_MAX = 240;

export function clampTitle(s: string): string {
  return s.length > TITLE_MAX ? s.slice(0, TITLE_MAX - 1) + '…' : s;
}
export function clampBody(s: string): string {
  return s.length > BODY_MAX ? s.slice(0, BODY_MAX - 1) + '…' : s;
}

/** Describe a change set as `phase 03 executing → verifying` etc. Returns undefined when nothing notable. */
export function describeChange(c: PendingChange, cfg: PluginConfig['notify']): { headline: string; category: 'phase_boundary' | 'uat_ready' | 'paused' | 'drift' } | undefined {
  const a = c.after;
  const b = c.before;
  const cur = a.position?.phase;
  const phaseLabel = cur ? `phase ${cur.number}` : 'project';
  if (c.keys.includes('paused') && a.paused && !b?.paused) return { headline: `${phaseLabel} paused (continue-here)`, category: 'paused' };
  if (c.keys.includes('uat') && cfg.uat_ready) {
    const afterUat = a.phases.find((p) => p.number === cur?.number)?.uat;
    const beforeUat = b?.phases.find((p) => p.number === cur?.number)?.uat;
    if (afterUat && afterUat !== beforeUat) return { headline: `${phaseLabel} UAT ${afterUat}`, category: 'uat_ready' };
  }
  if ((c.keys.includes('phase') || c.keys.includes('status')) && cfg.phase_boundary) {
    const from = b?.position?.phase ? `${b.position.phase.number} ${b.position.phase.status}` : undefined;
    const to = cur ? `${cur.number} ${cur.status}` : 'none';
    if (from !== to) return { headline: from ? `phase ${from} → ${to}` : `${phaseLabel} ${cur?.status ?? ''}`.trim(), category: 'phase_boundary' };
  }
  if (c.keys.includes('health') && a.drift?.stateVsDisk && cfg.drift) return { headline: `${phaseLabel} STATE.md drift detected`, category: 'drift' };
  return undefined;
}

export class Notifier {
  private queue = new Map<string, PendingChange>();
  private timer?: NodeJS.Timeout;
  private readonly coalesceMs: number;
  private readonly retryMs: number;
  private readonly setTimeoutFn: typeof setTimeout;
  /** stats for the dashboard / status */
  readonly stats = { shown: 0, suppressed: 0, dropped: 0, retried: 0 };

  constructor(private readonly opts: NotifierOptions) {
    this.coalesceMs = opts.coalesceMs ?? 2000;
    this.retryMs = opts.retryMs ?? 5000;
    this.setTimeoutFn = opts.setTimeoutFn ?? setTimeout;
  }

  /** Queue a change set for a project; merged with any pending change for the same root. */
  push(c: PendingChange): void {
    const existing = this.queue.get(c.root);
    if (existing) {
      this.queue.set(c.root, { ...c, keys: [...new Set([...existing.keys, ...c.keys])], before: existing.before ?? c.before });
    } else this.queue.set(c.root, c);
    if (!this.timer) {
      this.timer = this.setTimeoutFn(() => {
        this.timer = undefined;
        void this.flush();
      }, this.coalesceMs);
      (this.timer as { unref?: () => void }).unref?.();
    }
  }

  /** Blocked transition observed from Herdr's own agent status (spec §4.4). */
  async blocked(root: string, project: string, snap: ProjectSnapshot, next?: string): Promise<void> {
    if (!this.opts.config.blocked) return;
    const status = snap.phases.length > 0 && snap.phases.every((p) => p.status === 'complete') ? 'complete' : 'active';
    if (status === 'complete') return;
    const phase = snap.position?.phase ? ` · phase ${snap.position.phase.number}` : '';
    await this.send(root, { title: clampTitle(`GSD · ${project}${phase}: waiting for you`), body: clampBody(next ? `next: ${next}` : 'agent is blocked'), sound: this.opts.config.sound === 'none' ? 'none' : 'request' });
  }

  async flush(): Promise<void> {
    const items = [...this.queue.values()];
    this.queue.clear();
    for (const c of items) {
      const d = describeChange(c, this.opts.config);
      if (!d) continue;
      const title = clampTitle(`GSD · ${c.project}: ${d.headline}`);
      const body = clampBody(c.next ? `next: ${c.next}` : '');
      await this.send(c.root, { title, body, sound: this.opts.config.sound });
    }
  }

  private async send(root: string, p: NotificationPayload): Promise<void> {
    if (this.opts.config.quiet_when_focused && this.opts.isFocused?.(root)) {
      this.stats.suppressed++;
      this.opts.log?.('notification suppressed (focused)', p.title);
      return;
    }
    let r: ShowResult;
    try {
      r = await this.opts.show(p);
    } catch (e) {
      this.stats.dropped++;
      this.opts.log?.('notification failed', e);
      return;
    }
    if (r.shown) {
      this.stats.shown++;
      return;
    }
    if (r.reason === 'rate_limited' || r.reason === 'busy') {
      this.stats.retried++;
      await new Promise<void>((resolve) => {
        const t = this.setTimeoutFn(resolve, this.retryMs);
        (t as { unref?: () => void }).unref?.();
      });
      try {
        const r2 = await this.opts.show(p);
        if (r2.shown) this.stats.shown++;
        else this.stats.dropped++;
      } catch {
        this.stats.dropped++;
      }
      return;
    }
    this.stats.dropped++;
    this.opts.log?.('notification not shown', r);
  }
}

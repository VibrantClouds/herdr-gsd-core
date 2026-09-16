import type { ActivityEvent } from '@herdr-gsd/core';

/**
 * Per-project activity tracker fed by spool events (spec §3.3 pane tokens):
 * - open subagent spans (`gsd_agent`, `gsd_workers`)
 * - last tool (`gsd_tool`, 15 s TTL)
 * - last session id / pane id seen (pane mapping input)
 */
export interface Span {
  agent: string;
  startedAt: number;
  sessionId?: string;
  /** Claude Code SubagentStart agent_id when known; used to de-duplicate inferred spans */
  key: string;
}

export interface ActivityView {
  /** most recent open span's agent name */
  agent?: string;
  /** count of open spans */
  workers: number;
  /** last tool.pre within ttl */
  tool?: string;
  toolAt?: number;
  lastEventAt?: number;
  lastSessionId?: string;
  lastPaneId?: string;
  lastHarness?: ActivityEvent['harness'];
  /** true when a session.stop was the last session-level event */
  sessionEnded: boolean;
}

export interface ActivityOptions {
  /** span TTL for harnesses that never send subagent.stop (spec §5.2: 15 min) */
  spanTtlMs?: number;
  toolTtlMs?: number;
  /** keep at most this many recent events for the dashboard */
  historySize?: number;
}

export class ActivityTracker {
  private spans: Span[] = [];
  private view: ActivityView = { workers: 0, sessionEnded: false };
  private history: ActivityEvent[] = [];
  private readonly spanTtl: number;
  private readonly toolTtl: number;
  private readonly historySize: number;

  constructor(opts: ActivityOptions = {}) {
    this.spanTtl = opts.spanTtlMs ?? 15 * 60 * 1000;
    this.toolTtl = opts.toolTtlMs ?? 15 * 1000;
    this.historySize = opts.historySize ?? 50;
  }

  recent(): ActivityEvent[] {
    return this.history.slice();
  }

  ingest(ev: ActivityEvent): void {
    this.history.push(ev);
    if (this.history.length > this.historySize) this.history.splice(0, this.history.length - this.historySize);
    this.view.lastEventAt = Math.max(this.view.lastEventAt ?? 0, ev.ts);
    if (ev.sessionId) this.view.lastSessionId = ev.sessionId;
    if (ev.paneId) this.view.lastPaneId = ev.paneId;
    this.view.lastHarness = ev.harness;
    switch (ev.kind) {
      case 'session.start':
        this.view.sessionEnded = false;
        this.spans = [];
        break;
      case 'session.stop':
        this.view.sessionEnded = true;
        this.spans = [];
        break;
      case 'subagent.start': {
        const key = spanKey(ev);
        const agent = shortAgent(ev.agent ?? 'subagent');
        if (this.spans.some((s) => s.key === key)) break;
        // De-duplicate the Claude Code adapter's inferred span (PreToolUse Agent → carries `tool`)
        // against the real SubagentStart (no `tool`): same session + agent within 10 s is one span.
        const twin = this.spans.find((s) => s.sessionId === ev.sessionId && s.agent === agent && ev.ts - s.startedAt < 10_000);
        if (twin) {
          if (!ev.tool) twin.key = key; // real event wins the key so SubagentStop matches
          break;
        }
        this.spans.push({ agent, startedAt: ev.ts, sessionId: ev.sessionId, key });
        break;
      }
      case 'subagent.stop': {
        const key = spanKey(ev);
        const i = this.spans.findIndex((s) => s.key === key);
        if (i >= 0) this.spans.splice(i, 1);
        else if (this.spans.length) this.spans.pop();
        break;
      }
      case 'tool.pre':
        this.view.tool = ev.detail ? `${ev.tool ?? '?'} ${ev.detail}`.trim() : ev.tool;
        this.view.toolAt = ev.ts;
        break;
      case 'tool.post':
      case 'compact.pre':
      case 'phase.boundary':
        break;
    }
  }

  /** Current view; expires spans/tools relative to `now`. */
  snapshot(now = Date.now()): ActivityView {
    this.spans = this.spans.filter((s) => now - s.startedAt < this.spanTtl);
    const last = this.spans[this.spans.length - 1];
    const toolFresh = this.view.toolAt !== undefined && now - this.view.toolAt < this.toolTtl;
    return {
      ...this.view,
      agent: last?.agent,
      workers: this.spans.length,
      tool: toolFresh ? this.view.tool : undefined,
      toolAt: toolFresh ? this.view.toolAt : undefined,
    };
  }
}

function spanKey(ev: ActivityEvent): string {
  // Claude Code SubagentStart/Stop carry agent_id in `detail` (adapter convention: "id:<agent_id>").
  const m = /(?:^|\s)id:([\w-]+)/.exec(ev.detail ?? '');
  if (m) return `id:${m[1]}`;
  return `${ev.tool ? 'inferred:' : ''}${ev.sessionId ?? '?'}:${ev.agent ?? '?'}`;
}

/** `gsd-executor` → `executor`; keep ≤ 24 chars for the token. */
export function shortAgent(name: string): string {
  const n = name.replace(/^gsd[-_:]/i, '').trim();
  return n.length > 24 ? n.slice(0, 23) + '…' : n || 'subagent';
}

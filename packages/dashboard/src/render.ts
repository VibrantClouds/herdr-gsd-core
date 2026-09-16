import type { ProjectDetail } from '@herdr-gsd/daemon';

/**
 * Pure rendering for the dashboard pane (spec §6). `renderFrame` never touches
 * a socket, a clock or a terminal: it maps a `DashboardState` to exactly
 * `size.rows` strings, each at most `size.cols` visible cells wide.
 */
export interface DashboardState {
  connected: boolean;
  projects: ProjectDetail[];
  selected: number;
  lastUpdateAt?: number;
  message?: { text: string; kind: 'info' | 'error' | 'confirm' };
  confirmPending?: { text: string };
  now: number;
}

export interface DashboardSize {
  cols: number;
  rows: number;
}

export interface RenderOptions {
  /** ANSI SGR colours; tests pass `false`. */
  colors?: boolean;
}

/** Minimum layout the spec guarantees; below this sections are dropped. */
export const MIN_COLS = 60;
export const MIN_ROWS = 12;

const LABEL_W = 9;
const GUTTER = ' ';
const ESC = '\u001b';

const ANSI_RE = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;

/** Glyphs the spec uses that some width tables call ambiguous/wide: force width 1. */
const NARROW = new Set(['✓', '▶', '·', '✗', '⋯', '↻', '…', '─', '│', '┌', '┐', '└', '┘', '—']);

export function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '');
}

function isWide(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0x303e) ||
    (cp >= 0x3041 && cp <= 0x33ff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0xa000 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe6f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1f9ff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  );
}

function charWidth(ch: string): number {
  if (NARROW.has(ch)) return 1;
  const cp = ch.codePointAt(0)!;
  if (cp === 0x200d || (cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0x0300 && cp <= 0x036f)) return 0;
  if (cp < 0x20 || cp === 0x7f) return 0;
  return isWide(cp) ? 2 : 1;
}

/** Visible cell width, ignoring ANSI escapes. */
export function visibleWidth(s: string): number {
  let w = 0;
  for (const ch of stripAnsi(s)) w += charWidth(ch);
  return w;
}

/** Truncate to `max` visible cells, ending with the ellipsis; ANSI escapes are preserved. */
export function truncateToWidth(s: string, max: number): string {
  if (max <= 0) return '';
  if (visibleWidth(s) <= max) return s;
  let out = '';
  let w = 0;
  let hadAnsi = false;
  let i = 0;
  const chars = [...s];
  while (i < chars.length) {
    const ch = chars[i]!;
    if (ch === ESC) {
      let seq = ch;
      i++;
      while (i < chars.length) {
        const c = chars[i]!;
        seq += c;
        i++;
        if (/[@-~]/.test(c) && seq.length > 2) break;
      }
      out += seq;
      hadAnsi = true;
      continue;
    }
    const cw = charWidth(ch);
    if (w + cw > max - 1) break;
    out += ch;
    w += cw;
    i++;
  }
  return out + (hadAnsi ? `${ESC}[0m` : '') + '…';
}

export function padTo(s: string, width: number): string {
  const w = visibleWidth(s);
  return w >= width ? s : s + ' '.repeat(width - w);
}

interface Paint {
  dim(s: string): string;
  bold(s: string): string;
  green(s: string): string;
  yellow(s: string): string;
  red(s: string): string;
  cyan(s: string): string;
}

function paint(on: boolean): Paint {
  const wrap = (code: string) => (s: string) => (on ? `${ESC}[${code}m${s}${ESC}[0m` : s);
  return { dim: wrap('2'), bold: wrap('1'), green: wrap('32'), yellow: wrap('33'), red: wrap('31'), cyan: wrap('36') };
}

export function formatAgo(deltaMs: number): string {
  if (!Number.isFinite(deltaMs) || deltaMs < 0) return '0s ago';
  const s = Math.floor(deltaMs / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function formatClock(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** `gsd-executor` becomes `executor`. */
export function shortAgent(name: string): string {
  const n = name.replace(/^gsd[-_:]/i, '').trim();
  return n || 'subagent';
}

export function phaseGlyph(status: string, isCurrent: boolean): string {
  switch (status) {
    case 'complete':
      return '✓';
    case 'blocked':
      return '✗';
    case 'verifying':
      return '⋯';
    case 'executing':
      return '▶';
    default:
      return isCurrent ? '▶' : '·';
  }
}

function labelled(label: string, body: string): string {
  return GUTTER + padTo(label, LABEL_W) + body;
}

/** Lay entries out per row width, wrapping onto label-indented continuation rows. */
function wrapEntries(label: string, entries: string[], cols: number, gap = 3): string[] {
  const inner = Math.max(1, cols - 1 - LABEL_W);
  const rows: string[] = [];
  let cur = '';
  for (const e of entries) {
    const candidate = cur ? cur + ' '.repeat(gap) + e : e;
    if (cur && visibleWidth(candidate) > inner) {
      rows.push(cur);
      cur = e;
    } else {
      cur = candidate;
    }
  }
  rows.push(cur);
  return rows.map((r, i) => truncateToWidth(labelled(i === 0 ? label : '', r), cols));
}

function centeredPanel(text: string, size: DashboardSize, c: Paint): string[] {
  const rows: string[] = [];
  const innerW = Math.min(Math.max(visibleWidth(text) + 4, 10), Math.max(4, size.cols - 2));
  const body = truncateToWidth(text, innerW - 2);
  const padTotal = innerW - 2 - visibleWidth(body);
  const left = Math.max(0, Math.floor(padTotal / 2));
  const right = Math.max(0, padTotal - left);
  const box = [
    '┌' + '─'.repeat(innerW - 2) + '┐',
    '│' + ' '.repeat(left) + body + ' '.repeat(right) + '│',
    '└' + '─'.repeat(innerW - 2) + '┘',
  ];
  const indent = ' '.repeat(Math.max(0, Math.floor((size.cols - innerW) / 2)));
  const top = Math.max(0, Math.floor((size.rows - 1 - box.length) / 2));
  for (let i = 0; i < top; i++) rows.push('');
  for (const b of box) rows.push(truncateToWidth(indent + c.dim(b), size.cols));
  return rows;
}

function keysLine(cols: number, c: Paint): string {
  // three tiers so the line is shortened, never clipped: full (≥ 90 cols), medium (80), compact (60)
  const full = `${GUTTER}Keys  q quit · r rescan · n notify · o run next · w worktree run · a autonomous · x stop`;
  const medium = `${GUTTER}Keys  q quit · r rescan · n notify · o run · w worktree · a auto · x stop`;
  const compact = `${GUTTER}Keys  q quit · r · n · o run · w wt · a auto · x stop`;
  const pick = visibleWidth(full) <= cols ? full : visibleWidth(medium) <= cols ? medium : compact;
  return truncateToWidth(c.dim(pick), cols);
}

/** Orchestration runs (M4): the active one first, then the newest finished ones. */
function runRows(detail: ProjectDetail, cols: number, budget: number, c: Paint): string[] {
  const runs = detail.runs ?? [];
  if (!runs.length || budget <= 0) return [];
  const active = runs.filter((r) => ['planned', 'starting', 'running', 'waiting'].includes(r.status));
  const shown = [...active, ...runs.filter((r) => !active.includes(r))].slice(0, Math.min(budget, active.length ? 2 : 1));
  const rows: string[] = [];
  for (const r of shown) {
    const state = r.status + (r.waitingFor ? `/${r.waitingFor}` : '');
    const where = r.target.worktree ? `${r.target.worktree.branch}` : r.target.paneId || '—';
    const paintFn = r.status === 'waiting' || r.status === 'failed' ? c.red : r.status === 'running' || r.status === 'starting' ? c.bold : c.dim;
    const text = `${paintFn(state)} ${r.command} → ${where}${r.reason && r.status !== 'done' ? ` · ${r.reason}` : ''}`;
    rows.push(truncateToWidth(labelled(rows.length === 0 ? 'Runs' : '', text), cols));
  }
  return rows;
}

function messageLine(state: DashboardState, cols: number, c: Paint): string | undefined {
  if (state.confirmPending) return truncateToWidth(GUTTER + c.yellow(state.confirmPending.text), cols);
  if (!state.message) return undefined;
  const paintFn = state.message.kind === 'error' ? c.red : state.message.kind === 'confirm' ? c.yellow : c.cyan;
  return truncateToWidth(GUTTER + paintFn(state.message.text), cols);
}

function basename(p: string): string {
  const parts = p.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

function headerLine(detail: ProjectDetail | undefined, state: DashboardState, cols: number, c: Paint): string {
  const snap = detail?.snapshot;
  const parts: string[] = ['GSD'];
  parts.push(snap?.project?.name ?? (detail ? basename(detail.root) : 'no project'));
  const phase = snap?.position?.phase;
  if (phase) parts.push(`Phase ${phase.number} ${phase.slug}`);
  if (detail) {
    const plan = snap?.position?.plan;
    const wave = snap?.position?.wave;
    const bits: string[] = [];
    if (plan && plan.total) bits.push(`plan ${plan.index}/${plan.total}`);
    if (wave !== undefined) bits.push(`wave ${wave}`);
    parts.push(detail.status + (bits.length ? ` (${bits.join(', ')})` : ''));
  }
  const left = GUTTER + c.bold(parts.join(' · '));
  const right = `↻ ${state.lastUpdateAt ? formatAgo(state.now - state.lastUpdateAt) : 'never'}`;
  const leftW = visibleWidth(left);
  const rightW = visibleWidth(right);
  if (leftW + 2 + rightW <= cols) return left + ' '.repeat(cols - leftW - rightW) + c.dim(right);
  return truncateToWidth(left, cols);
}

function phaseRows(detail: ProjectDetail, cols: number, c: Paint): string[] {
  const snap = detail.snapshot;
  const cur = snap.position?.phase?.number;
  if (!snap.phases.length) return [truncateToWidth(labelled('Phases', c.dim('(none)')), cols)];
  const entries = snap.phases.map((p) => {
    const isCur = p.number === cur;
    const text = `${p.number} ${p.slug} ${phaseGlyph(p.status, isCur)}`;
    if (p.status === 'complete') return c.green(text);
    if (p.status === 'blocked') return c.red(text);
    return isCur ? c.bold(text) : c.dim(text);
  });
  return wrapEntries('Phases', entries, cols);
}

function planRows(detail: ProjectDetail, cols: number, c: Paint): string[] {
  const snap = detail.snapshot;
  const cur = snap.position?.phase;
  const curPhase = cur ? snap.phases.find((p) => p.number === cur.number) : undefined;
  const plan = snap.position?.plan;
  const total = plan?.total ?? curPhase?.plans ?? 0;
  if (!cur || total <= 0) return [truncateToWidth(labelled('Plans', c.dim('(none)')), cols)];
  const idx = plan?.index ?? 0;
  const done = cur.status === 'complete';
  const entries: string[] = [];
  for (let k = 1; k <= total; k++) {
    const id = `${cur.number}-${String(k).padStart(2, '0')}`;
    let glyph = '·';
    if (done || k < idx) glyph = '✓';
    else if (k === idx) glyph = '▶';
    let text = `${id} ${glyph}`;
    if (k === idx && !done) {
      const view = detail.activity;
      const agent = view?.agent ? shortAgent(view.agent) : undefined;
      if (agent) text += ` ${agent}${view?.tool ? ` (${view.tool})` : ''}`;
      entries.push(c.bold(text));
    } else {
      entries.push(glyph === '✓' ? c.green(text) : c.dim(text));
    }
  }
  return wrapEntries('Plans', entries, cols, 2);
}

function blockersRow(detail: ProjectDetail, cols: number, c: Paint): string {
  const b = detail.snapshot.blockers;
  if (!b.length) return truncateToWidth(labelled('Blockers', c.dim('none')), cols);
  return truncateToWidth(labelled('Blockers', c.red(b.join(' · '))), cols);
}

function nextRow(detail: ProjectDetail, cols: number, c: Paint): string {
  const next = detail.next ?? detail.snapshot.next?.command;
  if (!next) return truncateToWidth(labelled('Next', c.dim('(nothing recommended)')), cols);
  const base = labelled('Next', c.bold(next));
  const hints = `${c.dim('[enter]')} send to driver   ${c.dim('[o]')} new pane   ${c.dim('[w]')} worktree`;
  const withHints = base + '   ' + hints;
  return visibleWidth(withHints) <= cols ? withHints : truncateToWidth(base, cols);
}

function activityRows(detail: ProjectDetail, cols: number, budget: number, c: Paint): string[] {
  if (budget <= 0) return [];
  const events = detail.recent.slice().sort((a, b) => b.ts - a.ts);
  if (!events.length) return [truncateToWidth(labelled('Activity', c.dim('(no events)')), cols)];
  const rows: string[] = [];
  for (const ev of events.slice(0, budget)) {
    const agent = padTo(ev.agent ? shortAgent(ev.agent) : '-', 9);
    const what = ev.tool ?? ev.kind;
    const body = `${c.dim(formatClock(ev.ts))} ${agent} ${what}${ev.detail ? ` ${ev.detail}` : ''}`;
    rows.push(truncateToWidth(labelled(rows.length === 0 ? 'Activity' : '', body), cols));
  }
  return rows;
}

function selectorRow(state: DashboardState, cols: number, c: Paint): string {
  const n = state.projects.length;
  const i = Math.min(Math.max(state.selected, 0), Math.max(0, n - 1)) + 1;
  return truncateToWidth(GUTTER + c.cyan(`[tab] project ${i}/${n}`), cols);
}

/** Render one frame: exactly `size.rows` rows, each at most `size.cols` visible cells. */
export function renderFrame(state: DashboardState, size: DashboardSize, opts: RenderOptions = {}): string[] {
  const cols = Math.max(1, Math.floor(size.cols));
  const rows = Math.max(1, Math.floor(size.rows));
  const c = paint(opts.colors !== false);
  const out: string[] = [];

  const footer: string[] = [];
  const msg = messageLine(state, cols, c);
  if (msg !== undefined) footer.push(msg);
  footer.push(keysLine(cols, c));

  if (!state.connected || state.projects.length === 0) {
    const text = state.connected ? 'no GSD projects found' : 'gsdd not running — retrying…';
    out.push(...centeredPanel(text, { cols, rows }, c));
    return fit(out, footer, rows, cols);
  }

  const detail = state.projects[Math.min(Math.max(state.selected, 0), state.projects.length - 1)]!;
  const head: string[] = [headerLine(detail, state, cols, c), truncateToWidth(c.dim(GUTTER + '─'.repeat(Math.max(1, cols - 2))), cols)];
  if (state.projects.length > 1) head.push(selectorRow(state, cols, c));

  const phases = phaseRows(detail, cols, c);
  const plans = planRows(detail, cols, c);
  const mid = [blockersRow(detail, cols, c), nextRow(detail, cols, c)];

  let budget = rows - head.length - footer.length;
  // Degrade (spec §6): drop Activity first, then Plans, then wrapped phase rows.
  let body = [...phases, ...plans, ...mid];
  if (body.length > budget) body = [...phases, ...mid];
  if (body.length > budget) body = [...phases.slice(0, Math.max(1, budget - mid.length)), ...mid];
  if (body.length > budget) body = body.slice(0, Math.max(0, budget));
  budget -= body.length;

  out.push(...head, ...body);
  if (budget > 0) {
    const runs = runRows(detail, cols, budget, c);
    out.push(...runs);
    budget -= runs.length;
  }
  if (budget > 0) out.push(...activityRows(detail, cols, budget, c));
  return fit(out, footer, rows, cols);
}

function fit(body: string[], footer: string[], rows: number, cols: number): string[] {
  const keep = body.slice(0, Math.max(0, rows - footer.length));
  while (keep.length < rows - footer.length) keep.push('');
  const all = [...keep, ...footer].slice(0, rows);
  while (all.length < rows) all.push('');
  return all.map((l) => (visibleWidth(l) > cols ? truncateToWidth(l, cols) : l));
}

import { promises as nodeFs, type Dirent } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, sep, basename } from 'node:path';
import type { ChangeKey, GsdProjectConfig, GsdStatus, HumanStop, PhaseInfo, PhaseReview, PhaseStatus, ProjectSnapshot, Step } from './types';
import { PlanningLockedError, waitForStateUnlocked, type LockWaitOptions } from './lock';
import { recommendNext, trimNumber } from './next';
import { assertReadOnly } from './readonly';
import type { RunResult, ThrottledRunner } from './tools';

/* ------------------------------------------------------------------ *
 * fs seam (tests inject)
 * ------------------------------------------------------------------ */

export interface PlanningStat {
  mtimeMs: number;
  isDirectory(): boolean;
  isFile(): boolean;
}
export interface PlanningDirent {
  name: string;
  isDirectory(): boolean;
  isFile(): boolean;
}
export interface PlanningFs {
  readFile(p: string): Promise<string>;
  readdir(p: string): Promise<PlanningDirent[]>;
  stat(p: string): Promise<PlanningStat>;
}

export const nodePlanningFs: PlanningFs = {
  readFile: (p) => nodeFs.readFile(p, 'utf8'),
  readdir: (p) => nodeFs.readdir(p, { withFileTypes: true }) as Promise<Dirent[]>,
  stat: (p) => nodeFs.stat(p),
};

/* ------------------------------------------------------------------ *
 * GSD's own parsers, reimplemented faithfully (capture M0-G-parsers.txt)
 * ------------------------------------------------------------------ */

/** Phase directory name → `[number, slug]` (`commands.cjs:3022`). */
export const PHASE_DIR_RE = /^(\d+(?:\.\d+)*)-?(.*)/;

/** `isSentinelPhaseId`: phase 0 and the 999.x reserved band are not real phases. */
export function isSentinelPhaseId(n: string): boolean {
  const t = trimNumber(n);
  return t === '0' || t === '999' || t.startsWith('999.');
}

/** Lowercase + collapse internal whitespace, GSD's normalisation before token matching. */
function collapse(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

export interface Frontmatter {
  /** top-level scalar keys only; nested blocks (e.g. `progress:`) are skipped */
  fm: Record<string, string>;
  body: string;
  /** frontmatter fence opened and never closed → the document is malformed */
  malformed: boolean;
}

/**
 * Minimal YAML frontmatter reader. GSD writes flat scalars plus one nested
 * `progress:` block; only the flat scalars participate in `stateFieldValue`'s
 * ladder, so indented lines are skipped rather than parsed.
 */
export function parseFrontmatter(text: string): Frontmatter {
  if (!/^---\r?\n/.test(text)) return { fm: {}, body: text, malformed: false };
  const lines = text.split(/\r?\n/);
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if ((lines[i] as string).trim() === '---') {
      end = i;
      break;
    }
  }
  if (end === -1) return { fm: {}, body: text, malformed: true };
  const fm: Record<string, string> = {};
  for (let i = 1; i < end; i++) {
    const line = lines[i] as string;
    const m = /^([A-Za-z0-9_-]+):[ \t]*(.*)$/.exec(line);
    if (!m) continue; // indented / list continuation of a nested block
    let v = (m[2] as string).trim();
    if ((v.startsWith('"') && v.endsWith('"') && v.length > 1) || (v.startsWith("'") && v.endsWith("'") && v.length > 1)) {
      v = v.slice(1, -1);
    }
    if (v !== '') fm[m[1] as string] = v;
  }
  return { fm, body: lines.slice(end + 1).join('\n'), malformed: false };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * `state-document.cjs:397 stateExtractField` — three attempts, in order:
 *   `**Field:** value`, then `Field: value`, then a `| Field | value |` table row.
 */
export function stateExtractField(content: string, field: string): string | undefined {
  const esc = escapeRe(field);
  const bold = new RegExp(`^[ \\t]*\\*\\*${esc}:\\*\\*[ \\t]*(.+)`, 'im').exec(content);
  if (bold) return (bold[1] as string).trim();
  const plain = new RegExp(`^${esc}:[ \\t]*(.+)`, 'im').exec(content);
  if (plain) return (plain[1] as string).trim();
  return locateFieldRow(content, field);
}

/** `| Field | value |` lookup; separator rows (`|---|---|`) are excluded. */
export function locateFieldRow(content: string, field: string): string | undefined {
  const want = field.toLowerCase();
  for (const line of content.split(/\r?\n/)) {
    if (!line.includes('|')) continue;
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 4) continue; // "| a | b |" splits to ['', 'a', 'b', '']
    const key = (cells[1] as string).replace(/\*\*/g, '').toLowerCase();
    const val = cells[2] as string;
    if (/^:?-{2,}:?$/.test(val)) continue; // separator row
    if (key === want && val !== '') return val;
  }
  return undefined;
}

/**
 * `state-document.cjs:511 stateCurrentPositionSlice` — h2 **or** h3, exact text,
 * case-insensitive, sliced to the next heading. Matching unscoped lets an archive
 * section shadow the real one.
 */
export function stateCurrentPositionSlice(content: string): string {
  const h = /^(#{2,3})[ \t]+Current Position[ \t]*$/im.exec(content);
  if (!h) return '';
  const start = h.index + (h[0] as string).length;
  const rest = content.slice(start);
  const next = /^#{1,3}[ \t]+\S/m.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

/** `state-document.cjs:637 STATUS_EXACT_TOKENS` — whole-value matches only. */
const STATUS_EXACT_TOKENS: Record<string, string> = {
  paused: 'paused',
  stopped: 'paused',
  discussing: 'discussing',
  executing: 'executing',
  'in progress': 'executing',
  'ready to execute': 'executing',
  verifying: 'verifying',
  'phase complete — ready for verification': 'verifying',
  planning: 'planning',
  'ready to plan': 'planning',
  'planning complete': 'planning',
  completed: 'completed',
  done: 'completed',
  complete: 'completed',
  'phase complete': 'completed',
  'all phases complete': 'completed',
  'milestone complete': 'completed',
  unknown: 'unknown',
};

/** `state-document.cjs:676 STATUS_ANCHORED_PATTERNS` — also whole-value. */
const STATUS_ANCHORED_PATTERNS: Array<[RegExp, string]> = [
  [/^executing phase\s+\S+$/, 'executing'],
  [/^planning phase\s+\S+$/, 'planning'],
  [/^verifying phase\s+\S+$/, 'verifying'],
  [/^phase\s+\S+\s+complete$/, 'completed'],
  [/^\S+\s+milestone complete$/, 'completed'],
  [/^complete\s*[✓✔✅☑]?$/, 'completed'],
];

/**
 * `state-document.cjs:711 normalizeStateStatus`. A non-empty `pausedAt`
 * short-circuits everything. Unmatched values pass through **verbatim** — GSD
 * #4186 replaced substring matching precisely because prose containing a trigger
 * word was being silently rewritten. Never substring-match here.
 */
export function normalizeStateStatus(status: string | undefined, pausedAt?: string): string {
  if (pausedAt !== undefined && collapse(pausedAt) !== '' && collapse(pausedAt).toLowerCase() !== 'none') return 'paused';
  if (status === undefined) return '';
  const raw = status.trim();
  const v = collapse(raw).toLowerCase();
  if (v === '') return '';
  const exact = STATUS_EXACT_TOKENS[v];
  if (exact) return exact;
  for (const [re, out] of STATUS_ANCHORED_PATTERNS) if (re.test(v)) return out;
  return raw;
}

/** Project step implied by the normalised STATE.md status token. */
export function stepForStatus(status: string): Step | undefined {
  switch (status) {
    case 'planning':
      return 'plan';
    case 'executing':
      return 'execute';
    case 'reviewing':
      return 'review';
    case 'verifying':
    case 'verify':
      return 'verify';
    case 'completed':
    case 'complete':
    case 'shipped':
      return 'ship';
    case 'discussing':
      return 'discuss';
    default:
      return undefined;
  }
}

/**
 * STATE.md's declared step, corrected by the current phase's artifacts when —
 * and only when — those artifacts prove execution is already finished.
 *
 * GSD writes no `Status` during the code-review gate or verification
 * (`workflows/code-review.md` touches STATE.md only to exclude it from a git
 * diff), so STATE.md sits on `executing` for the whole back half of a phase.
 * The override is deliberately one-directional and capped at `verify`: it never
 * walks a step *backwards*, and never promotes to `ship`, because milestone
 * completion is STATE.md's and ROADMAP's call, not a phase directory's.
 */
export function advancedStep(declared: Step | undefined, fromPhase: Step | undefined): Step | undefined {
  if (fromPhase !== 'review' && fromPhase !== 'verify') return declared;
  if (declared === undefined) return fromPhase;
  const rank: Record<Step, number> = { discuss: 0, plan: 1, execute: 2, review: 3, verify: 4, ship: 5 };
  return rank[fromPhase] > rank[declared] ? fromPhase : declared;
}

/**
 * The plan index GSD actually reached, which is not always the one it wrote
 * down. `advancePlan`'s phase-complete branch deliberately does not touch
 * `Current Plan` (`state-transition.cjs:1448` pushes only `Status`,
 * `Last Activity` and `Current Position`), and neither `verify-work` nor
 * `code-review` writes it at all — only `completePhase` resets it. Live: at
 * GPS.CommercialCRM's phase-40 transition the diff was `Plan: 4 of 10` →
 * `Plan: Not started` while `stopped_at` read `Completed 40-09-PLAN.md`.
 *
 * `*-SUMMARY.md` files are monotone committed evidence, so when the declared
 * counter is behind them the summaries win.
 */
export function reconcilePlanPosition(
  declared: { id: string; index: number; total: number } | undefined,
  phase: Pick<PhaseInfo, 'plans' | 'summaries' | 'status'> | undefined,
  phaseNumber: string | undefined,
): { id: string; index: number; total: number } | undefined {
  if (!phase || phase.plans === 0) return declared;
  const total = Math.max(declared?.total ?? 0, phase.plans);
  const pastExecution = phase.status === 'reviewing' || phase.status === 'verifying' || phase.status === 'complete';
  let index = declared?.index ?? 0;
  if (index < phase.summaries) index = pastExecution ? phase.summaries : Math.min(phase.summaries + 1, total);
  if (pastExecution) index = Math.min(index === 0 ? total : index, total);
  if (index <= 0 || total <= 0) return declared;
  const pad = String(index).padStart(2, '0');
  return { id: phaseNumber ? `${phaseNumber}-${pad}` : pad, index, total };
}

const PLACEHOLDER_BLOCKERS = new Set(['none', 'none yet', 'none.', 'none yet.', 'n/a', '-', '—', '(none)', '*(none)*', 'tbd']);

function isPlaceholder(item: string): boolean {
  const v = collapse(item)
    .toLowerCase()
    .replace(/^\*+|\*+$/g, '');
  return v === '' || PLACEHOLDER_BLOCKERS.has(v);
}

/** Bullet items of a heading-bounded section: `/^-\s+(.+)$/gm` (smart-entry.cjs). */
function sectionItems(section: string): string[] {
  const out: string[] = [];
  for (const m of section.matchAll(/^-\s+(.+)$/gm)) out.push((m[1] as string).trim());
  return out.filter((i) => !isPlaceholder(i));
}

function sliceSection(content: string, re: RegExp): string {
  const h = re.exec(content);
  if (!h) return '';
  const level = ((h[0] as string).match(/^#+/) ?? ['##'])[0].length;
  const rest = content.slice(h.index + (h[0] as string).length);
  const next = new RegExp(`^#{1,${level}}[ \\t]+\\S`, 'm').exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

/**
 * Blockers — **GSD-faithful**: the h2 `## Blockers` section only, items
 * `/^-\s+(.+)$/gm` (`smart-entry.cjs`). This is the field that drives
 * `blocked`, so it stays exactly as narrow as GSD's own signal.
 */
export function parseBlockers(content: string): string[] {
  return [...new Set(sectionItems(sliceSection(content, /^##[ \t]+Blockers[ \t]*$/im)))];
}

/**
 * Concerns — the `### Blockers/Concerns` list real projects write under
 * `## Accumulated Context`. GSD's parser does not match it, so all three 1.14
 * fixtures report `blockers: []` while listing blockers in prose (spike §7).
 *
 * These are long-lived advisories, not gates: every real fixture carries some
 * while actively executing. They are surfaced as a separate field so an
 * operator can see them without them ever forcing `gsd_status = blocked`.
 */
export function parseConcerns(content: string): string[] {
  return [...new Set(sectionItems(sliceSection(content, /^###[ \t]+Blockers\/Concerns[ \t]*$/im)))];
}

/** Table rows (`| a | b |`, not separators/headers) and bullets of a section, joined as one line each. */
function sectionRowsOrItems(section: string): string[] {
  const rows: string[][] = [];
  let headerIdx = -1;
  for (const line of section.split(/\r?\n/)) {
    const t = line.trim();
    if (!t.includes('|')) continue;
    const cells = t.split('|').map((c) => c.trim()).filter((c, i, a) => !(i === 0 && c === '') && !(i === a.length - 1 && c === ''));
    if (cells.length === 0) continue;
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) {
      // a separator row marks the row before it as the header (GSD may also write bare rows with no header)
      if (rows.length > 0 && headerIdx === -1) headerIdx = rows.length - 1;
      continue;
    }
    rows.push(cells);
  }
  const out: string[] = [];
  rows.forEach((cells, i) => {
    if (i === headerIdx) return;
    const text = cells.join(' · ');
    if (!isPlaceholder(text)) out.push(text);
  });
  return [...out, ...sectionItems(section)];
}

/**
 * Human-stop markers (spike M4 G6): `## Needs Human` (autonomous mode writes
 * `| phase | needs_human | resolve blocker, then /gsd-autonomous --from N |`
 * after three failed retries) and `## Deferred Verification`. Matched at h2 or
 * h3, case-insensitive; a section containing only placeholders is empty.
 */
export function parseHumanStops(content: string): HumanStop[] {
  const out: HumanStop[] = [];
  // Both markers are siblings in GSD's STATE.md, so a section ends at the next h2 *or* h3.
  const slice = (re: RegExp): string => {
    const h = re.exec(content);
    if (!h) return '';
    const rest = content.slice(h.index + (h[0] as string).length);
    const next = /^#{1,3}[ \t]+\S/m.exec(rest);
    return next ? rest.slice(0, next.index) : rest;
  };
  for (const text of new Set(sectionRowsOrItems(slice(/^#{2,3}[ \t]+Needs Human[ \t]*$/im)))) out.push({ marker: 'needs_human', text });
  for (const text of new Set(sectionRowsOrItems(slice(/^#{2,3}[ \t]+Deferred Verification[ \t]*$/im)))) out.push({ marker: 'deferred_verification', text });
  return out;
}

/** `[Phase 03]: text` / `[Phase 3] text` → the phase number the blocker is tagged with. */
export function blockerPhaseTag(item: string): string | undefined {
  const m = /^\[\s*phase\s+(\d+(?:\.\d+)*)\s*\]/i.exec(item.trim());
  return m ? trimNumber(m[1] as string) : undefined;
}

/**
 * `phase-lifecycle.cjs:58 locateProgressTable` + `deriveProgressFromRoadmap`.
 * Scope to `## Progress`, find the table whose header is a **superset** of
 * `Phase | Plans Complete | Status | Completed` (order/count invariant), then
 * read cells by name. Returns phase number → Status cell.
 */
export function parseRoadmapProgress(roadmap: string): Map<string, string> {
  const out = new Map<string, string>();
  const scoped = sliceSection(roadmap, /^##[ \t]+Progress\b.*$/im) || roadmap;
  const lines = scoped.split(/\r?\n/);
  let headers: string[] | undefined;
  let phaseCol = -1;
  let statusCol = -1;
  for (const line of lines) {
    if (!line.includes('|')) {
      if (headers && line.trim() === '') continue;
      continue;
    }
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.length < 2) continue;
    if (!headers) {
      const lower = cells.map((c) => c.toLowerCase());
      if (lower.includes('phase') && lower.includes('plans complete') && lower.includes('status') && lower.includes('completed')) {
        headers = lower;
        phaseCol = lower.indexOf('phase');
        statusCol = lower.indexOf('status');
      }
      continue;
    }
    if (cells.every((c) => /^:?-{2,}:?$/.test(c) || c === '')) continue; // separator
    const phaseCell = cells[phaseCol] ?? '';
    const m = /^(\d+(?:\.\d+)*)/.exec(phaseCell);
    if (!m) continue;
    if (isSentinelPhaseId(m[1] as string)) continue;
    out.set(trimNumber(m[1] as string), cells[statusCol] ?? '');
  }
  return out;
}

/**
 * `state-contract.cjs` fallback when there is no Progress table: the `## Phases`
 * section's `- [x] **Phase N: Name**` bullets.
 */
export function parseRoadmapCheckboxes(roadmap: string): Map<string, boolean> {
  const out = new Map<string, boolean>();
  const scoped = sliceSection(roadmap, /^##[ \t]+Phases\b.*$/im);
  const re = /^[ \t]*[-*][ \t]+\[([ xX])\][ \t]+\*\*Phase[ \t]+(\d+(?:\.\d+)*)[ \t]*:?[ \t]*([^*\n]*)\*\*/gm;
  for (const m of scoped.matchAll(re)) {
    const n = trimNumber(m[2] as string);
    if (isSentinelPhaseId(n)) continue;
    out.set(n, (m[1] as string).toLowerCase() === 'x');
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Phase status mapping
 * ------------------------------------------------------------------ */

/**
 * Three GSD vocabularies coexist (spike §7) and none is the spec's seven-value
 * `PhaseStatus`, so the mapping is explicit here.
 *
 * | on-disk evidence                                   | GSD `determinePhaseStatus` | spec PhaseStatus |
 * |----------------------------------------------------|----------------------------|------------------|
 * | plans == 0, no CONTEXT / DISCUSSION-LOG             | Pending                    | `not_started`    |
 * | plans == 0, NN-CONTEXT.md or NN-DISCUSSION-LOG.md   | Pending                    | `discussed`      |
 * | plans > 0, summaries == 0                           | Planned                    | `planned`        |
 * | 0 < summaries < plans                               | In Progress                | `executing`      |
 * | summaries >= plans, no REVIEW, no VERIFICATION       | Executed                   | `reviewing`      |
 * | summaries >= plans, REVIEW, no VERIFICATION          | Executed                   | `verifying`      |
 * | summaries >= plans, VERIFICATION fm status=passed    | Complete                   | `complete`       |
 * | summaries >= plans, fm status=human_needed           | Needs Review               | `verifying`      |
 * | summaries >= plans, fm status=gaps_found             | Executed                   | `verifying`      |
 * | summaries >= plans, VERIFICATION other value         | Executed                   | `verifying`      |
 *
 * The `reviewing` rung exists because GSD writes **nothing** to STATE.md during
 * either the code-review gate or verification — no `Status`, no `Current Plan`,
 * no `Stopped At` (settled against 1.14.0: the complete `Status` writer set is
 * `state-transition.cjs` + `state.cjs:6022`, and `workflows/code-review.md`
 * touches STATE.md only to exclude it from a git diff). The phase artifacts are
 * the only source. Artifact presence means *that step finished*, so the status
 * rendered is the step that comes next in `execute-phase.md`'s order
 * (`aggregate_results → code_review_gate → verify_phase_goal → transition`).
 *
 * Overrides applied afterwards, in this order:
 *   1. ROADMAP Progress `Status == Complete`, or `## Phases` `- [x]`      → `complete`
 *   2. fresh `.planning/state.json` phase `status` (`complete`→`complete`,
 *      `in_progress`→`executing` unless the filesystem already says
 *      `verifying`, `pending`→ keep the filesystem value)
 *   3. `blocked` — plugin-derived, never a GSD value: STATE.md's
 *      `## Current Position` status token is `blocked`, or STATE.md lists a
 *      blocker tagged `[Phase N]` for this phase.
 *
 * `blocked` wins over everything because it is the only status that demands
 * human attention.
 */
export function derivePhaseStatus(ev: {
  plans: number;
  summaries: number;
  hasContext: boolean;
  verification?: string;
  /**
   * a `NN-VERIFICATION.md` exists. Distinct from `verification`, which is that
   * file's frontmatter `status` and is absent both when there is no file *and*
   * when the file cannot be read — a present-but-unparseable report still means
   * verification has been reached.
   */
  hasVerification?: boolean;
  /** a `NN-REVIEW.md` exists (any `status`, including `skipped`) */
  hasReview?: boolean;
}): PhaseStatus {
  if (ev.plans === 0) return ev.hasContext ? 'discussed' : 'not_started';
  if (ev.summaries === 0) return 'planned';
  if (ev.summaries < ev.plans) return 'executing';
  if (!(ev.hasVerification ?? ev.verification !== undefined)) return ev.hasReview ? 'verifying' : 'reviewing';
  return ev.verification === 'passed' ? 'complete' : 'verifying';
}

/** `*-UAT.md` frontmatter `status`/`result` → the spec's three-value UAT vocabulary. */
export function mapUatStatus(raw: string | undefined): 'pending' | 'pass' | 'fail' {
  if (raw === undefined) return 'pending';
  const v = collapse(raw).toLowerCase();
  // real 1.14 fixtures write `status: complete` for a finished UAT, so
  // complete/completed join passed/pass on the success side.
  if (v === 'passed' || v === 'pass' || v === 'complete' || v === 'completed') return 'pass';
  if (v === 'failed' || v === 'fail' || v === 'gaps_found') return 'fail';
  return 'pending';
}

/* ------------------------------------------------------------------ *
 * reader
 * ------------------------------------------------------------------ */

export interface ReadSnapshotOptions {
  now?: () => number;
  /** already resolved by the caller; `undefined` = filesystem-only (spec §2.3.2) */
  tools?: ThrottledRunner;
  toolsSource?: string;
  previous?: ProjectSnapshot;
  lock?: LockWaitOptions;
  fs?: PlanningFs;
  env?: NodeJS.ProcessEnv;
  home?: string;
  /** version cache TTL, default 10 min */
  versionTtlMs?: number;
}

interface VersionCacheEntry {
  at: number;
  version?: string;
}
const versionCache = new Map<string, VersionCacheEntry>();

/** Test seam: drop the 10-minute `runtime-identity` cache. */
export function clearGsdVersionCache(): void {
  versionCache.clear();
}

/**
 * Write locks that gate reading `.planning/`. `milestone.lock` is deliberately
 * NOT here: it is GSD's advisory, session-long, TTL-heartbeated phase claim
 * (`milestone-lock.cjs`: "an advisory claim file, not a mutex"), and treating it
 * as a lock blanked a live workspace's tokens (docs/DECISIONS.md O8).
 */
const LOCK_FILES = ['STATE.md.lock', '.lock'];

interface WalkResult {
  newest?: { file: string; at: number };
  continueHere: Array<{ file: string; at: number }>;
  handoff?: { file: string; at: number };
}

const LAST_ACTIVITY_SKIP_DIRS = new Set(['graphs', '.cache']);

async function walkPlanning(fs: PlanningFs, planningDir: string): Promise<WalkResult> {
  const res: WalkResult = { continueHere: [] };
  const visit = async (dir: string, depth: number): Promise<void> => {
    let entries: PlanningDirent[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      const rel = relative(planningDir, full).split(sep).join('/');
      if (e.isDirectory()) {
        if (LAST_ACTIVITY_SKIP_DIRS.has(e.name)) continue;
        if (depth < 4) await visit(full, depth + 1);
        continue;
      }
      if (!e.isFile()) continue;
      let at: number;
      try {
        at = (await fs.stat(full)).mtimeMs;
      } catch {
        continue;
      }
      if (e.name === '.continue-here.md' && depth <= 3) res.continueHere.push({ file: rel, at });
      if (e.name === 'HANDOFF.json' && depth === 1) res.handoff = { file: rel, at };
      if (e.name.endsWith('.lock') || e.name === 'state.json') continue;
      if (!res.newest || at > res.newest.at) res.newest = { file: rel, at };
    }
  };
  await visit(planningDir, 1);
  return res;
}

async function readJsonFile(fs: PlanningFs, p: string): Promise<unknown | undefined> {
  try {
    return JSON.parse(await fs.readFile(p)) as unknown;
  } catch {
    return undefined;
  }
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined;
}

/** Strip GSD's slash-command prefix; both spellings ship (`gsd:` and `gsd-`, CONV-07). */
export function stripGsdPrefix(command: string): string {
  return command.trim().replace(/^\/?gsd[:-]/, '');
}

const CONCRETE_ACTION_IDS = new Set(['plan-phase', 'execute-phase', 'verify-work', 'discuss-phase', 'resume-work', 'ship']);
const NUMBERED_ACTION_IDS = new Set(['plan-phase', 'execute-phase', 'verify-work', 'discuss-phase', 'ship']);

interface SmartEntryAction {
  id?: string;
  label?: string;
  command?: string;
  recommended?: boolean;
}

/**
 * Turn a `smart-entry --json` document into a `gsd_next` token.
 *
 * GSD recommends `/gsd:progress --next` for every forward-motion case, which is
 * a *router*, not information. When the recommended action is that router and a
 * concrete alternative is on the menu, we promote the alternative so the token
 * reads `execute-phase 2` rather than `progress --next`. The action commands
 * carry no phase number (`/gsd:plan-phase`), so it is recovered from the
 * action's label ("Plan phase 4") or `signals.current_phase`.
 */
export function nextFromSmartEntry(doc: unknown): { command: string; label?: string; situation?: string; reason?: string } | undefined {
  if (!isObj(doc)) return undefined;
  const actions = Array.isArray(doc['actions']) ? (doc['actions'] as SmartEntryAction[]) : [];
  const recommendedId = str(doc['recommended']);
  const situation = str(doc['situation']);
  const summary = str(doc['summary']);
  const signals = isObj(doc['signals']) ? doc['signals'] : {};
  const phaseNo = str(signals['current_phase']);
  let chosen = actions.find((a) => isObj(a) && a.recommended === true);
  if (!chosen && recommendedId) chosen = actions.find((a) => isObj(a) && a.id === recommendedId);
  if (!chosen) {
    if (!recommendedId) return undefined;
    return { command: stripGsdPrefix(recommendedId), ...(situation ? { situation } : {}), ...(summary ? { reason: summary } : {}) };
  }
  let picked = chosen;
  if (stripGsdPrefix(picked.command ?? picked.id ?? '') === 'progress --next') {
    const alt = actions.find((a) => isObj(a) && typeof a.id === 'string' && CONCRETE_ACTION_IDS.has(a.id));
    if (alt) picked = alt;
  }
  const base = stripGsdPrefix(picked.command ?? picked.id ?? '');
  if (base === '') return undefined;
  let command = base;
  const id = picked.id ?? base;
  if (NUMBERED_ACTION_IDS.has(id) && !/\d/.test(base)) {
    const fromLabel = /phase\s+(\d+(?:\.\d+)*)/i.exec(picked.label ?? '');
    const n = fromLabel ? trimNumber(fromLabel[1] as string) : phaseNo ? trimNumber(phaseNo) : undefined;
    if (n) command = `${base} ${n}`;
  }
  return {
    command,
    ...(picked.label ? { label: picked.label } : {}),
    ...(situation ? { situation } : {}),
    ...(summary ? { reason: summary } : {}),
  };
}

/** `@file:<path>` indirection: any gsd-tools JSON over 50 000 chars spills to tmp (io.cjs:27,194). */
async function resolveToolJson(fs: PlanningFs, res: RunResult): Promise<unknown | undefined> {
  const out = res.stdout.trim();
  if (out.startsWith('@file:')) return readJsonFile(fs, out.slice('@file:'.length).trim());
  if (res.json !== undefined) return res.json;
  if (out === '') return undefined;
  try {
    return JSON.parse(out) as unknown;
  } catch {
    return undefined;
  }
}

/** Every gsd-tools invocation in this package goes through here. */
async function runReadOnly(tools: ThrottledRunner, args: string[]): Promise<RunResult> {
  assertReadOnly(args);
  return tools.run(args);
}

async function gsdVersionFromTools(
  tools: ThrottledRunner,
  key: string,
  now: number,
  ttl: number,
  fs: PlanningFs,
  diagnostics: string[],
): Promise<string | undefined> {
  const hit = versionCache.get(key);
  if (hit && now - hit.at < ttl) return hit.version;
  let version: string | undefined;
  try {
    const res = await runReadOnly(tools, ['runtime-identity']);
    const doc = await resolveToolJson(fs, res);
    if (isObj(doc)) version = str(doc['version']);
  } catch (e) {
    diagnostics.push(`gsd-tools runtime-identity failed: ${(e as Error).message}`);
  }
  versionCache.set(key, { at: now, version });
  return version;
}

async function gsdVersionFromDisk(fs: PlanningFs, root: string, env: NodeJS.ProcessEnv, home: string): Promise<string | undefined> {
  const roots = [join(root, '.claude')];
  if (env['CLAUDE_CONFIG_DIR']) roots.push(env['CLAUDE_CONFIG_DIR']);
  roots.push(join(home, '.claude'), join(home, '.claude-gsd'));
  for (const r of roots) {
    try {
      const v = (await fs.readFile(join(r, 'gsd-core', 'VERSION'))).trim();
      if (v !== '') return v;
    } catch {
      /* next candidate */
    }
  }
  return undefined;
}

interface PhaseScan extends PhaseInfo {
  dir: string;
}

async function scanPhases(fs: PlanningFs, planningDir: string, diagnostics: string[]): Promise<PhaseScan[]> {
  const phasesDir = join(planningDir, 'phases');
  let entries: PlanningDirent[];
  try {
    entries = await fs.readdir(phasesDir);
  } catch {
    return [];
  }
  const out: PhaseScan[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const m = PHASE_DIR_RE.exec(e.name);
    if (!m) continue;
    const number = m[1] as string;
    if (isSentinelPhaseId(number)) continue;
    const dir = join(phasesDir, e.name);
    let files: PlanningDirent[];
    try {
      files = await fs.readdir(dir);
    } catch {
      diagnostics.push(`phase dir unreadable: ${e.name}`);
      continue;
    }
    const names = files.filter((f) => f.isFile()).map((f) => f.name);
    // nested plans/ subdirectory is also supported (#3139)
    if (files.some((f) => f.isDirectory() && f.name === 'plans')) {
      try {
        const nested = await fs.readdir(join(dir, 'plans'));
        for (const n of nested) if (n.isFile()) names.push(n.name);
      } catch {
        /* ignore */
      }
    }
    const plans = names.filter(isPlanFile).length;
    const summaries = names.filter(isSummaryFile).length;
    const hasContext = names.some((n) => n.endsWith('-CONTEXT.md') || n.endsWith('-DISCUSSION-LOG.md'));
    const verifName = names.find((n) => n.endsWith('-VERIFICATION.md') || n === 'VERIFICATION.md');
    const uatName = names.find((n) => n.endsWith('-UAT.md') || n === 'UAT.md');
    // `NN-UI-REVIEW.md` also ends with `-REVIEW.md`; it is a separate pass and
    // must never be mistaken for the code-review gate.
    const uiReview = names.some((n) => isUiReviewFile(n));
    const reviewName = names.find((n) => isReviewFile(n));
    let verification: string | undefined;
    if (verifName) verification = await frontmatterStatus(fs, join(dir, verifName), ['status']);
    let uat: 'pending' | 'pass' | 'fail' | undefined;
    if (uatName) uat = mapUatStatus(await frontmatterStatus(fs, join(dir, uatName), ['status', 'result']));
    const review = reviewName ? await readPhaseReview(fs, join(dir, reviewName)) : undefined;
    out.push({
      number,
      slug: m[2] as string,
      dir: e.name,
      plans,
      summaries,
      status: derivePhaseStatus({ plans, summaries, hasContext, hasVerification: verifName !== undefined, hasReview: reviewName !== undefined, ...(verification ? { verification } : {}) }),
      ...(uat ? { uat } : {}),
      ...(review ? { review } : {}),
      ...(uiReview ? { uiReview: true } : {}),
    });
  }
  out.sort((a, b) => cmpPhaseNumber(a.number, b.number));
  return out;
}

/** `plan-scan.cjs:84,152`: ends with `-PLAN.md`, or is a bare `PLAN.md`. */
export function isPlanFile(name: string): boolean {
  return name.endsWith('-PLAN.md') || name === 'PLAN.md';
}
export function isSummaryFile(name: string): boolean {
  return name.endsWith('-SUMMARY.md') || name === 'SUMMARY.md';
}

/** `workflows/ui-phase.md`'s pass — checked first, because it also ends `-REVIEW.md`. */
export function isUiReviewFile(name: string): boolean {
  return name.endsWith('-UI-REVIEW.md') || name === 'UI-REVIEW.md';
}

/** The code-review gate's artifact (`workflows/code-review.md:688`), never the UI one. */
export function isReviewFile(name: string): boolean {
  if (isUiReviewFile(name)) return false;
  return name.endsWith('-REVIEW.md') || name === 'REVIEW.md';
}

/** The raw text between the frontmatter fences, or `''` when there is none. */
function frontmatterBlock(text: string): string {
  if (!/^---\r?\n/.test(text)) return '';
  const lines = text.split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    if ((lines[i] as string).trim() === '---') return lines.slice(1, i).join('\n');
  }
  return '';
}

/**
 * One level of a nested frontmatter map, e.g. `findings:` → `{critical: '0'}`.
 *
 * `parseFrontmatter` is anchored at column 0 and so skips nested keys entirely,
 * which is what keeps `re_verification.previous_status: gaps_found` from being
 * read as the top-level `status` — GSD warns about exactly that substring trap
 * (`bin/lib/commands.cjs:142-144`). This reader keeps the same discipline: it
 * only descends under the one named parent key.
 */
function frontmatterNested(block: string, key: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = block.split(/\r?\n/);
  const head = new RegExp(`^${escapeRe(key)}:[ \\t]*$`);
  let i = lines.findIndex((l) => head.test(l as string));
  if (i === -1) return out;
  for (i += 1; i < lines.length; i++) {
    const line = lines[i] as string;
    if (line.trim() === '') continue;
    const m = /^[ \t]+([A-Za-z0-9_-]+):[ \t]*(.*)$/.exec(line);
    if (!m) break; // back at column 0, or a list item: the nested block ended
    out[m[1] as string] = (m[2] as string).trim();
  }
  return out;
}

const REVIEW_STATUSES = new Set<PhaseReview['status']>(['clean', 'issues_found', 'skipped']);

/** `NN-REVIEW.md` frontmatter (`agents/gsd-code-reviewer.md:273-291`). */
async function readPhaseReview(fs: PlanningFs, file: string): Promise<PhaseReview | undefined> {
  let text: string;
  try {
    text = await fs.readFile(file);
  } catch {
    return undefined;
  }
  const { fm } = parseFrontmatter(text);
  const raw = fm['status'] as PhaseReview['status'] | undefined;
  const findings = frontmatterNested(frontmatterBlock(text), 'findings');
  const count = (k: string): number => {
    const n = Number(findings[k]);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };
  return {
    status: raw !== undefined && REVIEW_STATUSES.has(raw) ? raw : 'unknown',
    critical: count('critical'),
    warning: count('warning'),
    info: count('info'),
  };
}

/** GSD reads the VERIFICATION status from the **frontmatter only** (#1159). */
async function frontmatterStatus(fs: PlanningFs, file: string, keys: string[]): Promise<string | undefined> {
  let text: string;
  try {
    text = await fs.readFile(file);
  } catch {
    return undefined;
  }
  const { fm } = parseFrontmatter(text);
  for (const k of keys) if (fm[k]) return fm[k];
  return undefined;
}

function cmpPhaseNumber(a: string, b: string): number {
  const pa = a.split('.').map((x) => Number(x));
  const pb = b.split('.').map((x) => Number(x));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return a.localeCompare(b);
}

function minimalSnapshot(root: string, planningDir: string, observedAt: number, health: ProjectSnapshot['health']): ProjectSnapshot {
  return { root, planningDir, observedAt, health, phases: [], blockers: [] };
}

/**
 * Read a `ProjectSnapshot` for `root`.
 *
 * The filesystem parse always runs — this is the harness-agnostic core and every
 * M1 acceptance criterion must hold with zero adapters and no `gsd-tools`
 * (spec §2.3.2). `opts.tools`, when supplied, only ever *enriches*; any failure
 * is recorded as a diagnostic and the filesystem values stand.
 */
export async function readProjectSnapshot(root: string, opts: ReadSnapshotOptions = {}): Promise<ProjectSnapshot> {
  const fs = opts.fs ?? nodePlanningFs;
  const now = (opts.now ?? Date.now)();
  const env = opts.env ?? process.env;
  const home = opts.home ?? homedir();
  const planningDir = join(root, '.planning');
  const diagnostics: string[] = [];

  // ---- existence ------------------------------------------------------
  const paths = {
    state: join(planningDir, 'STATE.md'),
    project: join(planningDir, 'PROJECT.md'),
    roadmap: join(planningDir, 'ROADMAP.md'),
  };
  const [stateText, projectText, roadmapText] = await Promise.all([
    fs.readFile(paths.state).catch(() => undefined),
    fs.readFile(paths.project).catch(() => undefined),
    fs.readFile(paths.roadmap).catch(() => undefined),
  ]);
  if (stateText === undefined && projectText === undefined && roadmapText === undefined) {
    return minimalSnapshot(root, planningDir, now, 'no_planning');
  }

  // ---- locks ----------------------------------------------------------
  for (const lock of LOCK_FILES) {
    try {
      await waitForStateUnlocked(planningDir, { ...opts.lock, lockName: lock });
    } catch (e) {
      if (!(e instanceof PlanningLockedError)) throw e;
      const base = opts.previous ?? minimalSnapshot(root, planningDir, now, 'locked');
      return { ...base, root, planningDir, observedAt: now, health: 'locked' };
    }
  }

  // ---- STATE.md -------------------------------------------------------
  let health: ProjectSnapshot['health'] = 'ok';
  const { fm, body, malformed } = parseFrontmatter(stateText ?? '');
  if (malformed) {
    health = 'parse_error';
    diagnostics.push('STATE.md: frontmatter fence opened but never closed');
  }
  let stateMtime = 0;
  if (stateText !== undefined) {
    try {
      stateMtime = (await fs.stat(paths.state)).mtimeMs;
    } catch {
      /* keep 0 */
    }
  }
  const positionSlice = stateCurrentPositionSlice(body);

  const field = (fmKey: string, bodyField: string, scope = body): string | undefined => fm[fmKey] ?? stateExtractField(scope, bodyField);

  const pausedAt = field('paused_at', 'Paused at');
  const statusRaw = field('status', 'Status', positionSlice);
  const status = normalizeStateStatus(statusRaw, pausedAt);
  const declaredStep = stepForStatus(status);

  // phase number/slug: frontmatter first, then the `## Current Position` slice
  let phaseNumber = fm['current_phase'];
  let phaseSlug = fm['current_phase_name'];
  const phaseLine = stateExtractField(positionSlice, 'Phase');
  if (phaseLine) {
    const m = /^(\d+(?:\.\d+)*)\s*(.*)$/.exec(phaseLine.trim());
    if (m) {
      phaseNumber ??= m[1] as string;
      if (phaseSlug === undefined) {
        // `02 (slug) — EXECUTING`, `4 — Images`, `7 — Name (not started)` all appear
        // across the three real 1.14 fixtures; peel them in that order.
        const tail = (m[2] as string)
          .replace(/^[—–\-:(]\s*/, '')
          .replace(/\s*[—–-]\s*[A-Z ]+$/, '')
          .replace(/\s*\([^)]*\)\s*$/, '')
          .replace(/\)\s*$/, '')
          .trim();
        if (tail !== '') phaseSlug = tail;
      }
    }
  }

  const planLine = stateExtractField(positionSlice, 'Plan');
  let statePlan: { id: string; index: number; total: number } | undefined;
  if (planLine) {
    const m = /(\d+)\s+of\s+(\d+)/i.exec(planLine);
    if (m) {
      const index = Number(m[1]);
      const total = Number(m[2]);
      const pad = String(index).padStart(2, '0');
      statePlan = { id: phaseNumber ? `${phaseNumber}-${pad}` : pad, index, total };
    }
  }
  const waveLine = stateExtractField(positionSlice, 'Wave');
  const waveMatch = waveLine ? /(\d+)/.exec(waveLine) : undefined;
  const wave = waveMatch ? Number(waveMatch[1]) : undefined;

  const blockers = parseBlockers(body);
  const concerns = parseConcerns(body);
  const humanStops = parseHumanStops(body);

  // ---- phases ---------------------------------------------------------
  const phases = await scanPhases(fs, planningDir, diagnostics);

  // ROADMAP override → complete
  if (roadmapText !== undefined) {
    const progress = parseRoadmapProgress(roadmapText);
    const checkboxes = progress.size > 0 ? new Map<string, boolean>() : parseRoadmapCheckboxes(roadmapText);
    for (const p of phases) {
      const key = trimNumber(p.number);
      const cell = progress.get(key);
      if (cell !== undefined && /^complete$/i.test(cell.trim())) p.status = 'complete';
      else if (checkboxes.get(key) === true) p.status = 'complete';
    }
  }

  // ---- state.json (GSD's own published contract, spike §2.3) ----------
  const stateJsonPath = join(planningDir, 'state.json');
  const stateJson = await readJsonFile(fs, stateJsonPath);
  let milestone = fm['milestone'];
  let nextFromStateJson: { command: string; label?: string; reason?: string } | undefined;
  if (isObj(stateJson)) {
    const updatedAt = Date.parse(str(stateJson['updated_at']) ?? '');
    /**
     * `state.json` is a **best-effort publisher**: `state-contract.cjs` writes it
     * at 11 step-boundary commands only, while STATE.md is rewritten on every
     * plan advance. Gating the phase list on `updated_at >= STATE.md mtime` threw
     * GSD's own record away on essentially every snapshot (both live projects
     * logged `state.json ignored as stale` continuously), leaving phase status to
     * be inferred from counting PLAN/SUMMARY files — which is how phase 40 read
     * `complete` while STATE.md said `executing` and state.json said
     * `in_progress`. The per-phase statuses are now always trusted; only `next`,
     * which genuinely does go stale, keeps the freshness gate — as does
     * `milestone`, whose identity is time-sensitive and owned by ROADMAP.md.
     */
    const jsonPhases = Array.isArray(stateJson['phases']) ? stateJson['phases'] : [];
    for (const raw of jsonPhases) {
      if (!isObj(raw)) continue;
      const n = str(raw['number']);
      if (!n) continue;
      const s = str(raw['status']);
      const target = phases.find((p) => trimNumber(p.number) === trimNumber(n));
      // A phase state.json knows about but that has no directory yet is left
      // out: `snap.phases` means "phases with artifacts on disk" to the
      // dashboard, the `next` rules and `diffSnapshots`, and widening it here
      // would change all three. `milestoneComplete` (projection.ts) guards the
      // "last built phase is done, milestone is not" case on its own.
      if (!target) continue;
      if (s === 'complete') target.status = 'complete';
      else if (s === 'in_progress' && target.status !== 'verifying' && target.status !== 'reviewing') target.status = 'executing';
      // `pending` is lossy by design (spike §2.3) — keep the filesystem value
    }
    if (Number.isNaN(updatedAt) || updatedAt < stateMtime - 2000) {
      diagnostics.push(
        `state.json ignored as stale for milestone/next (updated_at=${str(stateJson['updated_at']) ?? 'invalid'}, STATE.md mtime=${new Date(stateMtime).toISOString()}); phase statuses still applied`,
      );
    } else {
      milestone = str(stateJson['milestone']) ?? milestone;
      const n = isObj(stateJson['next']) ? stateJson['next'] : undefined;
      const cmd = n ? str(n['command']) : undefined;
      if (n && cmd) {
        nextFromStateJson = {
          command: stripGsdPrefix(cmd),
          ...(str(n['label']) ? { label: str(n['label']) as string } : {}),
          ...(str(n['reason']) ? { reason: str(n['reason']) as string } : {}),
        };
      }
    }
  }

  // ---- walk: lastActivity + pause markers ------------------------------
  const walk = await walkPlanning(fs, planningDir);
  let paused: { file: string; at: number } | undefined;
  /**
   * `.continue-here.md` still pauses on presence — `/gsd-resume-work` consumes
   * it, so it cannot go stale (see DECISIONS O-pause).
   *
   * `HANDOFF.json` can and does: GSD never deletes it, so GPS.CommercialCRM
   * rendered `gsd_status = paused` for six days off a 2026-09-11 handoff that
   * recorded phase 34 while STATE.md had moved on to phase 41. It is honoured
   * only when it still describes the present — it names the current phase, and
   * it is not older than STATE.md's own `last_updated`.
   *
   * Both comparisons use *declared* timestamps, never mtimes: clone, checkout
   * and rsync restamp `.planning/` wholesale (three of six real local projects
   * carry bulk-restamped trees), which would make every marker look brand new.
   *
   * An ignored marker is reported as a diagnostic rather than kept on the
   * snapshot: `snap.paused` has five consumers (the `next` rules, the notifier,
   * both status derivations and `diffSnapshots`) and each means "paused now".
   */
  const stateUpdatedAt = Date.parse(fm['last_updated'] ?? '');
  const continueHere = [...walk.continueHere].sort((a, b) => b.at - a.at)[0];
  if (continueHere) paused = { file: continueHere.file, at: continueHere.at };
  else if (walk.handoff) {
    const m = walk.handoff;
    const doc = await readJsonFile(fs, join(planningDir, m.file));
    const handoffPhase = isObj(doc) ? str(doc['phase']) : undefined;
    const handoffAt = isObj(doc) ? Date.parse(str(doc['timestamp']) ?? str(doc['paused_at']) ?? '') : NaN;
    if (phaseNumber !== undefined && handoffPhase !== undefined && trimNumber(handoffPhase) !== trimNumber(phaseNumber)) {
      diagnostics.push(`pause marker ${m.file} ignored: records phase ${handoffPhase}, current phase is ${phaseNumber}`);
    } else if (!Number.isNaN(handoffAt) && !Number.isNaN(stateUpdatedAt) && handoffAt < stateUpdatedAt) {
      diagnostics.push(`pause marker ${m.file} ignored as stale (handoff=${new Date(handoffAt).toISOString()}, STATE.md last_updated=${new Date(stateUpdatedAt).toISOString()})`);
    } else {
      paused = { file: m.file, at: m.at };
    }
  }
  if (!paused && pausedAt !== undefined && collapse(pausedAt).toLowerCase() !== 'none') paused = { file: 'STATE.md', at: stateMtime };

  // ---- blocked ---------------------------------------------------------
  // `blocked` is plugin-derived, never a GSD value, and only the **current**
  // phase can earn it: STATE.md's position status token says so, or a
  // GSD-faithful `## Blockers` item is tagged `[Phase N]` with the current
  // phase, or there are untagged `## Blockers` items. `concerns` never blocks.
  const positionStatusIsBlocked = collapse(statusRaw ?? '').toLowerCase() === 'blocked';
  if (phaseNumber !== undefined) {
    const key = trimNumber(phaseNumber);
    const current = phases.find((p) => trimNumber(p.number) === key);
    const mine = blockers.some((b) => {
      const tag = blockerPhaseTag(b);
      return tag === undefined || tag === key;
    });
    if (current && (positionStatusIsBlocked || mine)) current.status = 'blocked';
  }

  // ---- project / config -------------------------------------------------
  const nameFromProject = projectText ? /^#[ \t]+(.+)$/m.exec(projectText)?.[1]?.trim() : undefined;
  const nameFromRoadmap = roadmapText ? /^#[ \t]+(.+)$/m.exec(roadmapText)?.[1]?.trim() : undefined;
  const projectName = nameFromProject ?? nameFromRoadmap ?? basename(root);
  milestone ??= stateExtractField(body, 'Milestone');

  const config = parseGsdConfig(await readJsonFile(fs, join(planningDir, 'config.json')));

  // ---- snapshot so far --------------------------------------------------
  const snap: ProjectSnapshot = {
    root,
    planningDir,
    observedAt: now,
    health,
    phases: phases.map(({ dir: _dir, ...rest }) => rest),
    blockers,
    project: { name: projectName, ...(milestone ? { milestone } : {}) },
  };
  if (concerns.length > 0) snap.concerns = concerns;
  if (humanStops.length > 0) snap.humanStops = humanStops;
  if (walk.newest) snap.lastActivity = walk.newest;
  if (paused) snap.paused = paused;
  if (config) snap.config = config;

  const currentPhase = phaseNumber !== undefined ? snap.phases.find((p) => trimNumber(p.number) === trimNumber(phaseNumber as string)) : undefined;
  const plan = reconcilePlanPosition(statePlan, currentPhase, phaseNumber);
  /**
   * STATE.md declares the step; the current phase's artifacts are the only
   * source for the two steps it never records. GSD writes no `Status` during
   * either the code-review gate or verification, so a STATE.md that still says
   * `executing` while every plan has a summary is simply behind its own
   * evidence — defer to the phase, and only for the *current* phase (IDP's
   * `53-VERIFICATION.md` was reconciled after phase 54 had already opened).
   */
  const phaseStep = currentPhase ? stepForStatus(currentPhase.status) : undefined;
  const step = advancedStep(declaredStep, phaseStep);
  if (phaseNumber !== undefined || plan || wave !== undefined || step) {
    snap.position = {};
    if (phaseNumber !== undefined) {
      snap.position.phase = {
        number: phaseNumber,
        slug: phaseSlug ?? currentPhase?.slug ?? '',
        status: currentPhase?.status ?? (positionStatusIsBlocked ? 'blocked' : 'not_started'),
      };
    }
    if (plan) snap.position.plan = plan;
    if (wave !== undefined) snap.position.wave = wave;
    if (step) snap.position.step = step;
  }

  // ---- gsd-tools enrichment (optional) ---------------------------------
  let smartEntryDoc: unknown;
  if (opts.tools) {
    const toolsInfo: NonNullable<ProjectSnapshot['tools']> = { available: true };
    if (opts.toolsSource) toolsInfo.source = opts.toolsSource;
    let anyOk = false;
    try {
      const res = await runReadOnly(opts.tools, ['state-snapshot', '--project-dir', root]);
      const doc = await resolveToolJson(fs, res);
      if (isObj(doc) && !str(doc['error'])) {
        anyOk = true;
        applyStateSnapshot(snap, doc);
      } else {
        diagnostics.push(`gsd-tools state-snapshot: ${isObj(doc) ? String(doc['error']) : res.stderr.trim() || 'no JSON output'}`);
      }
    } catch (e) {
      diagnostics.push(`gsd-tools state-snapshot failed: ${(e as Error).message}`);
    }
    try {
      const res = await runReadOnly(opts.tools, ['smart-entry', '--json', '--project-dir', root]);
      const doc = await resolveToolJson(fs, res);
      if (isObj(doc)) {
        anyOk = true;
        smartEntryDoc = doc;
      } else diagnostics.push(`gsd-tools smart-entry: ${res.stderr.trim() || 'no JSON output'}`);
    } catch (e) {
      diagnostics.push(`gsd-tools smart-entry failed: ${(e as Error).message}`);
    }
    const version = await gsdVersionFromTools(opts.tools, opts.toolsSource ?? root, now, opts.versionTtlMs ?? 600_000, fs, diagnostics);
    if (version) {
      toolsInfo.version = version;
      snap.gsdVersion = version;
      anyOk = true;
    }
    toolsInfo.available = anyOk;
    snap.tools = toolsInfo;
  }
  if (!snap.gsdVersion) {
    snap.gsdVersion = (await gsdVersionFromDisk(fs, root, env, home)) ?? (isObj(stateJson) ? str(stateJson['flavor']) : undefined);
  }

  // ---- next -------------------------------------------------------------
  const fromSmart = nextFromSmartEntry(smartEntryDoc);
  if (fromSmart) snap.next = { ...fromSmart, source: 'smart-entry' };
  else if (nextFromStateJson) snap.next = { ...nextFromStateJson, source: 'state.json' };
  else snap.next = { command: recommendNext(snap), source: 'rules' };

  if (diagnostics.length > 0) snap.diagnostics = diagnostics;
  return snap;
}

/**
 * The `.planning/config.json` keys orchestration and projection act on
 * (`references/planning-config.md`). Unknown/invalid values are dropped, never
 * defaulted here: "unset" is itself information (e.g. `use_worktrees` unset
 * means GSD's default of `true`, which the planner spells out).
 */
export function parseGsdConfig(doc: unknown): GsdProjectConfig | undefined {
  if (!isObj(doc)) return undefined;
  const cfg: GsdProjectConfig = {};
  if (typeof doc['parallelization'] === 'boolean') cfg.parallelization = doc['parallelization'];
  if (typeof doc['model_profile'] === 'string') cfg.modelProfile = doc['model_profile'];
  if (typeof doc['commit_docs'] === 'boolean') cfg.commitDocs = doc['commit_docs'];
  if (typeof doc['mode'] === 'string') cfg.mode = doc['mode'];
  const workflow = isObj(doc['workflow']) ? doc['workflow'] : undefined;
  if (workflow) {
    if (typeof workflow['use_worktrees'] === 'boolean') cfg.useWorktrees = workflow['use_worktrees'];
    if (typeof workflow['auto_advance'] === 'boolean') cfg.autoAdvance = workflow['auto_advance'];
  }
  const git = isObj(doc['git']) ? doc['git'] : undefined;
  if (git) {
    const strategy = git['branching_strategy'];
    if (strategy === 'none' || strategy === 'phase' || strategy === 'milestone') cfg.branchingStrategy = strategy;
    if (typeof git['phase_branch_template'] === 'string' && git['phase_branch_template'].trim() !== '') cfg.phaseBranchTemplate = git['phase_branch_template'];
    if (typeof git['allow_default_branch_commits'] === 'boolean') cfg.allowDefaultBranchCommits = git['allow_default_branch_commits'];
  }
  return Object.keys(cfg).length === 0 ? undefined : cfg;
}

/** `state-snapshot` is the closest GSD match to `ProjectSnapshot.position` (spike §2.2). */
function applyStateSnapshot(snap: ProjectSnapshot, doc: Record<string, unknown>): void {
  const number = str(doc['current_phase']);
  const name = str(doc['current_phase_name']);
  const status = normalizeStateStatus(str(doc['status']), str(doc['paused_at']));
  const step = stepForStatus(status);
  const phaseInfo = number ? snap.phases.find((p) => trimNumber(p.number) === trimNumber(number)) : undefined;
  if (number) {
    snap.position ??= {};
    snap.position.phase = {
      number,
      slug: name ?? phaseInfo?.slug ?? snap.position.phase?.slug ?? '',
      status: phaseInfo?.status ?? snap.position.phase?.status ?? 'not_started',
    };
  }
  const idx = doc['current_plan'];
  const total = doc['total_plans_in_phase'];
  if (typeof idx === 'number' && typeof total === 'number') {
    snap.position ??= {};
    snap.position.plan = { id: `${number ?? ''}-${String(idx).padStart(2, '0')}`.replace(/^-/, ''), index: idx, total };
  }
  if (step) {
    snap.position ??= {};
    snap.position.step = step;
  }
  const bl = doc['blockers'];
  if (Array.isArray(bl) && bl.length > 0) {
    snap.blockers = [...new Set([...bl.filter((b): b is string => typeof b === 'string'), ...snap.blockers])];
  }
  const pausedAt = str(doc['paused_at']);
  if (pausedAt && collapse(pausedAt).toLowerCase() !== 'none' && !snap.paused) {
    snap.paused = { file: 'STATE.md', at: snap.observedAt };
  }
}

/* ------------------------------------------------------------------ *
 * watcher helpers
 * ------------------------------------------------------------------ */

/** Change set for the watcher (spec §4.2). */
export function diffSnapshots(before: ProjectSnapshot | undefined, after: ProjectSnapshot): ChangeKey[] {
  const keys: ChangeKey[] = [];
  if (!before) return after.health === 'no_planning' ? ['health'] : ['phase', 'step', 'status', 'blockers', 'uat', 'paused', 'health'];
  const bp = before.position?.phase;
  const ap = after.position?.phase;
  if (bp?.number !== ap?.number || bp?.slug !== ap?.slug) keys.push('phase');
  const bStep = stepKey(before);
  const aStep = stepKey(after);
  if (bStep !== aStep) keys.push('step');
  if (bp?.status !== ap?.status || deriveGsdStatus(before) !== deriveGsdStatus(after) || phaseStatusKey(before) !== phaseStatusKey(after)) {
    keys.push('status');
  }
  if (before.blockers.join(' ') !== after.blockers.join(' ')) keys.push('blockers');
  if (uatKey(before) !== uatKey(after)) keys.push('uat');
  if (before.paused?.file !== after.paused?.file) keys.push('paused');
  if (before.health !== after.health) keys.push('health');
  if (humanKey(before) !== humanKey(after)) keys.push('human');
  return keys;
}

function stepKey(s: ProjectSnapshot): string {
  const p = s.position?.plan;
  return `${s.position?.step ?? ''}:${p ? `${p.index}/${p.total}` : ''}`;
}
function phaseStatusKey(s: ProjectSnapshot): string {
  return s.phases.map((p) => `${p.number}=${p.status}`).join(',');
}
function uatKey(s: ProjectSnapshot): string {
  return s.phases.map((p) => `${p.number}=${p.uat ?? ''}`).join(',');
}
function humanKey(s: ProjectSnapshot): string {
  return (s.humanStops ?? []).map((h) => `${h.marker}:${h.text}`).join('|');
}

const PHASE_TO_GSD_STATUS: Record<PhaseStatus, GsdStatus> = {
  not_started: 'idle',
  discussed: 'planning',
  planned: 'planning',
  executing: 'executing',
  reviewing: 'reviewing',
  verifying: 'verifying',
  complete: 'complete',
  blocked: 'blocked',
};

/**
 * The `gsd_status` workspace token (spec §3.3).
 *
 * `blocked` comes only from `blockers` (GSD's own h2 `## Blockers`, or
 * `state-snapshot.blockers`) and from a `blocked` status token — never from
 * `concerns`.
 *
 * Divergence from the spec's "`paused` if continue-here.md is newer than
 * STATE.md": GSD's `/gsd-resume-work` *consumes* the marker, so presence alone
 * is the signal. An mtime comparison would only add false negatives whenever a
 * hook touches STATE.md after the pause (e.g. `state record-session` on context
 * exhaustion, spike §4).
 */
export function deriveGsdStatus(snap: ProjectSnapshot): GsdStatus {
  if (snap.health === 'no_planning') return 'idle';
  if (snap.paused) return 'paused';
  // `blockers` only — `concerns` are advisories and must never gate a project.
  // `humanStops` (`## Needs Human`, `## Deferred Verification`) are GSD's own "stop" signal.
  if (snap.blockers.length > 0 || (snap.humanStops?.length ?? 0) > 0 || snap.phases.some((p) => p.status === 'blocked')) return 'blocked';
  if (snap.phases.length > 0 && snap.phases.every((p) => p.status === 'complete')) return 'complete';
  const current = snap.position?.phase?.number;
  const phase = current !== undefined ? snap.phases.find((p) => trimNumber(p.number) === trimNumber(current)) : undefined;
  const pick = phase ?? snap.phases.find((p) => p.status !== 'complete');
  if (pick) return PHASE_TO_GSD_STATUS[pick.status];
  const step = snap.position?.step;
  if (step === 'plan' || step === 'discuss') return 'planning';
  if (step === 'execute') return 'executing';
  if (step === 'verify') return 'verifying';
  if (step === 'ship') return 'complete';
  return 'idle';
}

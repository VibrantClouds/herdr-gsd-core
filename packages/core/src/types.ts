/**
 * Data contracts for herdr-gsd-core (spec §3).
 * packages/core has no Herdr dependencies: it only understands `.planning/`.
 */

export type PhaseStatus =
  | 'not_started'
  | 'discussed'
  | 'planned'
  | 'executing'
  | 'verifying'
  | 'complete'
  | 'blocked';

export type Health = 'ok' | 'no_planning' | 'locked' | 'parse_error' | 'tools_missing';

export type Step = 'discuss' | 'plan' | 'execute' | 'verify' | 'ship';

export interface PhaseInfo {
  number: string;
  slug: string;
  status: PhaseStatus;
  plans: number;
  summaries: number;
  uat?: 'pending' | 'pass' | 'fail';
}

export interface ProjectSnapshot {
  /** abs path of repo containing .planning */
  root: string;
  planningDir: string;
  /** unix ms */
  observedAt: number;
  health: Health;
  gsdVersion?: string;
  project?: { name: string; milestone?: string };
  position?: {
    phase?: { number: string; slug: string; status: PhaseStatus };
    plan?: { id: string; index: number; total: number };
    wave?: number;
    step?: Step;
  };
  phases: PhaseInfo[];
  /** GSD-faithful: the h2 `## Blockers` section, or `state-snapshot.blockers`. Gates `blocked`. */
  blockers: string[];
  /**
   * `### Blockers/Concerns` under `## Accumulated Context` — what real projects
   * actually write, and what GSD's own parser misses (spike §7). Advisory only:
   * never gates `blocked`.
   */
  concerns?: string[];
  /** newest mtime under .planning (excluding *.lock) */
  lastActivity?: { file: string; at: number };
  /** a `.continue-here.md` under `.planning`, `HANDOFF.json`, or STATE.md `paused_at` (spike §7) */
  paused?: { file: string; at: number };
  /** gsd-tools state sync --verify, throttled */
  drift?: { stateVsDisk: boolean; details?: string };
  /** `.planning/config.json` keys the plugin acts on (spike M4 §1; all optional, absent when unset). */
  config?: GsdProjectConfig;
  /**
   * "Stop, a human is required" markers GSD writes into STATE.md (spike M4 G6):
   * `## Needs Human` rows (autonomous mode after 3 failed retries) and
   * `## Deferred Verification` rows. Any entry refuses new orchestration runs
   * and forces `gsd_status = blocked`.
   */
  humanStops?: HumanStop[];
  /** recommended next GSD command, `/gsd:`/`/gsd-` prefix stripped (spec §3.3 `gsd_next`) */
  next?: {
    command: string;
    source: 'state.json' | 'smart-entry' | 'rules';
    label?: string;
    reason?: string;
    /** smart-entry's own classification: paused|blocked|executing|planning|… */
    situation?: string;
  };
  /** gsd-tools availability for this project (enrichment only; never required) */
  tools?: { available: boolean; source?: string; version?: string };
  /** free-form parse diagnostics (never shown in tokens; logged) */
  diagnostics?: string[];
}

export interface GsdProjectConfig {
  parallelization?: boolean;
  modelProfile?: string;
  /** `commit_docs` — when false `.planning/` is not in git, so a worktree cannot see it. */
  commitDocs?: boolean;
  /** `workflow.use_worktrees` — GSD's own per-executor worktrees (default true when unset). */
  useWorktrees?: boolean;
  /** `git.branching_strategy` — `none` | `phase` | `milestone`. */
  branchingStrategy?: 'none' | 'phase' | 'milestone';
  /** `git.phase_branch_template`, e.g. `gsd/phase-{phase}-{slug}`. */
  phaseBranchTemplate?: string;
  /** `git.allow_default_branch_commits` — when false/unset GSD prompts before committing on main. */
  allowDefaultBranchCommits?: boolean;
  /** `workflow.auto_advance` — GSD chains steps itself. */
  autoAdvance?: boolean;
  /** `mode` — `yolo` runs without checkpoints; anything else expects human gates. */
  mode?: string;
}

export interface HumanStop {
  marker: 'needs_human' | 'deferred_verification';
  text: string;
}

export type ActivityKind =
  | 'session.start'
  | 'session.stop'
  | 'subagent.start'
  | 'subagent.stop'
  | 'tool.pre'
  | 'tool.post'
  | 'compact.pre'
  | 'phase.boundary';

export type Harness = 'claude-code' | 'codex' | 'opencode' | 'other';

/** One JSONL line in the activity spool (spec §3.2). */
export interface ActivityEvent {
  v: 1;
  /** unix ms */
  ts: number;
  harness: Harness;
  sessionId?: string;
  /** project root as seen by the harness */
  cwd: string;
  panePid?: number;
  /** Herdr pane id if the harness inherited Herdr's pane env */
  paneId?: string;
  kind: ActivityKind;
  /** e.g. gsd-executor, gsd-verifier */
  agent?: string;
  tool?: string;
  /** ≤200 chars, redacted */
  detail?: string;
}

/** Derived workspace-level status token (spec §3.3). */
export type GsdStatus = 'idle' | 'planning' | 'executing' | 'verifying' | 'blocked' | 'paused' | 'complete';

/** Change set emitted by the watcher after diffing snapshots (spec §4.2). */
export type ChangeKey = 'phase' | 'step' | 'status' | 'blockers' | 'uat' | 'paused' | 'health' | 'human';
export interface SnapshotChange {
  keys: ChangeKey[];
  before?: ProjectSnapshot;
  after: ProjectSnapshot;
}

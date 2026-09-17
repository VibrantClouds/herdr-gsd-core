import type { ProjectSnapshot, GsdStatus } from '@herdr-gsd/core';
import type { ActivityView } from './activity';

/**
 * Pure mapping from snapshots/activity to Herdr metadata tokens (spec §3.3).
 * Token values are clamped to 80 chars by the client; keep them short here.
 */
export type WorkspaceTokens = {
  /** `03 auth` — number and name together */
  gsd_phase: string | null;
  /** `03` — for narrow sidebar rows */
  gsd_phase_num: string | null;
  /** `auth` — the name alone, meant for a row of its own */
  gsd_phase_name: string | null;
  gsd_step: string | null;
  gsd_status: string | null;
  gsd_next: string | null;
  gsd_err: string | null;
};

export type PaneTokens = {
  gsd_agent: string | null;
  gsd_workers: string | null;
  gsd_ctx: string | null;
};

/** Every workspace token cleared at once — used on shutdown and on unbind. */
export const CLEARED_WORKSPACE_TOKENS: WorkspaceTokens = {
  gsd_phase: null,
  gsd_phase_num: null,
  gsd_phase_name: null,
  gsd_step: null,
  gsd_status: null,
  gsd_next: null,
  gsd_err: null,
};

/**
 * De-slug a phase name for display.
 *
 * Only a real directory slug (`40-engine-wired-into-live-line-crud`) gets its
 * separators collapsed. `current_phase_name` is human text and may contain a
 * meaningful hyphen — `Production-Only Onboarding` must not become
 * `Production Only Onboarding` — so anything already containing a space is
 * left alone and merely trimmed and ellipsized.
 */
export function shortSlug(slug: string, max = 60): string {
  const s = (/\s/.test(slug) ? slug : slug.replace(/[-_]+/g, ' ')).trim();
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

export function statusFromSnapshot(snap: ProjectSnapshot): GsdStatus {
  if (snap.health === 'no_planning') return 'idle';
  if (snap.paused) return 'paused';
  if (milestoneComplete(snap)) return 'complete';
  const cur = snap.position?.phase ? snap.phases.find((p) => p.number === snap.position!.phase!.number) : undefined;
  const status = cur?.status ?? snap.position?.phase?.status;
  if (status === 'blocked' || snap.blockers.length > 0 || (snap.humanStops?.length ?? 0) > 0) return 'blocked';
  // A review that found something critical, or a verification that came back
  // `gaps_found`/`human_needed`, is the state that actually wants a human.
  if (cur?.review && cur.review.critical > 0) return 'blocked';
  // STATE.md's declared step is more current than plan/summary file counts (a phase with
  // plans but no summaries is "executing" once GSD has started executing it).
  const step = snap.position?.step;
  if (status === 'planned' || status === 'discussed' || status === 'not_started') {
    if (step === 'execute') return 'executing';
    if (step === 'review') return 'reviewing';
    if (step === 'verify') return 'verifying';
  }
  switch (status) {
    case 'executing':
      return 'executing';
    case 'reviewing':
      return 'reviewing';
    case 'verifying':
      return 'verifying';
    case 'planned':
    case 'discussed':
    case 'not_started':
      return 'planning';
    case 'complete':
      return snap.phases.some((p) => p.status !== 'complete') ? 'planning' : 'complete';
    default:
      return step === 'execute' ? 'executing' : step === 'review' ? 'reviewing' : step === 'verify' ? 'verifying' : 'idle';
  }
}

/**
 * `.planning/phases/` only ever holds the *current milestone's* phase
 * directories, and GSD does not create the next phase's directory until it
 * plans it — so "every directory is complete" is not "the milestone is done".
 * GPS.CommercialCRM had 37-40 all complete on disk while STATE.md had already
 * moved to phase 41 and state.json listed it as `pending`.
 *
 * Two independent guards, because four of six real projects predate
 * `state.json` and so cannot contribute a pending phase at all: every known
 * phase must be complete, *and* the phase STATE.md says we are on must be one
 * of them.
 */
function milestoneComplete(snap: ProjectSnapshot): boolean {
  if (snap.phases.length === 0) return false;
  if (!snap.phases.every((p) => p.status === 'complete')) return false;
  const pos = snap.position?.phase;
  if (!pos) return true;
  return pos.status === 'complete';
}

export function healthError(snap: ProjectSnapshot): string | null {
  switch (snap.health) {
    case 'ok':
      return null;
    case 'locked':
      return 'STATE.md locked';
    case 'parse_error':
      return 'parse error';
    case 'tools_missing':
      return 'gsd-tools missing';
    case 'no_planning':
      return null;
  }
}

export function workspaceTokens(snap: ProjectSnapshot, next: string | undefined, extraErr?: string): WorkspaceTokens {
  if (snap.health === 'no_planning') {
    return { ...CLEARED_WORKSPACE_TOKENS, gsd_err: extraErr ?? null };
  }
  const pos = snap.position;
  const phase = pos?.phase ? `${pos.phase.number} ${shortSlug(pos.phase.slug)}`.trim() : snap.phases.length ? '—' : 'none';
  const phaseNum = pos?.phase ? pos.phase.number : null;
  const phaseName = pos?.phase ? shortSlug(pos.phase.slug) || null : null;
  let step: string | null = null;
  if (pos?.step) {
    step = pos.step;
    if (pos.plan && pos.plan.total > 0) step += ` ${pos.plan.index}/${pos.plan.total}`;
    if (pos.wave !== undefined) step += ` w${pos.wave}`;
  } else if (pos?.plan && pos.plan.total > 0) {
    step = `plan ${pos.plan.index}/${pos.plan.total}`;
  }
  const err = healthError(snap) ?? extraErr ?? null;
  return {
    gsd_phase: phase,
    gsd_phase_num: phaseNum,
    gsd_phase_name: phaseName,
    gsd_step: step,
    gsd_status: statusFromSnapshot(snap),
    gsd_next: next ? next.slice(0, 80) : null,
    gsd_err: err,
  };
}

export function paneTokens(view: ActivityView | undefined, ctxPercent?: number): PaneTokens {
  if (!view) return { gsd_agent: null, gsd_workers: null, gsd_ctx: ctxPercent !== undefined ? `${ctxPercent}%` : null };
  return {
    gsd_agent: view.agent ?? null,
    gsd_workers: view.workers > 0 ? `${view.workers} active` : null,
    gsd_ctx: ctxPercent !== undefined ? `${ctxPercent}%` : null,
  };
}

/** Diff two token maps; returns only keys whose value changed (null = clear). */
export function tokenDelta<T extends Record<string, string | null>>(prev: T | undefined, next: T): Partial<T> {
  const out: Partial<T> = {};
  for (const k of Object.keys(next) as (keyof T)[]) {
    if (!prev || prev[k] !== next[k]) out[k] = next[k];
  }
  return out;
}

/** Title for the driver pane (spec §3.3): only if the pane has no user-set title. */
export function paneTitle(snap: ProjectSnapshot): string {
  const proj = snap.project?.name ?? 'project';
  const phase = snap.position?.phase ? `${snap.position.phase.number} ${shortSlug(snap.position.phase.slug, 16)}`.trim() : '';
  return phase ? `GSD · ${proj} · ${phase}` : `GSD · ${proj}`;
}

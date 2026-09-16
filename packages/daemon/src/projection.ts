import type { ProjectSnapshot, GsdStatus } from '@herdr-gsd/core';
import type { ActivityView } from './activity';

/**
 * Pure mapping from snapshots/activity to Herdr metadata tokens (spec §3.3).
 * Token values are clamped to 80 chars by the client; keep them short here.
 */
export type WorkspaceTokens = {
  gsd_phase: string | null;
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

export function shortSlug(slug: string, max = 24): string {
  const s = slug.replace(/[-_]+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

export function statusFromSnapshot(snap: ProjectSnapshot): GsdStatus {
  if (snap.health === 'no_planning') return 'idle';
  if (snap.paused) return 'paused';
  if (snap.phases.length > 0 && snap.phases.every((p) => p.status === 'complete')) return 'complete';
  const cur = snap.position?.phase ? snap.phases.find((p) => p.number === snap.position!.phase!.number) : undefined;
  const status = cur?.status ?? snap.position?.phase?.status;
  if (status === 'blocked' || snap.blockers.length > 0 || (snap.humanStops?.length ?? 0) > 0) return 'blocked';
  // STATE.md's declared step is more current than plan/summary file counts (a phase with
  // plans but no summaries is "executing" once GSD has started executing it).
  const step = snap.position?.step;
  if (status === 'planned' || status === 'discussed' || status === 'not_started') {
    if (step === 'execute') return 'executing';
    if (step === 'verify') return 'verifying';
  }
  switch (status) {
    case 'executing':
      return 'executing';
    case 'verifying':
      return 'verifying';
    case 'planned':
    case 'discussed':
    case 'not_started':
      return 'planning';
    case 'complete':
      return snap.phases.some((p) => p.status !== 'complete') ? 'planning' : 'complete';
    default:
      return snap.position?.step === 'execute' ? 'executing' : snap.position?.step === 'verify' ? 'verifying' : 'idle';
  }
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
    return { gsd_phase: null, gsd_step: null, gsd_status: null, gsd_next: null, gsd_err: extraErr ?? null };
  }
  const pos = snap.position;
  const phase = pos?.phase ? `${pos.phase.number} ${shortSlug(pos.phase.slug)}`.trim() : snap.phases.length ? '—' : 'none';
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

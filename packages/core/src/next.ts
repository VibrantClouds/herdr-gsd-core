import type { PhaseInfo, ProjectSnapshot } from './types';
import rulesJson from './rules.json';

export interface Rule {
  when: string;
  next: string;
}

export interface RuleTable {
  rules: Rule[];
}

/** Context handed to predicates. */
interface Ctx {
  snap: ProjectSnapshot;
  current?: PhaseInfo;
  currentIdx: number;
  next?: PhaseInfo;
}

type Predicate = (c: Ctx) => boolean;

/** Named predicates referenced by rules.json. Keep pure and cheap. */
export const predicates: Record<string, Predicate> = {
  always: () => true,
  paused: (c) => c.snap.paused !== undefined,
  no_phases: (c) => c.snap.phases.length === 0,
  all_phases_complete: (c) => c.snap.phases.length > 0 && c.snap.phases.every((p) => p.status === 'complete'),
  phase_blocked: (c) => c.current?.status === 'blocked',
  phase_not_started: (c) => c.current?.status === 'not_started',
  phase_discussed: (c) => c.current?.status === 'discussed',
  phase_planned_no_summaries: (c) => !!c.current && c.current.status === 'planned' && c.current.plans > 0 && c.current.summaries === 0,
  phase_partially_executed: (c) =>
    !!c.current && c.current.plans > 0 && c.current.summaries > 0 && c.current.summaries < c.current.plans && c.current.status !== 'complete',
  uat_fail: (c) => c.current?.uat === 'fail',
  step_plan_phase_open: (c) => c.snap.position?.step === 'plan' && phaseOpen(c) && c.current?.uat === undefined,
  step_verify_phase_open: (c) => c.snap.position?.step === 'verify' && phaseOpen(c) && c.current?.uat !== 'pass',
  step_execute_phase_open: (c) => c.snap.position?.step === 'execute' && phaseOpen(c) && !(c.current && c.current.plans > 0 && c.current.summaries >= c.current.plans),
  uat_pass_has_next_phase: (c) => c.current?.uat === 'pass' && c.next !== undefined,
  uat_pass_last_phase: (c) => c.current?.uat === 'pass' && c.next === undefined,
  summaries_complete_uat_absent: (c) =>
    !!c.current && c.current.plans > 0 && c.current.summaries >= c.current.plans && (c.current.uat === undefined || c.current.uat === 'pending') && c.current.status !== 'complete',
  phase_complete_has_next: (c) => c.current?.status === 'complete' && c.next !== undefined,
  phase_complete_last: (c) => c.current?.status === 'complete' && c.next === undefined,
};

/** The STATE.md position points at the current phase and that phase is not finished. */
function phaseOpen(c: Ctx): boolean {
  if (!c.current || !c.snap.position?.phase) return false;
  if (trimNumber(c.snap.position.phase.number) !== trimNumber(c.current.number)) return false;
  return c.current.status !== 'complete' && c.current.status !== 'blocked';
}

/**
 * Pick the "current" phase: the one STATE.md points at if present, otherwise the
 * first phase that is not complete, otherwise the last phase.
 */
export function currentPhaseIndex(snap: ProjectSnapshot): number {
  if (snap.phases.length === 0) return -1;
  const wanted = snap.position?.phase?.number;
  if (wanted !== undefined) {
    // `02` and `2` are both legal spellings of the same phase, and the fixtures
    // show both *in the same project family* — compare normalised.
    const key = trimNumber(wanted);
    const i = snap.phases.findIndex((p) => trimNumber(p.number) === key);
    if (i >= 0) return i;
  }
  const firstOpen = snap.phases.findIndex((p) => p.status !== 'complete');
  return firstOpen >= 0 ? firstOpen : snap.phases.length - 1;
}

/** Compute the recommended next GSD command (without the `/gsd-` prefix), e.g. `verify-work 3`. */
export function recommendNext(snap: ProjectSnapshot, table: RuleTable = rulesJson as RuleTable): string {
  const currentIdx = currentPhaseIndex(snap);
  const current = currentIdx >= 0 ? snap.phases[currentIdx] : undefined;
  const next = currentIdx >= 0 ? snap.phases[currentIdx + 1] : undefined;
  const ctx: Ctx = { snap, current, currentIdx, next };
  for (const rule of table.rules) {
    const pred = predicates[rule.when];
    if (!pred) throw new Error(`rules.json: unknown predicate "${rule.when}"`);
    if (pred(ctx)) return substitute(rule.next, current, next);
  }
  return 'progress';
}

function substitute(template: string, current?: PhaseInfo, next?: PhaseInfo): string {
  return template
    .replace('{N+1}', next ? trimNumber(next.number) : '')
    .replace('{N}', current ? trimNumber(current.number) : '')
    .trim();
}

/** `03` → `3`; `03.1` stays `3.1` (decimal phases). */
export function trimNumber(n: string): string {
  const m = /^0*(\d+)(\.\d+)?$/.exec(n);
  return m ? `${m[1]}${m[2] ?? ''}` : n;
}

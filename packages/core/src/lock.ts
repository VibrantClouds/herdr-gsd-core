import { promises as fs } from 'node:fs';
import { join } from 'node:path';

export class PlanningLockedError extends Error {
  constructor(public readonly lockPath: string) {
    super(`planning lock held: ${lockPath}`);
    this.name = 'PlanningLockedError';
  }
}

export interface LockWaitOptions {
  /** initial backoff, ms (spec: 50) */
  initialMs?: number;
  /** max single backoff, ms (spec: 1000) */
  maxStepMs?: number;
  /** give up after, ms (spec: 5000) */
  totalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  exists?: (p: string) => Promise<boolean>;
  /**
   * Lock file to wait on, relative to `planningDir`. GSD 1.14 holds two write
   * locks (capture M0-G-parsers.txt): `STATE.md.lock` (`state.cjs:3399`) and
   * `.lock` (`planning-workspace.cjs:362`). `milestone.lock`
   * (`milestone-lock.cjs:64`) is an advisory phase claim that lives for a whole
   * session and never gates a read (docs/DECISIONS.md O8).
   */
  lockName?: string;
}

/** Every write lock GSD 1.14 can hold inside `.planning/`. */
export const PLANNING_LOCKS = ['STATE.md.lock', '.lock'] as const;

export async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Wait until the named planning lock is gone (default `STATE.md.lock`). Backoff
 * 50 ms → 1 s doubling, max 5 s total (spec §3.1). Throws PlanningLockedError
 * on timeout.
 */
export async function waitForStateUnlocked(planningDir: string, opts: LockWaitOptions = {}): Promise<void> {
  const lock = join(planningDir, opts.lockName ?? 'STATE.md.lock');
  const initial = opts.initialMs ?? 50;
  const maxStep = opts.maxStepMs ?? 1000;
  const total = opts.totalMs ?? 5000;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const exists = opts.exists ?? fileExists;
  let waited = 0;
  let step = initial;
  while (await exists(lock)) {
    if (waited >= total) throw new PlanningLockedError(lock);
    const d = Math.min(step, total - waited);
    await sleep(d);
    waited += d;
    step = Math.min(step * 2, maxStep);
  }
}

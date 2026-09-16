import { AGENT_NAME_PATTERN } from '@herdr-gsd/herdr-client';
import type { RunUnit } from './runs';

/**
 * Branch names GSD reserves for its own per-executor worktrees
 * (`bin/lib/worktree-safety.cjs:26`); `execute-phase` FATALs when the
 * orchestrator's branch matches (spike M4 G1).
 */
export const GSD_RESERVED_BRANCH_RE = /^((worktree-)?agent-|worktree-wf_)[A-Za-z0-9._/-]+$/;

/** `03`, `3`, `3.1` → zero-padded as GSD's `{phase}` placeholder wants (`planning-config.md:189`). */
export function padPhase(n: string): string {
  const m = /^(\d+)(\.\d+)?$/.exec(n.trim());
  if (!m) return n.trim();
  return `${(m[1] as string).padStart(2, '0')}${m[2] ?? ''}`;
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/**
 * The branch an isolated run checks out. With `git.branching_strategy = "phase"`
 * this is exactly GSD's own template, so GSD's `handle_branching` step finds the
 * branch already checked out and reuses it (spike M4 G8). Otherwise the plugin's
 * prefix is used.
 */
export function branchFor(opts: { strategy?: 'none' | 'phase' | 'milestone'; template?: string; prefix: string; phase: string; slug: string }): string {
  const phase = padPhase(opts.phase);
  const slug = slugify(opts.slug) || 'phase';
  if (opts.strategy === 'phase' && opts.template) {
    return opts.template.replace(/\{phase\}/g, phase).replace(/\{slug\}/g, slug);
  }
  const prefix = opts.prefix.endsWith('/') || opts.prefix === '' ? opts.prefix : `${opts.prefix}/`;
  return `${prefix}phase-${phase}-${slug}`;
}

/** `agent.start.name`: `[a-z][a-z0-9_-]{0,31}`, unique per live agent. */
export function agentNameFor(unit: RunUnit, phase: string | undefined, runId: string): string {
  const short = unit === 'phase-isolated' ? 'iso' : unit === 'autonomous' ? 'auto' : 'phase';
  const p = phase ? `-${slugify(phase).replace(/-/g, '_') || 'x'}` : '';
  const tail = runId.slice(-6).toLowerCase().replace(/[^a-z0-9]/g, '');
  let name = `gsd-${short}${p}-${tail}`.slice(0, 32);
  if (!AGENT_NAME_PATTERN.test(name)) name = `gsd-${short}-${tail}`.slice(0, 32);
  return name;
}

/** The 72 GSD-Core 1.14.0 slash commands (`docs/spikes/captures/M0-G-commands.txt`); bare names are accepted only from this list. */
export const GSD_COMMANDS: ReadonlySet<string> = new Set(
  'add-tests ai-integration-phase audit-fix audit-milestone audit-uat autonomous capture cleanup code-review complete-milestone config debug discuss-phase docs-update eval-review execute-phase explore extract-learnings fast forensics graphify health help import inbox ingest-docs manager map-codebase mempalace-capture mempalace-recall milestone-summary mvp-phase new-milestone new-project next ns-context ns-ideate ns-manage ns-project ns-review ns-workflow onboard pause-work phase plan-phase plan-review-convergence pr-branch profile-user progress quick quick-batch resume-work review review-backlog secure-phase settings ship sketch spec-phase spike stats surface thread ui-phase ui-review ultraplan-phase undo update validate-phase verify-work workspace workstreams'.split(
    ' ',
  ),
);

/**
 * Normalise a user-supplied GSD command to the `/gsd-<cmd>` spelling GSD
 * installs (spike M0-G §3). Explicit `/gsd-…`, `/gsd:…`, `gsd:…`, `gsd-…`
 * spellings are accepted for any well-formed name; a bare name (`execute-phase
 * 3`) must be a known GSD command, so arbitrary text never becomes a prompt.
 */
export function normalizeGsdCommand(input: string): string | undefined {
  let s = input.trim();
  if (s === '' || /[\r\n]/.test(s)) return undefined;
  if (s.startsWith('/gsd:')) s = `/gsd-${s.slice(5)}`;
  else if (s.startsWith('gsd:')) s = `/gsd-${s.slice(4)}`;
  else if (s.startsWith('gsd-')) s = `/${s}`;
  else if (!s.startsWith('/')) {
    const name = s.split(/\s+/)[0] ?? '';
    if (!GSD_COMMANDS.has(name)) return undefined;
    s = `/gsd-${s}`;
  }
  if (!/^\/gsd-[a-z][a-z0-9-]*(\s.*)?$/s.test(s)) return undefined;
  return s;
}

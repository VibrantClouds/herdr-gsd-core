import * as path from 'node:path';
import type { GsdStatus, PluginConfig, ProjectSnapshot } from '@herdr-gsd/core';
import { trimNumber } from '@herdr-gsd/core';
import { HERDR_AGENT_KINDS } from '@herdr-gsd/herdr-client';
import { GSD_RESERVED_BRANCH_RE, branchFor, normalizeGsdCommand } from './names';
import { isActive, type RunRecord, type RunUnit } from './runs';

/**
 * Pure run planner (spec §7.4 + spike M4 §3 "project-state guards"). Every
 * refusal is a sentence the dashboard can show; every warning is carried on the
 * run record. Nothing here touches Herdr, git or the filesystem — the daemon
 * gathers the facts and passes them in.
 */
export interface PlanInput {
  unit: RunUnit;
  snapshot: ProjectSnapshot;
  /** derived `gsd_status` for the snapshot */
  status: GsdStatus;
  config: PluginConfig;
  /** explicit GSD command (any of `/gsd-x`, `gsd:x`, `x`); default is the snapshot's own `next` */
  command?: string;
  /** phase number the run targets (isolated runs need one; defaults to the current phase) */
  phase?: string;
  /** `/gsd-autonomous --from/--to` */
  from?: string;
  to?: string;
  /** every active run the daemon knows about, across projects */
  activeRuns: RunRecord[];
  /** git facts for the project root (undefined = not a git repo / git missing) */
  git?: { toplevel?: string; branch?: string; planningTracked: boolean };
  /** the human-driven harness pane bound to this project, if any */
  driver?: { paneId: string; agentStatus: string };
  /** Herdr methods the probe found missing */
  missingMethods: string[];
}

export interface PlanResult {
  ok: boolean;
  unit: RunUnit;
  reasons: string[];
  warnings: string[];
  /** the prompt that will be sent */
  command?: string;
  harness: string;
  kind?: string;
  args: string[];
  phase?: string;
  branch?: string;
  repo: string;
}

const RESUME = '/gsd-resume-work';

/** Which GSD command moves phase `n` forward, from its filesystem status. */
export function commandForPhase(snap: ProjectSnapshot, n: string): string | undefined {
  const key = trimNumber(n);
  const phase = snap.phases.find((p) => trimNumber(p.number) === key);
  if (!phase) return undefined;
  if (phase.status === 'complete') return undefined;
  if (phase.status === 'blocked') return undefined;
  if (phase.plans === 0) return phase.status === 'discussed' ? `/gsd-plan-phase ${key}` : `/gsd-discuss-phase ${key}`;
  if (phase.summaries < phase.plans) return `/gsd-execute-phase ${key}`;
  if (phase.uat === 'fail') return `/gsd-execute-phase ${key}`;
  return `/gsd-verify-work ${key}`;
}

export function planRun(input: PlanInput): PlanResult {
  const { unit, snapshot: snap, config, status } = input;
  const orch = config.orchestration;
  const reasons: string[] = [];
  const warnings: string[] = [];
  const harnessName = orch.harness;
  const harness = config.harness[harnessName];
  const repo = input.git?.toplevel ?? snap.root;
  const result: PlanResult = { ok: false, unit, reasons, warnings, harness: harnessName, args: [], repo };

  if (!orch.enabled) reasons.push('orchestration is disabled: set [orchestration] enabled = true in config.toml');
  if (!harness) reasons.push(`no [harness.${harnessName}] table in config.toml`);
  const exe = harness?.command[0] ? path.basename(harness.command[0]) : undefined;
  if (harness && (!exe || !(HERDR_AGENT_KINDS as readonly string[]).includes(exe))) {
    reasons.push(`[harness.${harnessName}] command "${harness?.command[0] ?? ''}" is not an agent kind Herdr can start (${HERDR_AGENT_KINDS.join(', ')})`);
  } else if (exe) {
    result.kind = exe;
    result.args = harness!.command.slice(1);
  }
  const needed = ['agent.start', 'agent.prompt', 'agent.wait', 'agent.send_keys', 'pane.close', unit === 'phase-isolated' ? 'worktree.create' : 'pane.split'];
  const missing = needed.filter((m) => input.missingMethods.includes(m));
  if (missing.length) reasons.push(`Herdr is missing ${missing.join(', ')}`);

  // ---- project state (owner requirement: respect every state a project can be in)
  if (snap.health !== 'ok') reasons.push(`project health is ${snap.health}`);
  if (snap.humanStops?.length) reasons.push(`STATE.md asks for a human: ${snap.humanStops.map((h) => `${h.marker === 'needs_human' ? 'Needs Human' : 'Deferred Verification'} — ${h.text}`).join('; ')}`);
  if (snap.blockers.length) reasons.push(`STATE.md lists blockers: ${snap.blockers.join('; ')}`);

  const explicit = input.command !== undefined ? normalizeGsdCommand(input.command) : undefined;
  if (input.command !== undefined && explicit === undefined) reasons.push(`"${input.command}" is not a GSD command (expected /gsd-<name> …)`);

  // ---- phase + command
  const currentPhase = snap.position?.phase?.number ?? snap.phases.find((p) => p.status !== 'complete')?.number;
  const phase = input.phase ?? currentPhase;
  result.phase = phase;
  let command: string | undefined;
  if (unit === 'autonomous') {
    if (explicit && !explicit.startsWith('/gsd-autonomous')) reasons.push('an autonomous run only accepts /gsd-autonomous');
    command = explicit ?? '/gsd-autonomous';
    if (!explicit) {
      if (input.from) command += ` --from ${trimNumber(input.from)}`;
      if (input.to) command += ` --to ${trimNumber(input.to)}`;
    }
    if (status === 'paused') reasons.push(`project is paused (${snap.paused?.file ?? 'paused_at'}); run ${RESUME} first`);
    if (snap.phases.length === 0) reasons.push('no phases yet: autonomous mode needs a roadmap');
  } else {
    if (status === 'paused') {
      if (explicit && explicit !== RESUME) reasons.push(`project is paused (${snap.paused?.file ?? 'paused_at'}); only ${RESUME} is offered`);
      command = RESUME;
      warnings.push('project is paused: the run sends /gsd-resume-work, not a phase command');
    } else if (explicit) command = explicit;
    else if (input.phase) {
      command = commandForPhase(snap, input.phase);
      if (!command) reasons.push(`phase ${input.phase} is ${snap.phases.find((p) => trimNumber(p.number) === trimNumber(input.phase!))?.status ?? 'unknown'}; nothing to run`);
    } else if (snap.next?.command) command = normalizeGsdCommand(snap.next.command);
    else if (phase) command = commandForPhase(snap, phase);
    if (!command && status === 'complete') reasons.push('every phase is complete; nothing to run');
    if (!command && reasons.length === 0) reasons.push('no recommended next command for this project');
  }
  if (status === 'complete' && !explicit && unit !== 'phase') reasons.push('every phase is complete; nothing to run');
  result.command = command;

  // ---- concurrency (spike M4 G3: one run per repository, ever)
  const active = input.activeRuns.filter(isActive);
  const sameRepo = active.find((r) => r.repo === repo || r.project === snap.root);
  if (sameRepo) reasons.push(`run ${sameRepo.id} (${sameRepo.unit}, ${sameRepo.status}) is already active on this repository`);
  else if (active.length >= orch.max_parallel) reasons.push(`max_parallel = ${orch.max_parallel} runs are already active`);

  // ---- a human is driving?
  if (input.driver && unit !== 'phase-isolated') {
    if (input.driver.agentStatus === 'working') reasons.push(`a harness session is working in pane ${input.driver.paneId}; wait for it or use an isolated run`);
    else if (input.driver.agentStatus === 'blocked') reasons.push(`the harness session in pane ${input.driver.paneId} is waiting for input; answer it first`);
    else warnings.push(`a harness session is already open in pane ${input.driver.paneId}; the run gets its own pane`);
  }

  // ---- isolation (spike M4 G7/G8/G9)
  if (unit === 'phase-isolated') {
    if (orch.isolation === 'none') reasons.push('orchestration.isolation = "none" in config.toml');
    if (!input.git) reasons.push('the project is not a git repository (or git is not installed)');
    else if (!input.git.planningTracked) reasons.push('.planning/STATE.md is not tracked by git, so a worktree would not contain it (commit_docs?)');
    if (snap.config?.commitDocs === false) reasons.push('.planning/config.json has commit_docs = false: planning docs never reach a worktree');
    if (snap.config?.branchingStrategy === 'milestone') reasons.push('git.branching_strategy = "milestone": GSD wants one milestone branch, not a phase worktree');
    if (!phase) reasons.push('no phase to isolate: the project has no current phase');
    else {
      const slug = snap.phases.find((p) => trimNumber(p.number) === trimNumber(phase))?.slug ?? snap.position?.phase?.slug ?? '';
      const branch = branchFor({ strategy: snap.config?.branchingStrategy, template: snap.config?.phaseBranchTemplate, prefix: orch.worktree_branch_prefix, phase, slug });
      if (GSD_RESERVED_BRANCH_RE.test(branch)) reasons.push(`branch "${branch}" collides with GSD's reserved executor-worktree names`);
      result.branch = branch;
      if (input.git?.branch && input.git.branch === branch) reasons.push(`the project is already on branch ${branch}`);
    }
    if (snap.config?.useWorktrees !== false && snap.config?.parallelization !== false) {
      warnings.push('GSD may run executors sequentially on a branch that is ahead of origin/HEAD (worktree base mismatch)');
    }
  } else if (unit === 'phase' && snap.config?.allowDefaultBranchCommits !== true && (snap.config?.branchingStrategy ?? 'none') === 'none') {
    const b = input.git?.branch;
    if (!b || b === 'main' || b === 'master') warnings.push('GSD may ask before committing on the default branch (git.allow_default_branch_commits)');
  }
  if (snap.config?.mode && snap.config.mode !== 'yolo') warnings.push(`GSD mode is "${snap.config.mode}": expect the run to pause for your input at checkpoints`);
  if (snap.config?.autoAdvance && unit === 'autonomous') warnings.push('workflow.auto_advance is on; GSD chains steps itself, the run only supervises');

  result.ok = reasons.length === 0 && !!command && !!result.kind;
  return result;
}

import * as path from 'node:path';
import type { GsdStatus, PluginConfig, ProjectSnapshot } from '@herdr-gsd/core';
import { trimNumber } from '@herdr-gsd/core';
import { HerdrError, type HerdrClient, type PaneInfo } from '@herdr-gsd/herdr-client';
import { gitFacts, type GitExec } from './git';
import { agentNameFor } from './names';
import { planRun, type PlanInput, type PlanResult } from './plan';
import { RunStore, isActive, newRunId, type RunRecord, type RunUnit } from './runs';

/**
 * The orchestrator (spec §7, reduced per spike M4 §3). It owns run records and
 * drives each run's state machine **from Herdr events** the daemon already
 * receives (`pane.updated` status diffs, `pane.closed`, `workspace.closed`) plus
 * one bounded `agent.wait` right after `agent.start`. It never takes lifecycle
 * authority: Herdr's own detection says whether the harness is working, blocked
 * or idle; the orchestrator only reacts.
 */
export interface ProjectFacts {
  root: string;
  snapshot: ProjectSnapshot;
  status: GsdStatus;
  driver?: { paneId: string; agentStatus: string };
}

export interface OrchestratorDeps {
  client: HerdrClient;
  config: () => PluginConfig;
  store: RunStore;
  log: { info(m: string, d?: unknown): void; warn(m: string, d?: unknown): void; debug(m: string, d?: unknown): void };
  notify: (title: string, body: string, sound: 'none' | 'done' | 'request') => Promise<void>;
  now: () => number;
  /** the daemon's view of a bound project, or undefined when the root is not bound */
  project: (root: string) => ProjectFacts | undefined;
  /** the daemon's live pane map */
  pane: (paneId: string) => PaneInfo | undefined;
  /** every live pane in a workspace bound to the project (split anchor when no harness is running) */
  panesFor: (root: string) => PaneInfo[];
  missingMethods: () => string[];
  onChange: (run: RunRecord) => void;
  /** make sure the pane's agent-status stream is live before the first prompt (spike M4 H10) */
  statusStream?: (paneId: string, agent: string) => Promise<void>;
  git?: GitExec;
  /** ms without `working` after a prompt before the run is marked stalled */
  stallMs?: number;
}

export interface StartSpec {
  root: string;
  unit: RunUnit;
  command?: string;
  phase?: string;
  from?: string;
  to?: string;
}

export type StopResult = { stopped: true; run: RunRecord } | { stopped: false; reason: string; run?: RunRecord };

const ESC_TWICE = ['esc', 'esc'];

export class Orchestrator {
  private readonly stallMs: number;
  private stopping = new Set<string>();

  constructor(private readonly deps: OrchestratorDeps) {
    this.stallMs = deps.stallMs ?? 15_000;
  }

  /* ------------------------------------------------------------------ */
  /* queries                                                             */
  /* ------------------------------------------------------------------ */

  list(root?: string): RunRecord[] {
    return root ? this.deps.store.byProject(root) : this.deps.store.all();
  }

  get(id: string): RunRecord | undefined {
    return this.deps.store.get(id);
  }

  async plan(spec: StartSpec): Promise<PlanResult> {
    const p = this.deps.project(spec.root);
    if (!p) return { ok: false, unit: spec.unit, reasons: [`no bound project at ${spec.root}`], warnings: [], harness: this.deps.config().orchestration.harness, args: [], repo: spec.root };
    const facts = await gitFacts(p.root, this.deps.git);
    const input: PlanInput = {
      unit: spec.unit,
      snapshot: p.snapshot,
      status: p.status,
      config: this.deps.config(),
      command: spec.command,
      phase: spec.phase,
      from: spec.from,
      to: spec.to,
      activeRuns: this.deps.store.active(),
      git: facts.isRepo ? { toplevel: facts.toplevel, branch: facts.branch, planningTracked: facts.planningTracked } : undefined,
      driver: p.driver,
      missingMethods: this.deps.missingMethods(),
    };
    return planRun(input);
  }

  /* ------------------------------------------------------------------ */
  /* start                                                               */
  /* ------------------------------------------------------------------ */

  async start(spec: StartSpec): Promise<{ run?: RunRecord; plan: PlanResult }> {
    const plan = await this.plan(spec);
    if (!plan.ok || !plan.command || !plan.kind) return { plan };
    const p = this.deps.project(spec.root)!;
    const now = this.deps.now();
    const id = newRunId(now);
    const cfg = this.deps.config();
    const run: RunRecord = {
      v: 1,
      id,
      project: p.root,
      repo: plan.repo,
      unit: spec.unit,
      command: plan.command,
      harness: plan.harness,
      kind: plan.kind,
      target: { workspaceId: '', paneId: '', agentName: agentNameFor(spec.unit, plan.phase, id), cwd: p.root },
      createdPane: false,
      startedAt: now,
      updatedAt: now,
      status: 'planned',
      prompts: [],
      sawWorking: false,
      phaseAtStart: plan.phase,
      resumes: 0,
      warnings: [...plan.warnings],
    };
    await this.deps.store.save(run);
    this.deps.onChange(run);
    try {
      await this.createTarget(run, plan, p);
      await this.launch(run, plan.args, cfg.orchestration.start_timeout_ms);
    } catch (e) {
      await this.fail(run, `start failed: ${(e as Error).message}`);
    }
    return { run, plan };
  }

  /** Split a pane in the bound workspace, or create a worktree workspace (spike M4 H9). */
  private async createTarget(run: RunRecord, plan: PlanResult, p: ProjectFacts): Promise<void> {
    const cfg = this.deps.config().orchestration;
    if (run.unit === 'phase-isolated') {
      const res = await this.deps.client.worktreeCreate({ cwd: p.root, branch: plan.branch, label: plan.branch, focus: false });
      run.target = {
        workspaceId: res.workspace.workspace_id,
        paneId: res.root_pane.pane_id,
        agentName: run.target.agentName,
        cwd: res.worktree.path,
        worktree: { path: res.worktree.path, branch: res.worktree.branch ?? plan.branch ?? '', workspaceId: res.workspace.workspace_id },
      };
      run.createdPane = true;
      const env = this.deps.config().harness[run.harness]?.env;
      if (env && Object.keys(env).length) run.warnings.push(`[harness.${run.harness}] env is not applied to worktree panes (Herdr worktree.create has no env); the harness inherits the shell environment`);
      this.deps.log.info('worktree created for run', { run: run.id, path: res.worktree.path, branch: res.worktree.branch });
    } else {
      const anchor = p.driver?.paneId ?? this.anchorPane(p.root);
      if (!anchor) throw new Error('no pane in a workspace bound to this project to split from');
      const base = this.deps.pane(anchor);
      const env = this.deps.config().harness[run.harness]?.env;
      const pane = await this.deps.client.paneSplit({ direction: cfg.split_direction, target_pane_id: anchor, workspace_id: base?.workspace_id, cwd: p.root, focus: false, ...(env && Object.keys(env).length ? { env } : {}) });
      run.target = { workspaceId: pane.workspace_id, paneId: pane.pane_id, agentName: run.target.agentName, cwd: p.root };
      run.createdPane = true;
    }
    await this.update(run, { status: 'starting' });
  }

  /** Prefer the focused pane of a bound workspace, then any pane; a shell pane is a fine anchor. */
  private anchorPane(root: string): string | undefined {
    const panes = this.deps.panesFor(root);
    return (panes.find((x) => x.focused) ?? panes[0])?.pane_id;
  }

  /**
   * `agent.start` returns immediately with `launch_pending` (spike M4 H1); wait
   * for the first settled state. `blocked` here is a startup dialog (folder
   * trust) the user must answer: the run waits and the prompt goes out on the
   * next idle (spike M4 H2/H3).
   */
  private async launch(run: RunRecord, args: string[], startTimeoutMs: number): Promise<void> {
    await this.deps.client.agentStart({ name: run.target.agentName, kind: run.kind, pane_id: run.target.paneId, args: args.length ? args : undefined, timeout_ms: Math.min(Math.max(startTimeoutMs, 3001), 300_000) });
    await this.deps.statusStream?.(run.target.paneId, run.kind).catch(() => undefined);
    let status: string;
    try {
      const r = await this.deps.client.agentWait(run.target.paneId, ['idle', 'done', 'blocked'], startTimeoutMs);
      status = r.agent.agent_status;
    } catch (e) {
      const err = e as HerdrError;
      if (err.code === 'timeout') {
        await this.update(run, { status: 'waiting', waitingFor: 'startup_input', reason: `harness did not become ready within ${Math.round(startTimeoutMs / 1000)} s; look at pane ${run.target.paneId}` });
        await this.deps.notify(`GSD run ${run.unit}: harness not ready`, `Pane ${run.target.paneId} has not reached a prompt. The run continues once it is idle.`, 'request');
        return;
      }
      throw e;
    }
    run.lastAgentStatus = status;
    if (status === 'blocked') {
      await this.update(run, { status: 'waiting', waitingFor: 'startup_input', reason: `harness needs input in pane ${run.target.paneId} (folder trust prompt?)` });
      await this.deps.notify(`GSD run ${run.unit}: input needed`, `Answer the ${run.kind} prompt in pane ${run.target.paneId}; the run continues once it is idle.`, 'request');
      return;
    }
    await this.prompt(run);
  }

  private async prompt(run: RunRecord): Promise<void> {
    if (this.deps.missingMethods().includes('agent.prompt')) throw new Error('agent.prompt unavailable');
    run.prompts.push({ ts: this.deps.now(), text: run.command });
    run.sawWorking = false;
    await this.update(run, { status: 'running', waitingFor: undefined, reason: undefined });
    try {
      await this.deps.client.agentPrompt({ target: run.target.paneId, text: run.command });
    } catch (e) {
      const err = e as HerdrError;
      if (err.code === 'agent_blocked') {
        await this.update(run, { status: 'waiting', waitingFor: 'agent_blocked', reason: `agent is blocked in pane ${run.target.paneId}; the prompt was not sent` });
        run.prompts.pop();
        await this.deps.store.save(run);
        return;
      }
      throw e;
    }
    try {
      run.seqAtPrompt = (await this.deps.client.agentGet(run.target.paneId)).state_change_seq;
      await this.deps.store.save(run);
    } catch {
      /* seq is a robustness aid only */
    }
    this.deps.log.info('run prompted', { run: run.id, command: run.command, pane: run.target.paneId, seq: run.seqAtPrompt });
  }

  /** Event delivery is best-effort: a `state_change_seq` advance since the prompt proves the agent reacted. */
  private async reactedSincePrompt(run: RunRecord): Promise<boolean> {
    if (run.sawWorking) return true;
    if (run.seqAtPrompt === undefined) return false;
    try {
      const a = await this.deps.client.agentGet(run.target.paneId);
      if ((a.state_change_seq ?? 0) > run.seqAtPrompt) {
        run.sawWorking = true;
        return true;
      }
    } catch {
      /* agent gone; the pane handlers deal with it */
    }
    return false;
  }

  /* ------------------------------------------------------------------ */
  /* events from the daemon                                              */
  /* ------------------------------------------------------------------ */

  async onPaneStatus(pane: PaneInfo, previous: string | undefined): Promise<void> {
    const run = this.deps.store.byPane(pane.pane_id);
    if (!run) return;
    const status = pane.agent_status;
    run.lastAgentStatus = status;
    if (status === previous) return;
    if (run.status === 'waiting' && run.waitingFor === 'startup_input' && (status === 'idle' || status === 'done')) {
      // startup dialog answered → send the command now
      try {
        await this.prompt(run);
      } catch (e) {
        await this.fail(run, `prompt failed: ${(e as Error).message}`);
      }
      return;
    }
    if (run.status === 'waiting' && run.waitingFor === 'agent_blocked' && run.prompts.length === 0 && (status === 'idle' || status === 'done')) {
      try {
        await this.prompt(run);
      } catch (e) {
        await this.fail(run, `prompt failed: ${(e as Error).message}`);
      }
      return;
    }
    if (run.status !== 'running' && run.status !== 'waiting') {
      await this.deps.store.save(run);
      return;
    }
    if (status === 'working') {
      run.sawWorking = true;
      if (run.status === 'waiting') await this.update(run, { status: 'running', waitingFor: undefined, reason: undefined });
      else await this.deps.store.save(run);
      return;
    }
    if (status === 'blocked') {
      if (run.prompts.length === 0) {
        // nothing sent yet: this is still the start-up dialog (the stream may repeat what agent.wait already told us)
        if (run.waitingFor !== 'startup_input') {
          await this.update(run, { status: 'waiting', waitingFor: 'startup_input', reason: `harness needs input in pane ${pane.pane_id} (folder trust prompt?)` });
          await this.deps.notify(`GSD run ${run.unit}: input needed`, `Answer the ${run.kind} prompt in pane ${pane.pane_id}; the run continues once it is idle.`, 'request');
        }
        return;
      }
      await this.update(run, { status: 'waiting', waitingFor: 'agent_blocked', reason: `agent is waiting for you in pane ${pane.pane_id}` });
      const p = this.deps.project(run.project);
      await this.deps.notify(`GSD run ${run.unit}: waiting for you`, `Pane ${pane.pane_id}${p?.snapshot.position?.phase ? ` · phase ${p.snapshot.position.phase.number}` : ''}: ${run.command}`, 'request');
      return;
    }
    if (status === 'idle' || status === 'done') {
      if (!(await this.reactedSincePrompt(run))) {
        // prompt never produced activity — do not blind-retry (spike M0-H §3.3); read the screen
        await this.markStalled(run);
        return;
      }
      await this.settle(run);
      return;
    }
    await this.deps.store.save(run);
  }

  /** The harness settled to idle after working: decide what that means for the unit. */
  private async settle(run: RunRecord): Promise<void> {
    const p = this.deps.project(run.project);
    const snap = p?.snapshot;
    if (run.unit === 'autonomous') {
      if (snap?.humanStops?.length) {
        await this.update(run, { status: 'waiting', waitingFor: 'human_stop', reason: `STATE.md: ${snap.humanStops.map((h) => h.text).join('; ')}` });
        await this.deps.notify('GSD autonomous: needs a human', run.reason ?? 'see STATE.md', 'request');
        return;
      }
      const remaining = snap ? snap.phases.filter((ph) => ph.status !== 'complete').length : 0;
      const next = snap ? nextIncomplete(snap) : undefined;
      const reason = remaining > 0 ? `autonomous session ended with ${remaining} phase(s) remaining; resume with /gsd-autonomous${next ? ` --from ${next}` : ''}` : 'all phases complete';
      await this.finish(run, 'done', reason);
      await this.deps.notify('GSD autonomous: finished', reason, 'done');
      return;
    }
    const next = snap?.next?.command;
    await this.finish(run, 'done', `harness is idle after ${run.command}`);
    await this.deps.notify(`GSD run done: ${run.command}`, next ? `next: ${next}` : 'run finished', 'done');
  }

  private async markStalled(run: RunRecord): Promise<void> {
    let tail = '';
    try {
      const read = await this.deps.client.paneRead({ pane_id: run.target.paneId, source: 'recent_unwrapped', lines: 8, strip_ansi: true });
      tail = read.text.trim().split('\n').slice(-3).join(' | ').slice(0, 160);
    } catch {
      /* screen not readable */
    }
    await this.update(run, { status: 'waiting', waitingFor: 'stalled', reason: `no activity after the prompt${tail ? `; screen: ${tail}` : ''}` });
    await this.deps.notify(`GSD run ${run.unit}: no activity`, `Pane ${run.target.paneId} did not react to ${run.command}. Check the pane; the run is not retried automatically.`, 'request');
  }

  /** A pane the run lives in is gone (closed, exited, or its workspace closed). */
  async onPaneGone(paneId: string): Promise<void> {
    const run = this.deps.store.byPane(paneId);
    if (!run || this.stopping.has(run.id)) return;
    await this.sessionGone(run, 'pane closed');
  }

  async onWorkspaceGone(workspaceId: string): Promise<void> {
    for (const run of this.deps.store.active()) {
      if (run.target.workspaceId !== workspaceId || this.stopping.has(run.id)) continue;
      await this.sessionGone(run, 'workspace closed');
    }
  }

  private async sessionGone(run: RunRecord, how: string): Promise<void> {
    const p = this.deps.project(run.project);
    const snap = p?.snapshot;
    if (run.unit === 'autonomous') {
      const cfg = this.deps.config().orchestration.autonomous;
      const wall = (this.deps.now() - run.startedAt) / 60_000;
      const remaining = snap ? snap.phases.filter((ph) => ph.status !== 'complete').length : 0;
      const canResume = cfg.resume_on_exit && run.resumes < cfg.max_resumes && wall < cfg.max_wall_clock_min && remaining > 0 && !snap?.humanStops?.length && !snap?.paused && !snap?.blockers.length;
      if (canResume && run.unit === 'autonomous' && !run.target.worktree) {
        await this.resume(run, how);
        return;
      }
      await this.finish(run, remaining > 0 ? 'failed' : 'done', `${how} with ${remaining} phase(s) remaining${cfg.resume_on_exit ? ' (resume budget exhausted or project not resumable)' : ''}`);
      await this.deps.notify('GSD autonomous: session ended', run.reason ?? how, remaining > 0 ? 'request' : 'done');
      return;
    }
    const phaseNow = run.phaseAtStart && snap ? snap.phases.find((ph) => trimNumber(ph.number) === trimNumber(run.phaseAtStart!)) : undefined;
    if (run.sawWorking && phaseNow?.status === 'complete') {
      await this.finish(run, 'done', `${how}; phase ${run.phaseAtStart} is complete`);
      return;
    }
    await this.finish(run, 'failed', `${how} before the run finished`);
    await this.deps.notify(`GSD run ${run.unit}: session ended`, run.reason ?? how, 'request');
  }

  /** Re-launch a dead autonomous session with GSD's own resume command (spike M4 G5). */
  private async resume(run: RunRecord, how: string): Promise<void> {
    const p = this.deps.project(run.project);
    const snap = p?.snapshot;
    const from = snap ? nextIncomplete(snap) : undefined;
    run.resumes += 1;
    run.command = `/gsd-autonomous${from ? ` --from ${from}` : ''}`;
    run.warnings.push(`resumed after ${how} (${run.resumes}/${this.deps.config().orchestration.autonomous.max_resumes})`);
    run.target = { ...run.target, workspaceId: '', paneId: '' };
    await this.update(run, { status: 'planned', waitingFor: undefined, reason: undefined });
    try {
      const plan: PlanResult = { ok: true, unit: run.unit, reasons: [], warnings: [], command: run.command, harness: run.harness, kind: run.kind, args: this.deps.config().harness[run.harness]?.command.slice(1) ?? [], repo: run.repo };
      if (!p) throw new Error('project no longer bound');
      await this.createTarget(run, plan, p);
      await this.launch(run, plan.args, this.deps.config().orchestration.start_timeout_ms);
      await this.deps.notify('GSD autonomous: resumed', `${run.command} in pane ${run.target.paneId}`, 'none');
    } catch (e) {
      await this.fail(run, `resume failed: ${(e as Error).message}`);
    }
  }

  /** Project state changed while a run is waiting on a human stop: release it when the marker clears. */
  async onSnapshot(root: string, snap: ProjectSnapshot): Promise<void> {
    for (const run of this.deps.store.active()) {
      if (run.project !== root) continue;
      if (run.status === 'waiting' && run.waitingFor === 'human_stop' && !snap.humanStops?.length) {
        await this.update(run, { status: 'running', waitingFor: undefined, reason: 'human stop cleared' });
      }
    }
  }

  /** Periodic: stall detection and the autonomous wall-clock budget. */
  async tick(): Promise<void> {
    const now = this.deps.now();
    for (const run of this.deps.store.active()) {
      const lastPrompt = run.prompts.at(-1)?.ts;
      if (run.status === 'running' && !run.sawWorking && lastPrompt !== undefined && now - lastPrompt > this.stallMs) {
        const pane = this.deps.pane(run.target.paneId);
        if (pane?.agent_status === 'working' || (await this.reactedSincePrompt(run))) {
          run.sawWorking = true;
          await this.deps.store.save(run);
        } else await this.markStalled(run);
      }
      if (run.unit === 'autonomous' && run.status === 'running') {
        const cfg = this.deps.config().orchestration.autonomous;
        const minutes = (now - run.startedAt) / 60_000;
        if (minutes > cfg.max_wall_clock_min && !run.warnings.includes('wall-clock budget exceeded')) {
          run.warnings.push('wall-clock budget exceeded');
          await this.deps.store.save(run);
          await this.deps.notify('GSD autonomous: over budget', `${run.id} has run ${Math.round(minutes)} min (max_wall_clock_min = ${cfg.max_wall_clock_min}); stop it if that is not expected.`, 'request');
        }
      }
    }
    await this.deps.store.prune(now).catch(() => undefined);
  }

  /**
   * After a daemon restart: re-attach every active run to its pane, or treat it
   * as gone. Only runs that predate `since` (this daemon's start) are considered:
   * a run created by this instance while start-up was still finishing is live
   * in memory and its pane may not be in the resync's pane map yet.
   */
  async reattach(since: number): Promise<void> {
    for (const run of this.deps.store.active()) {
      if (run.startedAt >= since) continue;
      const pane = this.deps.pane(run.target.paneId);
      if (!pane || !pane.agent) {
        await this.sessionGone(run, 'daemon restarted and the pane is gone');
        continue;
      }
      const prev = run.lastAgentStatus;
      run.lastAgentStatus = pane.agent_status;
      if (run.status === 'starting' || (run.status === 'waiting' && run.waitingFor === 'startup_input')) {
        if (pane.agent_status === 'idle' || pane.agent_status === 'done') {
          if (run.prompts.length === 0) {
            try {
              await this.prompt(run);
            } catch (e) {
              await this.fail(run, `prompt failed: ${(e as Error).message}`);
            }
          } else await this.settle(run);
        }
        continue;
      }
      if (pane.agent_status === 'working') run.sawWorking = true;
      await this.deps.store.save(run);
      if (pane.agent_status !== prev) await this.onPaneStatus(pane, prev);
      this.deps.log.info('run re-attached', { run: run.id, pane: pane.pane_id, status: pane.agent_status });
    }
  }

  /* ------------------------------------------------------------------ */
  /* stop                                                                */
  /* ------------------------------------------------------------------ */

  /**
   * Interrupt, then tear down what the plugin created (spec §7.3, amended):
   * isolated runs remove the worktree **first** (`pane.close` would orphan the
   * checkout, spike M4 H5); a dirty worktree is kept unless `discard`.
   */
  async stop(id: string, opts: { discard?: boolean } = {}): Promise<StopResult> {
    const run = this.deps.store.get(id);
    if (!run) return { stopped: false, reason: `no run ${id}` };
    if (!isActive(run)) return { stopped: false, reason: `run ${id} is already ${run.status}`, run };
    this.stopping.add(run.id);
    try {
      const pane = this.deps.pane(run.target.paneId);
      if (pane?.agent) await this.deps.client.agentSendKeys(run.target.paneId, ESC_TWICE).catch((e) => this.deps.log.debug('send_keys on stop failed', (e as Error).message));
      let note = '';
      if (run.target.worktree) {
        try {
          await this.deps.client.worktreeRemove({ workspace_id: run.target.worktree.workspaceId, force: opts.discard === true });
          note = `worktree ${run.target.worktree.path} removed`;
        } catch (e) {
          const err = e as HerdrError;
          if (err.code === 'dirty_worktree_requires_force') {
            note = `worktree kept (uncommitted changes) at ${run.target.worktree.path}; stop with --discard to delete it`;
            run.warnings.push(note);
          } else if (err.code === 'workspace_not_found') note = `worktree workspace already closed; checkout may remain at ${run.target.worktree.path}`;
          else throw e;
        }
      } else if (run.createdPane && pane) {
        await this.deps.client.paneClose(run.target.paneId);
        note = `pane ${run.target.paneId} closed`;
      }
      await this.finish(run, 'cancelled', `stopped by user${note ? `; ${note}` : ''}`);
      return { stopped: true, run };
    } catch (e) {
      await this.fail(run, `stop failed: ${(e as Error).message}`);
      return { stopped: false, reason: (e as Error).message, run };
    } finally {
      this.stopping.delete(run.id);
    }
  }

  /* ------------------------------------------------------------------ */
  /* helpers                                                             */
  /* ------------------------------------------------------------------ */

  private async update(run: RunRecord, patch: Partial<Pick<RunRecord, 'status' | 'waitingFor' | 'reason'>>): Promise<void> {
    if ('status' in patch && patch.status) run.status = patch.status;
    if ('waitingFor' in patch) run.waitingFor = patch.waitingFor;
    if ('reason' in patch) run.reason = patch.reason;
    run.updatedAt = this.deps.now();
    await this.deps.store.save(run);
    this.deps.onChange(run);
  }

  private async finish(run: RunRecord, status: 'done' | 'failed' | 'cancelled', reason: string): Promise<void> {
    run.exit = { at: this.deps.now(), reason };
    await this.update(run, { status, waitingFor: undefined, reason });
    this.deps.log.info(`run ${status}`, { run: run.id, reason });
  }

  private async fail(run: RunRecord, reason: string): Promise<void> {
    this.deps.log.warn('run failed', { run: run.id, reason });
    await this.finish(run, 'failed', reason);
    await this.deps.notify(`GSD run ${run.unit}: failed`, reason.slice(0, 240), 'request');
  }
}

/** Lowest incomplete phase number, GSD's own `--from` hint (`autonomous.md:590`). */
export function nextIncomplete(snap: ProjectSnapshot): string | undefined {
  const p = snap.phases.find((ph) => ph.status !== 'complete');
  return p ? trimNumber(p.number) : undefined;
}

export function describeRun(run: RunRecord): string {
  const where = run.target.worktree ? `${path.basename(run.target.worktree.path)} (${run.target.worktree.branch})` : run.target.paneId || '—';
  return `${run.id} ${run.unit} ${run.status}${run.waitingFor ? `/${run.waitingFor}` : ''} · ${run.command} · ${where}`;
}

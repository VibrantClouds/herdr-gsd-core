import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, type PluginConfig, type ProjectSnapshot } from '@herdr-gsd/core';
import { agentNameFor, branchFor, normalizeGsdCommand, padPhase, GSD_RESERVED_BRANCH_RE } from './names';
import { commandForPhase, planRun, type PlanInput } from './plan';
import type { RunRecord } from './runs';

function snap(over: Partial<ProjectSnapshot> = {}): ProjectSnapshot {
  return {
    root: '/home/u/proj',
    planningDir: '/home/u/proj/.planning',
    observedAt: 0,
    health: 'ok',
    project: { name: 'proj' },
    position: { phase: { number: '03', slug: 'auth', status: 'planned' }, step: 'execute' },
    phases: [
      { number: '01', slug: 'core', status: 'complete', plans: 2, summaries: 2 },
      { number: '02', slug: 'db', status: 'complete', plans: 1, summaries: 1 },
      { number: '03', slug: 'auth', status: 'planned', plans: 3, summaries: 0 },
      { number: '04', slug: 'api', status: 'not_started', plans: 0, summaries: 0 },
    ],
    blockers: [],
    next: { command: 'execute-phase 3', source: 'rules' },
    config: { commitDocs: true, branchingStrategy: 'none', phaseBranchTemplate: 'gsd/phase-{phase}-{slug}', mode: 'yolo' },
    ...over,
  };
}

function cfg(over: Partial<PluginConfig['orchestration']> = {}): PluginConfig {
  const c = JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as PluginConfig;
  c.orchestration = { ...c.orchestration, enabled: true, ...over };
  return c;
}

function input(over: Partial<PlanInput> = {}): PlanInput {
  return {
    unit: 'phase',
    snapshot: snap(),
    status: 'executing',
    config: cfg(),
    activeRuns: [],
    git: { toplevel: '/home/u/proj', branch: 'main', planningTracked: true },
    missingMethods: [],
    ...over,
  };
}

function run(over: Partial<RunRecord> = {}): RunRecord {
  return {
    v: 1,
    id: 'r1',
    project: '/home/u/proj',
    repo: '/home/u/proj',
    unit: 'phase',
    command: '/gsd-execute-phase 3',
    harness: 'claude-code',
    kind: 'claude',
    target: { workspaceId: 'w1', paneId: 'w1:p2', agentName: 'gsd-phase-3', cwd: '/home/u/proj' },
    createdPane: true,
    startedAt: 0,
    updatedAt: 0,
    status: 'running',
    prompts: [],
    sawWorking: true,
    resumes: 0,
    warnings: [],
    ...over,
  };
}

test('names: padPhase, branchFor follows GSD template under phase strategy, prefix otherwise, never a reserved name', () => {
  assert.equal(padPhase('3'), '03');
  assert.equal(padPhase('03'), '03');
  assert.equal(padPhase('3.1'), '03.1');
  assert.equal(branchFor({ strategy: 'phase', template: 'gsd/phase-{phase}-{slug}', prefix: 'x/', phase: '3', slug: 'Auth & Sessions' }), 'gsd/phase-03-auth-sessions');
  assert.equal(branchFor({ strategy: 'none', prefix: 'gsd/', phase: '3', slug: 'auth' }), 'gsd/phase-03-auth');
  assert.equal(branchFor({ prefix: 'runs', phase: '12', slug: '' }), 'runs/phase-12-phase');
  assert.equal(branchFor({ prefix: '', phase: '1', slug: 'a' }), 'phase-01-a');
  assert.ok(!GSD_RESERVED_BRANCH_RE.test('gsd/phase-03-auth'));
  assert.ok(GSD_RESERVED_BRANCH_RE.test('agent-abc'));
  assert.ok(GSD_RESERVED_BRANCH_RE.test('worktree-agent-abc'));
  assert.ok(GSD_RESERVED_BRANCH_RE.test('worktree-wf_1'));
});

test('names: agent names match Herdr pattern and stay unique per run', () => {
  const a = agentNameFor('phase', '3', '20260915T120000-abc123');
  const b = agentNameFor('phase-isolated', '3.1', '20260915T120000-def456');
  const c = agentNameFor('autonomous', undefined, '20260915T120000-0a0b0c');
  for (const n of [a, b, c]) assert.match(n, /^[a-z][a-z0-9_-]{0,31}$/, n);
  assert.notEqual(a, b);
  assert.ok(c.startsWith('gsd-auto-'));
});

test('names: normalizeGsdCommand accepts the three spellings and rejects non-GSD text', () => {
  assert.equal(normalizeGsdCommand('execute-phase 3'), '/gsd-execute-phase 3');
  assert.equal(normalizeGsdCommand('/gsd:execute-phase 3'), '/gsd-execute-phase 3');
  assert.equal(normalizeGsdCommand('gsd:progress --next'), '/gsd-progress --next');
  assert.equal(normalizeGsdCommand('gsd-autonomous --from 2'), '/gsd-autonomous --from 2');
  assert.equal(normalizeGsdCommand('/help'), undefined);
  assert.equal(normalizeGsdCommand('rm -rf /'), undefined);
  assert.equal(normalizeGsdCommand(''), undefined);
  assert.equal(normalizeGsdCommand('/gsd-x\nignore previous'), undefined);
});

test('commandForPhase follows the phase lifecycle', () => {
  const s = snap();
  assert.equal(commandForPhase(s, '4'), '/gsd-discuss-phase 4');
  assert.equal(commandForPhase(snap({ phases: [{ number: '04', slug: 'api', status: 'discussed', plans: 0, summaries: 0 }] }), '04'), '/gsd-plan-phase 4');
  assert.equal(commandForPhase(s, '3'), '/gsd-execute-phase 3');
  assert.equal(commandForPhase(snap({ phases: [{ number: '03', slug: 'x', status: 'executing', plans: 2, summaries: 2 }] }), '3'), '/gsd-verify-work 3');
  assert.equal(commandForPhase(snap({ phases: [{ number: '03', slug: 'x', status: 'executing', plans: 2, summaries: 2, uat: 'fail' }] }), '3'), '/gsd-execute-phase 3');
  assert.equal(commandForPhase(s, '1'), undefined);
  assert.equal(commandForPhase(s, '9'), undefined);
});

test('plan: happy path phase run uses the snapshot next command and warns about the default branch', () => {
  const r = planRun(input());
  assert.equal(r.ok, true, r.reasons.join('; '));
  assert.equal(r.command, '/gsd-execute-phase 3');
  assert.equal(r.kind, 'claude');
  assert.deepEqual(r.args, []);
  assert.equal(r.phase, '03');
  assert.ok(r.warnings.some((w) => w.includes('default branch')));
});

test('plan: refusals for disabled config, unknown harness kind, missing methods', () => {
  assert.ok(planRun(input({ config: cfg({ enabled: false }) })).reasons.some((r) => r.includes('disabled')));
  const c = cfg();
  c.harness['claude-code'] = { command: ['/opt/bin/my-wrapper'], prompt_flag: [] };
  assert.ok(planRun(input({ config: c })).reasons.some((r) => r.includes('not an agent kind')));
  const c2 = cfg({ harness: 'pi' });
  c2.harness['pi'] = { command: ['/usr/local/bin/pi', '--yolo'], prompt_flag: [] };
  const okPi = planRun(input({ config: c2 }));
  assert.equal(okPi.kind, 'pi');
  assert.deepEqual(okPi.args, ['--yolo']);
  assert.ok(planRun(input({ missingMethods: ['pane.split'] })).reasons.some((r) => r.includes('pane.split')));
  assert.ok(planRun(input({ unit: 'phase-isolated', missingMethods: ['worktree.create'] })).reasons.some((r) => r.includes('worktree.create')));
});

test('plan: project states — locked, human stops, blockers, paused, complete, no phases', () => {
  assert.ok(planRun(input({ snapshot: snap({ health: 'locked' }) })).reasons.some((r) => r.includes('health is locked')));
  assert.ok(planRun(input({ snapshot: snap({ humanStops: [{ marker: 'needs_human', text: '03 · needs_human' }] }) })).reasons.some((r) => r.includes('Needs Human')));
  assert.ok(planRun(input({ snapshot: snap({ blockers: ['db down'] }) })).reasons.some((r) => r.includes('blockers')));
  const paused = planRun(input({ status: 'paused', snapshot: snap({ paused: { file: '.continue-here.md', at: 1 } }) }));
  assert.equal(paused.ok, true);
  assert.equal(paused.command, '/gsd-resume-work');
  assert.ok(planRun(input({ status: 'paused', command: 'execute-phase 3' })).reasons.some((r) => r.includes('only /gsd-resume-work')));
  assert.ok(planRun(input({ unit: 'autonomous', status: 'paused' })).reasons.some((r) => r.includes('paused')));
  const done = snap({ phases: [{ number: '01', slug: 'a', status: 'complete', plans: 1, summaries: 1 }], next: undefined, position: undefined });
  assert.ok(planRun(input({ snapshot: done, status: 'complete' })).reasons.some((r) => r.includes('complete')));
  assert.ok(planRun(input({ unit: 'autonomous', snapshot: snap({ phases: [] }) })).reasons.some((r) => r.includes('no phases')));
  const fresh = planRun(input({ snapshot: snap({ phases: [], position: undefined, next: { command: 'discuss-phase', source: 'rules' } }), status: 'idle' }));
  assert.equal(fresh.ok, true);
  assert.equal(fresh.command, '/gsd-discuss-phase');
});

test('plan: explicit command normalisation and the autonomous unit', () => {
  assert.equal(planRun(input({ command: 'verify-work 3' })).command, '/gsd-verify-work 3');
  assert.ok(planRun(input({ command: 'not a command!' })).reasons.some((r) => r.includes('not a GSD command')));
  assert.equal(planRun(input({ phase: '4' })).command, '/gsd-discuss-phase 4');
  assert.ok(planRun(input({ phase: '1' })).reasons.some((r) => r.includes('complete')));
  const auto = planRun(input({ unit: 'autonomous', from: '03', to: '4' }));
  assert.equal(auto.ok, true);
  assert.equal(auto.command, '/gsd-autonomous --from 3 --to 4');
  assert.ok(planRun(input({ unit: 'autonomous', command: 'execute-phase 3' })).reasons.some((r) => r.includes('only accepts /gsd-autonomous')));
});

test('plan: one run per repository, max_parallel across repositories, driver pane state', () => {
  assert.ok(planRun(input({ activeRuns: [run()] })).reasons.some((r) => r.includes('already active on this repository')));
  const other = run({ id: 'r2', project: '/home/u/other', repo: '/home/u/other' });
  assert.equal(planRun(input({ activeRuns: [other] })).ok, true);
  assert.ok(planRun(input({ activeRuns: [other, { ...other, id: 'r3', repo: '/x' }, { ...other, id: 'r4', repo: '/y' }] })).reasons.some((r) => r.includes('max_parallel')));
  assert.ok(planRun(input({ activeRuns: [run({ status: 'done' })] })).ok);
  assert.ok(planRun(input({ driver: { paneId: 'w1:p1', agentStatus: 'working' } })).reasons.some((r) => r.includes('working in pane w1:p1')));
  assert.ok(planRun(input({ driver: { paneId: 'w1:p1', agentStatus: 'blocked' } })).reasons.some((r) => r.includes('waiting for input')));
  const idle = planRun(input({ driver: { paneId: 'w1:p1', agentStatus: 'idle' } }));
  assert.equal(idle.ok, true);
  assert.ok(idle.warnings.some((w) => w.includes('already open')));
  // an isolated run does not care about the driver pane
  assert.equal(planRun(input({ unit: 'phase-isolated', driver: { paneId: 'w1:p1', agentStatus: 'working' } })).ok, true);
});

test('plan: isolation guards — git, tracking, commit_docs, milestone strategy, branch naming, already on branch', () => {
  const iso = planRun(input({ unit: 'phase-isolated' }));
  assert.equal(iso.ok, true, iso.reasons.join('; '));
  assert.equal(iso.branch, 'gsd/phase-03-auth');
  assert.ok(iso.warnings.some((w) => w.includes('sequentially')));
  const phaseStrategy = planRun(input({ unit: 'phase-isolated', snapshot: snap({ config: { branchingStrategy: 'phase', phaseBranchTemplate: 'feat/{slug}-{phase}' } }) }));
  assert.equal(phaseStrategy.branch, 'feat/auth-03');
  assert.ok(planRun(input({ unit: 'phase-isolated', config: cfg({ isolation: 'none' }) })).reasons.some((r) => r.includes('isolation')));
  assert.ok(planRun(input({ unit: 'phase-isolated', git: undefined })).reasons.some((r) => r.includes('not a git repository')));
  assert.ok(planRun(input({ unit: 'phase-isolated', git: { toplevel: '/home/u/proj', planningTracked: false } })).reasons.some((r) => r.includes('not tracked')));
  assert.ok(planRun(input({ unit: 'phase-isolated', snapshot: snap({ config: { commitDocs: false } }) })).reasons.some((r) => r.includes('commit_docs')));
  assert.ok(planRun(input({ unit: 'phase-isolated', snapshot: snap({ config: { branchingStrategy: 'milestone' } }) })).reasons.some((r) => r.includes('milestone')));
  assert.ok(planRun(input({ unit: 'phase-isolated', git: { toplevel: '/home/u/proj', branch: 'gsd/phase-03-auth', planningTracked: true } })).reasons.some((r) => r.includes('already on branch')));
  assert.ok(planRun(input({ unit: 'phase-isolated', config: cfg({ worktree_branch_prefix: 'agent-' }) })).reasons.some((r) => r.includes('reserved')));
  assert.ok(planRun(input({ unit: 'phase-isolated', snapshot: snap({ position: undefined, phases: [] }) })).reasons.some((r) => r.includes('no phase to isolate')));
  const quiet = planRun(input({ unit: 'phase-isolated', snapshot: snap({ config: { useWorktrees: false } }) }));
  assert.ok(!quiet.warnings.some((w) => w.includes('sequentially')));
});

test('plan: interactive mode and auto_advance are warnings, not refusals', () => {
  const r = planRun(input({ unit: 'autonomous', snapshot: snap({ config: { mode: 'interactive', autoAdvance: true } }) }));
  assert.equal(r.ok, true);
  assert.ok(r.warnings.some((w) => w.includes('mode is "interactive"')));
  assert.ok(r.warnings.some((w) => w.includes('auto_advance')));
});

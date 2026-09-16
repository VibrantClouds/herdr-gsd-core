import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  PHASE_DIR_RE,
  blockerPhaseTag,
  clearGsdVersionCache,
  derivePhaseStatus,
  deriveGsdStatus,
  diffSnapshots,
  isPlanFile,
  isSentinelPhaseId,
  isSummaryFile,
  locateFieldRow,
  mapUatStatus,
  nextFromSmartEntry,
  normalizeStateStatus,
  parseBlockers,
  parseConcerns,
  parseFrontmatter,
  parseGsdConfig,
  parseHumanStops,
  parseRoadmapCheckboxes,
  parseRoadmapProgress,
  readProjectSnapshot,
  stateCurrentPositionSlice,
  stateExtractField,
  stepForStatus,
  type PlanningDirent,
  type PlanningFs,
  type PlanningStat,
} from './planning';
import type { ProjectSnapshot } from './types';
import { ThrottledRunner, type RunResult, type ToolsLocation } from './tools';

const REPO = resolve(__dirname, '..', '..', '..');
const F14 = join(REPO, 'test', 'fixtures', 'planning', '1.14');
const SYN = join(REPO, 'test', 'fixtures', 'planning', 'synthetic');
/** keep gsdVersion deterministic: no real ~/.claude/gsd-core/VERSION lookup */
const ISOLATED = { home: join(tmpdir(), 'no-such-home'), env: {} as NodeJS.ProcessEnv };

async function expected(fixture: string, name: string): Promise<Record<string, unknown>> {
  return JSON.parse(await fs.readFile(join(F14, fixture, 'expected', `${name}.json`), 'utf8')) as Record<string, unknown>;
}

/* ================================================================== *
 * GSD's own parsers
 * ================================================================== */

test('parseFrontmatter: flat scalars, quotes stripped, nested blocks skipped', () => {
  const { fm, body, malformed } = parseFrontmatter(
    ['---', 'milestone: v1.0', 'last_updated: "2026-07-26T18:33:45.721Z"', "name: 'quoted'", 'empty:', 'progress:', '  total_phases: 3', '---', '', '# Body'].join('\n'),
  );
  assert.equal(malformed, false);
  assert.deepEqual(fm, { milestone: 'v1.0', last_updated: '2026-07-26T18:33:45.721Z', name: 'quoted' });
  assert.equal(Object.keys(fm).includes('total_phases'), false);
  assert.match(body, /# Body/);
});

test('parseFrontmatter: no fence, and an unterminated fence', () => {
  assert.deepEqual(parseFrontmatter('# Plain').fm, {});
  assert.equal(parseFrontmatter('# Plain').malformed, false);
  const bad = parseFrontmatter('---\nstatus: executing\n\n# No close');
  assert.equal(bad.malformed, true);
  assert.equal(bad.body, '---\nstatus: executing\n\n# No close');
});

test('stateExtractField: the three-step ladder, in order', () => {
  assert.equal(stateExtractField('**Status:** Ready to plan', 'Status'), 'Ready to plan');
  assert.equal(stateExtractField('Status: Ready to execute', 'Status'), 'Ready to execute');
  assert.equal(stateExtractField('| Status | blocked |\n', 'Status'), 'blocked');
  assert.equal(stateExtractField('nothing here', 'Status'), undefined);
  // bold wins over plain
  assert.equal(stateExtractField('Status: plain\n**Status:** bold', 'Status'), 'bold');
  // field names are regex-escaped
  assert.equal(stateExtractField('a.b: x', 'a.b'), 'x');
});

test('locateFieldRow: separator rows and short rows excluded', () => {
  const table = ['| Field | Value |', '|-------|-------|', '| Phase | 03 |', '| Empty |  |', 'no pipes'].join('\n');
  assert.equal(locateFieldRow(table, 'Phase'), '03');
  assert.equal(locateFieldRow(table, 'Empty'), undefined);
  assert.equal(locateFieldRow(table, 'Missing'), undefined);
  assert.equal(locateFieldRow('| a | b', 'a'), undefined);
  assert.equal(locateFieldRow('| **Phase** | 04 |\n', 'Phase'), '04');
});

test('stateCurrentPositionSlice: h2 or h3, stops at the next heading', () => {
  const doc = ['## Current Position', 'Phase: 02', '', '## Performance Metrics', 'Phase: 99'].join('\n');
  const slice = stateCurrentPositionSlice(doc);
  assert.match(slice, /Phase: 02/);
  assert.doesNotMatch(slice, /Phase: 99/);
  assert.match(stateCurrentPositionSlice('### current position\nPhase: 7'), /Phase: 7/);
  assert.equal(stateCurrentPositionSlice('# No such section'), '');
  assert.match(stateCurrentPositionSlice('## Current Position\nPhase: 1'), /Phase: 1/); // no following heading
});

test('normalizeStateStatus: exact tokens, anchored patterns, verbatim passthrough', () => {
  for (const [input, out] of [
    ['paused', 'paused'],
    ['Stopped', 'paused'],
    ['discussing', 'discussing'],
    ['executing', 'executing'],
    ['In Progress', 'executing'],
    ['Ready to execute', 'executing'],
    ['verifying', 'verifying'],
    ['Phase complete — ready for verification', 'verifying'],
    ['planning', 'planning'],
    ['Ready to plan', 'planning'],
    ['planning  complete', 'planning'],
    ['completed', 'completed'],
    ['done', 'completed'],
    ['all phases complete', 'completed'],
    ['unknown', 'unknown'],
    ['executing phase 02', 'executing'],
    ['planning phase 4', 'planning'],
    ['verifying phase 4', 'verifying'],
    ['Phase 7 complete', 'completed'],
    ['v1.0 milestone complete', 'completed'],
    ['complete ✅', 'completed'],
  ] as const) {
    assert.equal(normalizeStateStatus(input), out, input);
  }
  // #4186: prose containing a trigger word must pass through untouched
  assert.equal(normalizeStateStatus('waiting on the executing agent to finish'), 'waiting on the executing agent to finish');
  assert.equal(normalizeStateStatus(''), '');
  assert.equal(normalizeStateStatus('   '), '');
  assert.equal(normalizeStateStatus(undefined), '');
  // pausedAt short-circuits everything
  assert.equal(normalizeStateStatus('executing', '2026-09-15'), 'paused');
  assert.equal(normalizeStateStatus('executing', '  '), 'executing');
  assert.equal(normalizeStateStatus('executing', 'None'), 'executing');
});

test('stepForStatus', () => {
  assert.equal(stepForStatus('planning'), 'plan');
  assert.equal(stepForStatus('executing'), 'execute');
  assert.equal(stepForStatus('verifying'), 'verify');
  assert.equal(stepForStatus('verify'), 'verify');
  assert.equal(stepForStatus('completed'), 'ship');
  assert.equal(stepForStatus('complete'), 'ship');
  assert.equal(stepForStatus('shipped'), 'ship');
  assert.equal(stepForStatus('discussing'), 'discuss');
  assert.equal(stepForStatus('paused'), undefined);
});

test('parseBlockers is GSD-faithful (h2 only); parseConcerns picks up the divergent list', () => {
  const doc = [
    '## Blockers',
    '- upstream API is down',
    '- None',
    '',
    '## Accumulated Context',
    '',
    '### Blockers/Concerns',
    '',
    '- [Phase 1]: spike unresolved',
    '- upstream API is down',
    '',
    '### Pending Todos',
    '',
    '- not a blocker',
  ].join('\n');
  assert.deepEqual(parseBlockers(doc), ['upstream API is down']);
  assert.deepEqual(parseConcerns(doc), ['[Phase 1]: spike unresolved', 'upstream API is down']);
  assert.deepEqual(parseBlockers('## Blockers\n\nNone yet.\n'), []);
  assert.deepEqual(parseBlockers('# nothing'), []);
  assert.deepEqual(parseConcerns('# nothing'), []);
  // same placeholder filtering on both
  assert.deepEqual(parseBlockers('## Blockers\n- none\n- N/A\n- *(none)*\n- —\n- tbd\n'), []);
  assert.deepEqual(parseConcerns('### Blockers/Concerns\n- none\n- None yet\n- -\n'), []);
});

test('blockerPhaseTag', () => {
  assert.equal(blockerPhaseTag('[Phase 03]: text'), '3');
  assert.equal(blockerPhaseTag('[Phase 2] text'), '2');
  assert.equal(blockerPhaseTag('[phase 2.1] text'), '2.1');
  assert.equal(blockerPhaseTag('no tag'), undefined);
  assert.equal(blockerPhaseTag('[Roadmap]: text'), undefined);
});

test('parseRoadmapProgress: header superset, column order invariant, sentinels excluded', () => {
  const doc = [
    '# Roadmap',
    '## Progress',
    '| Phase | Milestone | Plans Complete | Status | Completed |',
    '| --- | --- | --- | --- | --- |',
    '| 1. Foundation | v1.0 | 6/6 | Complete    | 2026-07-23 |',
    '| 2. Execution | v1.0 | 17/18 | In Progress |  |',
    '| 0. Sentinel | v1.0 | 0/0 | Complete | - |',
    '| 999.1 Reserved | v1.0 | 0/0 | Complete | - |',
    '| notes only | | | | |',
    '',
    '## Requirement Coverage',
    '| Phase | Plans Complete | Status | Completed |',
    '| 9. Shadow | 0/0 | Complete | - |',
  ].join('\n');
  const m = parseRoadmapProgress(doc);
  assert.equal(m.get('1'), 'Complete');
  assert.equal(m.get('2'), 'In Progress');
  assert.equal(m.has('0'), false);
  assert.equal(m.has('999.1'), false);
  assert.equal(m.has('9'), false, 'scoped to ## Progress only');
});

test('parseRoadmapProgress: no table at all', () => {
  assert.equal(parseRoadmapProgress('# Roadmap\n\nprose only\n').size, 0);
  assert.equal(parseRoadmapProgress('## Progress\n\n| A | B |\n| - | - |\n| x | y |\n').size, 0);
});

test('parseRoadmapCheckboxes: the state-contract.cjs fallback', () => {
  const doc = ['## Phases', '- [x] **Phase 1: Foundation**', '- [ ] **Phase 2.1: Hotfix**', '* [X] **Phase 3 Bare**', '- [x] **Phase 0: Sentinel**', '- not a phase'].join('\n');
  const m = parseRoadmapCheckboxes(doc);
  assert.equal(m.get('1'), true);
  assert.equal(m.get('2.1'), false);
  assert.equal(m.get('3'), true);
  assert.equal(m.has('0'), false);
  assert.equal(parseRoadmapCheckboxes('# no phases section').size, 0);
});

test('phase dir regex, sentinels, plan/summary predicates', () => {
  assert.deepEqual(PHASE_DIR_RE.exec('02-execution-worktree')?.slice(1), ['02', 'execution-worktree']);
  assert.deepEqual(PHASE_DIR_RE.exec('2.1-hotfix')?.slice(1), ['2.1', 'hotfix']);
  assert.deepEqual(PHASE_DIR_RE.exec('7')?.slice(1), ['7', '']);
  assert.equal(PHASE_DIR_RE.exec('quick'), null);
  assert.equal(isSentinelPhaseId('0'), true);
  assert.equal(isSentinelPhaseId('00'), true);
  assert.equal(isSentinelPhaseId('999'), true);
  assert.equal(isSentinelPhaseId('999.1'), true);
  assert.equal(isSentinelPhaseId('1'), false);
  assert.equal(isPlanFile('02-14-PLAN.md'), true);
  assert.equal(isPlanFile('PLAN.md'), true);
  assert.equal(isPlanFile('02-PLANS.md'), false);
  assert.equal(isSummaryFile('02-14-SUMMARY.md'), true);
  assert.equal(isSummaryFile('SUMMARY.md'), true);
  assert.equal(isSummaryFile('COVERAGE.md'), false);
});

test('derivePhaseStatus: the full mapping table', () => {
  assert.equal(derivePhaseStatus({ plans: 0, summaries: 0, hasContext: false }), 'not_started');
  assert.equal(derivePhaseStatus({ plans: 0, summaries: 0, hasContext: true }), 'discussed');
  assert.equal(derivePhaseStatus({ plans: 3, summaries: 0, hasContext: false }), 'planned');
  assert.equal(derivePhaseStatus({ plans: 3, summaries: 1, hasContext: false }), 'executing');
  assert.equal(derivePhaseStatus({ plans: 3, summaries: 3, hasContext: false, verification: 'passed' }), 'complete');
  assert.equal(derivePhaseStatus({ plans: 3, summaries: 3, hasContext: false, verification: 'human_needed' }), 'verifying');
  assert.equal(derivePhaseStatus({ plans: 3, summaries: 3, hasContext: false, verification: 'gaps_found' }), 'verifying');
  assert.equal(derivePhaseStatus({ plans: 3, summaries: 3, hasContext: false }), 'verifying');
  assert.equal(derivePhaseStatus({ plans: 3, summaries: 4, hasContext: false, verification: 'passed' }), 'complete');
});

test('mapUatStatus', () => {
  for (const v of ['passed', 'pass', 'PASS', 'complete', 'completed']) assert.equal(mapUatStatus(v), 'pass', v);
  for (const v of ['failed', 'fail', 'gaps_found']) assert.equal(mapUatStatus(v), 'fail', v);
  for (const v of ['in_progress', '', 'whatever']) assert.equal(mapUatStatus(v), 'pending', v);
  assert.equal(mapUatStatus(undefined), 'pending');
});

/* ================================================================== *
 * real 1.14 fixtures vs GSD's own CLI output
 * ================================================================== */

test('fixture executing/ agrees with GSD', async () => {
  const snap = await readProjectSnapshot(join(F14, 'executing'), ISOLATED);
  const ss = await expected('executing', 'state-snapshot');
  const prog = await expected('executing', 'progress');
  const se = await expected('executing', 'smart-entry');

  assert.equal(snap.health, 'ok');
  assert.equal(snap.position?.phase?.number, ss['current_phase']);
  assert.equal(snap.position?.phase?.slug, ss['current_phase_name']);
  assert.equal(snap.position?.step, 'execute');
  assert.equal(snap.project?.name, 'Fleet');
  assert.equal(snap.project?.milestone, prog['milestone_version']);

  const gsdPhases = prog['phases'] as Array<Record<string, unknown>>;
  assert.equal(snap.phases.length, gsdPhases.length);
  for (const [i, p] of snap.phases.entries()) {
    assert.equal(p.number, gsdPhases[i]?.['number']);
    assert.equal(p.plans, gsdPhases[i]?.['plans']);
    assert.equal(p.summaries, gsdPhases[i]?.['summaries']);
  }
  assert.deepEqual(
    snap.phases.map((p) => p.status),
    ['complete', 'executing'],
  );
  // GSD "Complete"/"In Progress" ↔ our complete/executing
  assert.deepEqual(gsdPhases.map((p) => p['status']), ['Complete', 'In Progress']);

  assert.equal(snap.position?.plan?.index, 2);
  assert.equal(snap.position?.plan?.total, 18);
  assert.deepEqual(snap.config, { parallelization: true, modelProfile: 'adaptive', commitDocs: true, mode: 'yolo', autoAdvance: false, branchingStrategy: 'none', phaseBranchTemplate: 'gsd/phase-{phase}-{slug}' });
  assert.equal(deriveGsdStatus(snap), 'executing');
  // GSD recommends the progress router; we promote its concrete alternative
  assert.equal(se['recommended'], 'progress-next');
  assert.equal(snap.next?.command, 'execute-phase 2');
  assert.equal(snap.next?.source, 'rules');
  // blockers match GSD exactly; the prose list surfaces as advisory `concerns`
  assert.deepEqual(snap.blockers, ss['blockers']);
  assert.deepEqual(snap.blockers, []);
  assert.equal(snap.concerns?.length, 1);
});

test('fixture planning-midmilestone/ agrees with GSD', async () => {
  const snap = await readProjectSnapshot(join(F14, 'planning-midmilestone'), ISOLATED);
  const ss = await expected('planning-midmilestone', 'state-snapshot');
  const prog = await expected('planning-midmilestone', 'progress');
  const se = await expected('planning-midmilestone', 'smart-entry');

  assert.equal(snap.position?.phase?.number, ss['current_phase']); // bare "4" against phases/04-images
  assert.equal(snap.position?.phase?.slug, ss['current_phase_name']);
  assert.equal(snap.position?.step, 'plan');
  const gsdPhases = prog['phases'] as Array<Record<string, unknown>>;
  assert.deepEqual(
    snap.phases.map((p) => [p.number, p.plans, p.summaries]),
    gsdPhases.map((p) => [p['number'], p['plans'], p['summaries']]),
  );
  assert.deepEqual(
    snap.phases.map((p) => p.status),
    ['complete', 'complete', 'complete', 'discussed'],
  );
  assert.deepEqual(
    snap.phases.map((p) => p.uat),
    ['pass', 'pass', 'pass', undefined],
  );
  assert.equal(se['situation'], 'planning');
  assert.equal(snap.next?.command, 'plan-phase 4');
  assert.equal(deriveGsdStatus(snap), 'planning');
  assert.deepEqual(snap.blockers, ss['blockers'], 'GSD-faithful: []');
  assert.equal(snap.concerns?.length, 8);
  // its state.json predates STATE.md's mtime on any fresh checkout → ignored
  assert.ok(snap.diagnostics?.some((d) => d.startsWith('state.json ignored as stale')));
});

test('fixture milestone-rollover/ agrees with GSD', async () => {
  const snap = await readProjectSnapshot(join(F14, 'milestone-rollover'), ISOLATED);
  const ss = await expected('milestone-rollover', 'state-snapshot');
  const prog = await expected('milestone-rollover', 'progress');
  assert.equal(snap.position?.phase?.number, ss['current_phase']);
  assert.equal(snap.position?.phase?.slug, ss['current_phase_name']);
  assert.equal(snap.project?.milestone, prog['milestone_version'], 'new milestone v1.1, not the archived v1.0');
  // archived .planning/milestones/v1.0-phases/** must not become phases
  assert.deepEqual(
    snap.phases.map((p) => [p.number, p.plans, p.summaries, p.status]),
    [['07', 0, 0, 'discussed']],
  );
  assert.equal((prog['phases'] as unknown[]).length, 1);
  assert.equal(snap.next?.command, 'plan-phase 7');
  assert.equal(deriveGsdStatus(snap), 'planning');
  // long-lived advisories must land in `concerns`, never in `blockers`
  assert.deepEqual(snap.blockers, ss['blockers']);
  assert.equal(snap.concerns?.length, 5);
});

test('fixture empty/ — initialised but no phases: GSD says discuss-phase', async () => {
  const snap = await readProjectSnapshot(join(F14, 'empty'), ISOLATED);
  const se = await expected('empty', 'smart-entry');
  assert.equal(snap.health, 'ok', 'PROJECT.md alone still counts as a planning dir');
  assert.deepEqual(snap.phases, []);
  assert.equal(snap.position, undefined);
  assert.equal(snap.project?.name, 'Widget Forge');
  assert.equal(se['recommended'], 'discuss-phase');
  assert.equal(snap.next?.command, 'discuss-phase');
  assert.equal(deriveGsdStatus(snap), 'idle');
});

test('no .planning at all → no_planning', async () => {
  const dir = await fs.mkdtemp(join(tmpdir(), 'gsd-none-'));
  const snap = await readProjectSnapshot(dir, ISOLATED);
  assert.equal(snap.health, 'no_planning');
  assert.deepEqual(snap.phases, []);
  assert.deepEqual(snap.blockers, []);
  assert.equal(snap.next, undefined);
  assert.deepEqual(diffSnapshots(undefined, snap), ['health']);
});

/* ================================================================== *
 * synthetic fixtures
 * ================================================================== */

test('synthetic paused/: .continue-here.md in the active phase dir', async () => {
  const snap = await readProjectSnapshot(join(SYN, 'paused'), ISOLATED);
  assert.equal(snap.paused?.file, 'phases/01-groundwork/.continue-here.md');
  assert.ok((snap.paused?.at ?? 0) > 0);
  assert.equal(deriveGsdStatus(snap), 'paused');
  assert.equal(snap.next?.command, 'resume-work');
  assert.equal(snap.phases[0]?.status, 'executing');
});

test('synthetic blocked/: status token + [Phase N] tagged blocker', async () => {
  const snap = await readProjectSnapshot(join(SYN, 'blocked'), ISOLATED);
  assert.deepEqual(snap.blockers, ['[Phase 2] upstream API credentials are not provisioned']);
  assert.equal(snap.concerns, undefined);
  assert.equal(snap.phases[0]?.status, 'blocked');
  assert.equal(snap.position?.phase?.status, 'blocked');
  assert.equal(deriveGsdStatus(snap), 'blocked');
});

test('synthetic parse-error/: unterminated frontmatter still yields a usable snapshot', async () => {
  const snap = await readProjectSnapshot(join(SYN, 'parse-error'), ISOLATED);
  assert.equal(snap.health, 'parse_error');
  assert.deepEqual(snap.diagnostics, ['STATE.md: frontmatter fence opened but never closed']);
  assert.equal(snap.position?.phase?.number, '1');
});

test('synthetic uat-fail/ and uat-pass/', async () => {
  const fail = await readProjectSnapshot(join(SYN, 'uat-fail'), ISOLATED);
  assert.equal(fail.phases[0]?.uat, 'fail');
  assert.equal(fail.phases[0]?.status, 'verifying', 'VERIFICATION gaps_found is not complete');
  assert.equal(fail.next?.command, 'execute-phase 1');
  assert.equal(deriveGsdStatus(fail), 'verifying');

  const pass = await readProjectSnapshot(join(SYN, 'uat-pass'), ISOLATED);
  assert.equal(pass.phases[0]?.uat, 'pass');
  assert.equal(pass.phases[0]?.status, 'complete');
  assert.equal(pass.position?.step, 'ship');
  assert.equal(deriveGsdStatus(pass), 'complete');
});

test('synthetic state-json-fresh/: GSD\'s published contract overlays milestone, statuses and next', async () => {
  const snap = await readProjectSnapshot(join(SYN, 'state-json-fresh'), ISOLATED);
  assert.equal(snap.project?.milestone, 'v2.0', 'state.json wins over STATE.md frontmatter');
  assert.equal(snap.phases[0]?.status, 'executing', 'in_progress → executing');
  assert.equal(snap.phases[1]?.status, 'complete', 'complete → complete');
  assert.equal(snap.phases.length, 2, 'a state.json phase with no directory is not invented');
  assert.equal(snap.next?.source, 'state.json');
  assert.equal(snap.next?.command, 'progress --next');
  assert.equal(snap.next?.reason, 'Phase 1 of 2');
  assert.equal(snap.diagnostics, undefined);
  assert.equal(snap.gsdVersion, 'core', 'last-resort: state.json flavor');
});

test('synthetic state-json-stale/: ignored with a diagnostic', async () => {
  const snap = await readProjectSnapshot(join(SYN, 'state-json-stale'), ISOLATED);
  assert.equal(snap.project?.milestone, 'v1.0');
  assert.deepEqual(
    snap.phases.map((p) => p.status),
    ['planned', 'planned'],
  );
  assert.equal(snap.next?.source, 'rules');
  assert.ok(snap.diagnostics?.[0]?.startsWith('state.json ignored as stale'));
});

test('synthetic decimal-phase/: decimal numbers stay strings, sentinels excluded', async () => {
  const snap = await readProjectSnapshot(join(SYN, 'decimal-phase'), ISOLATED);
  assert.deepEqual(
    snap.phases.map((p) => p.number),
    ['02', '2.1'],
  );
  assert.equal(typeof snap.phases[1]?.number, 'string');
  assert.equal(snap.phases[0]?.status, 'complete', '## Phases checkbox fallback');
  assert.equal(snap.phases[1]?.status, 'executing');
  assert.equal(snap.position?.phase?.number, '2.1');
  assert.equal(snap.position?.wave, 2);
  assert.equal(snap.position?.plan?.id, '2.1-01');
  assert.equal(snap.next?.command, 'execute-phase 2.1');
});

test('synthetic nested-plans/: plans/ subdir, bare PLAN.md, HANDOFF.json', async () => {
  const snap = await readProjectSnapshot(join(SYN, 'nested-plans'), ISOLATED);
  assert.equal(snap.phases[0]?.plans, 3);
  assert.equal(snap.phases[0]?.summaries, 1);
  assert.equal(snap.phases[0]?.status, 'executing');
  assert.equal(snap.paused?.file, 'HANDOFF.json');
  assert.equal(deriveGsdStatus(snap), 'paused');
});

/* ================================================================== *
 * locks
 * ================================================================== */

test('milestone.lock alone never locks: it is GSD\'s advisory session claim (O8)', async () => {
  const sleeps: number[] = [];
  const lock = { sleep: async (ms: number) => void sleeps.push(ms), exists: async (p: string) => p.endsWith('milestone.lock') };
  const snap = await readProjectSnapshot(join(SYN, 'locked-stale'), { ...ISOLATED, lock });
  assert.equal(snap.health, 'ok');
  assert.deepEqual(sleeps, []);
});

test('both write locks held → health locked, previous snapshot preserved', async () => {
  const sleeps: number[] = [];
  const lock = { sleep: async (ms: number) => void sleeps.push(ms) };
  const first = await readProjectSnapshot(join(SYN, 'paused'), ISOLATED);
  const snap = await readProjectSnapshot(join(SYN, 'locked-stale'), { ...ISOLATED, lock, previous: first, now: () => 42 });
  assert.equal(snap.health, 'locked');
  assert.equal(snap.observedAt, 42);
  assert.equal(snap.root, join(SYN, 'locked-stale'));
  assert.deepEqual(snap.phases, first.phases, 'previous values kept');
  assert.equal(sleeps.reduce((a, b) => a + b, 0), 5000);
});

test('locked with no previous snapshot → minimal locked snapshot', async () => {
  const snap = await readProjectSnapshot(join(SYN, 'locked-stale'), { ...ISOLATED, lock: { sleep: async () => {} } });
  assert.equal(snap.health, 'locked');
  assert.deepEqual(snap.phases, []);
});

test('a non-lock error from the lock wait propagates', async () => {
  await assert.rejects(
    readProjectSnapshot(join(SYN, 'paused'), {
      ...ISOLATED,
      lock: {
        exists: async () => {
          throw new Error('EIO');
        },
      },
    }),
    /EIO/,
  );
});

/* ================================================================== *
 * gsd-tools enrichment
 * ================================================================== */

const LOC: ToolsLocation = { argv: ['node', '/fake/gsd-tools.cjs'], source: 'fake' };

function fakeTools(handler: (args: string[]) => Partial<RunResult> | Promise<Partial<RunResult>>): ThrottledRunner {
  const runner = async (_loc: ToolsLocation, args: string[]): Promise<RunResult> => {
    const r = await handler(args);
    return { ok: true, code: 0, stdout: '', stderr: '', timedOut: false, ...r };
  };
  return new ThrottledRunner(LOC, '/tmp', 0, () => 0, async () => {}, runner as never);
}

function jsonOut(value: unknown): Partial<RunResult> {
  const stdout = JSON.stringify(value);
  return { stdout, json: value };
}

const SMART_ENTRY_EXECUTING = {
  situation: 'executing',
  recommended: 'progress-next',
  summary: 'Phase 02 of 3 · executing',
  signals: { current_phase: '02' },
  actions: [
    { id: 'progress-next', label: 'Advance to the next step', command: '/gsd:progress --next', recommended: true },
    { id: 'execute-phase', label: 'Continue executing phase 02', command: '/gsd:execute-phase', recommended: false },
  ],
};

test('tools enrichment fills position, blockers, next and version', async () => {
  clearGsdVersionCache();
  const seen: string[][] = [];
  const tools = fakeTools((args) => {
    seen.push(args);
    if (args[0] === 'state-snapshot')
      return jsonOut({
        current_phase: '02',
        current_phase_name: 'execution-worktree-runner-billing-safety',
        status: 'executing',
        current_plan: 3,
        total_plans_in_phase: 18,
        blockers: ['tool-reported blocker'],
        paused_at: null,
      });
    if (args[0] === 'smart-entry') return { ...jsonOut(SMART_ENTRY_EXECUTING), stderr: '⚠ GSD: /x may shadow project-local GSD.\n' };
    return jsonOut({ packageName: '@opengsd/gsd-core', version: '1.14.0' });
  });
  const snap = await readProjectSnapshot(join(F14, 'executing'), { ...ISOLATED, tools, toolsSource: 'global:~/.claude-gsd' });
  assert.deepEqual(snap.tools, { available: true, source: 'global:~/.claude-gsd', version: '1.14.0' });
  assert.equal(snap.gsdVersion, '1.14.0');
  assert.equal(snap.position?.plan?.index, 3);
  assert.equal(snap.position?.plan?.id, '02-03');
  assert.deepEqual(snap.blockers, ['tool-reported blocker'], 'state-snapshot.blockers land in blockers, not concerns');
  assert.equal(snap.concerns?.length, 1);
  assert.equal(snap.next?.source, 'smart-entry');
  assert.equal(snap.next?.command, 'execute-phase 2', 'progress --next promoted to its concrete alternative');
  assert.equal(snap.next?.situation, 'executing');
  assert.equal(snap.next?.label, 'Continue executing phase 02');
  assert.equal(snap.diagnostics, undefined, 'non-empty stderr is never a failure');
  assert.deepEqual(seen, [
    ['state-snapshot', '--project-dir', join(F14, 'executing')],
    ['smart-entry', '--json', '--project-dir', join(F14, 'executing')],
    ['runtime-identity'],
  ]);
});

test('runtime-identity is cached for 10 minutes per reader', async () => {
  clearGsdVersionCache();
  let identityCalls = 0;
  const tools = fakeTools((args) => {
    if (args[0] === 'runtime-identity') {
      identityCalls++;
      return jsonOut({ version: '1.14.0' });
    }
    return jsonOut({});
  });
  const opts = { ...ISOLATED, tools, toolsSource: 'cache-key' };
  await readProjectSnapshot(join(F14, 'empty'), { ...opts, now: () => 1000 });
  await readProjectSnapshot(join(F14, 'empty'), { ...opts, now: () => 1000 + 599_000 });
  assert.equal(identityCalls, 1);
  await readProjectSnapshot(join(F14, 'empty'), { ...opts, now: () => 1000 + 601_000 });
  assert.equal(identityCalls, 2);
});

test('@file: spill indirection is followed', async () => {
  clearGsdVersionCache();
  const dir = await fs.mkdtemp(join(tmpdir(), 'gsd-spill-'));
  const spill = join(dir, 'gsd-1789525613.json');
  await fs.writeFile(spill, JSON.stringify(SMART_ENTRY_EXECUTING));
  const tools = fakeTools((args) => {
    if (args[0] === 'smart-entry') return { stdout: `@file:${spill}\n` };
    if (args[0] === 'runtime-identity') return { stdout: '@file:/nope/missing.json' };
    return jsonOut({ current_phase: '02', status: 'executing' });
  });
  const snap = await readProjectSnapshot(join(F14, 'executing'), { ...ISOLATED, tools, toolsSource: 'spill' });
  assert.equal(snap.next?.source, 'smart-entry');
  assert.equal(snap.next?.command, 'execute-phase 2');
  assert.equal(snap.tools?.version, undefined);
});

test('tools failures degrade to filesystem values with diagnostics', async () => {
  clearGsdVersionCache();
  const tools = fakeTools((args) => {
    if (args[0] === 'state-snapshot') return { ...jsonOut({ error: 'STATE.md not found' }), ok: false, code: 1 };
    if (args[0] === 'smart-entry') return { stdout: 'not json at all', stderr: 'boom\n', ok: false, code: 2 };
    throw new Error('spawn ENOENT');
  });
  const snap = await readProjectSnapshot(join(F14, 'executing'), { ...ISOLATED, tools, toolsSource: 'broken' });
  assert.deepEqual(snap.tools, { available: false, source: 'broken' });
  assert.equal(snap.next?.source, 'rules');
  assert.equal(snap.next?.command, 'execute-phase 2');
  assert.equal(snap.position?.phase?.number, '02', 'filesystem values stand');
  assert.equal(snap.diagnostics?.length, 3);
  assert.ok(snap.diagnostics?.some((d) => d.includes('STATE.md not found')));
  assert.ok(snap.diagnostics?.some((d) => d.includes('boom')));
  assert.ok(snap.diagnostics?.some((d) => d.includes('spawn ENOENT')));
});

test('tools producing no stdout at all', async () => {
  clearGsdVersionCache();
  const tools = fakeTools(() => ({ stdout: '  ' }));
  const snap = await readProjectSnapshot(join(F14, 'empty'), { ...ISOLATED, tools });
  assert.equal(snap.tools?.available, false);
  assert.equal(snap.tools?.source, undefined);
  assert.ok(snap.diagnostics?.some((d) => d.includes('no JSON output')));
});

test('state-snapshot enrichment on a project with no filesystem phases', async () => {
  clearGsdVersionCache();
  const tools = fakeTools((args) => {
    if (args[0] === 'state-snapshot')
      return jsonOut({ current_phase: '5', current_phase_name: 'Ghost', status: 'paused', paused_at: '2026-09-15T00:00:00Z', blockers: [] });
    if (args[0] === 'smart-entry') return jsonOut({ recommended: 'resume-work', actions: [] });
    return jsonOut({});
  });
  const snap = await readProjectSnapshot(join(F14, 'empty'), { ...ISOLATED, tools });
  assert.deepEqual(snap.position?.phase, { number: '5', slug: 'Ghost', status: 'not_started' });
  assert.equal(snap.position?.step, undefined, 'paused has no step');
  assert.equal(snap.paused?.file, 'STATE.md');
  assert.equal(snap.next?.command, 'resume-work');
  assert.equal(deriveGsdStatus(snap), 'paused');
});

test('REAL gsd-tools against the executing fixture', async (t: TestContext) => {
  const cli = '/home/vibrantclouds/.claude-gsd/gsd-core/bin/gsd-tools.cjs';
  if (!(await fs.stat(cli).catch(() => undefined))) {
    t.skip('gsd-tools not installed on this machine');
    return;
  }
  clearGsdVersionCache();
  const root = join(F14, 'executing');
  const runner = new ThrottledRunner({ argv: [process.execPath, cli], source: 'real' }, root, 0);
  const snap = await readProjectSnapshot(root, { ...ISOLATED, tools: runner, toolsSource: 'real' });
  const ss = await expected('executing', 'state-snapshot');
  assert.equal(snap.tools?.available, true);
  assert.equal(snap.tools?.version, ((await expected('executing', 'runtime-identity'))['version'] as string));
  assert.equal(snap.position?.phase?.number, ss['current_phase']);
  assert.equal(snap.position?.phase?.slug, ss['current_phase_name']);
  assert.equal(snap.next?.source, 'smart-entry');
  assert.equal(snap.next?.command, 'execute-phase 2');
  assert.equal(snap.next?.situation, (await expected('executing', 'smart-entry'))['situation']);
  assert.equal(snap.diagnostics, undefined);
});

/* ================================================================== *
 * smart-entry → gsd_next
 * ================================================================== */

test('nextFromSmartEntry: promotion, numbering and degenerate documents', () => {
  assert.equal(nextFromSmartEntry(undefined), undefined);
  assert.equal(nextFromSmartEntry('nope'), undefined);
  assert.equal(nextFromSmartEntry({}), undefined);
  // recommended id only, no actions[]
  assert.deepEqual(nextFromSmartEntry({ recommended: 'discuss-phase', situation: 'needs-first-phase', summary: 'go' }), {
    command: 'discuss-phase',
    situation: 'needs-first-phase',
    reason: 'go',
  });
  // matched by id when no action carries recommended:true
  assert.equal(nextFromSmartEntry({ recommended: 'ship', actions: [{ id: 'ship', command: '/gsd-ship' }], signals: { current_phase: '03' } })?.command, 'ship 3');
  // number recovered from the label
  assert.equal(
    nextFromSmartEntry({
      recommended: 'progress-next',
      actions: [
        { id: 'progress-next', command: '/gsd:progress --next', recommended: true },
        { id: 'plan-phase', label: 'Plan phase 4', command: '/gsd:plan-phase' },
      ],
    })?.command,
    'plan-phase 4',
  );
  // router with no concrete alternative stays as-is
  assert.equal(
    nextFromSmartEntry({
      actions: [
        { id: 'progress-next', command: '/gsd:progress --next', recommended: true },
        { id: 'quick', command: '/gsd:quick' },
      ],
    })?.command,
    'progress --next',
  );
  // resume-work takes no phase number
  assert.equal(nextFromSmartEntry({ actions: [{ id: 'resume-work', command: '/gsd:resume-work', recommended: true }], signals: { current_phase: '3' } })?.command, 'resume-work');
  // a command that already carries a number is left alone
  assert.equal(nextFromSmartEntry({ actions: [{ id: 'plan-phase', command: '/gsd:plan-phase 9', recommended: true }], signals: { current_phase: '3' } })?.command, 'plan-phase 9');
  // no number anywhere
  assert.equal(nextFromSmartEntry({ actions: [{ id: 'plan-phase', command: '/gsd:plan-phase', recommended: true }] })?.command, 'plan-phase');
  // action with neither command nor id
  assert.equal(nextFromSmartEntry({ actions: [{ recommended: true }] }), undefined);
  // id-only action (no command field)
  assert.equal(nextFromSmartEntry({ actions: [{ id: 'verify-work', recommended: true, label: 'Verify phase 2' }] })?.command, 'verify-work 2');
  // actions present but none recommended and no recommended id
  assert.equal(nextFromSmartEntry({ actions: [{ id: 'quick', command: '/gsd:quick' }] }), undefined);
  assert.equal(nextFromSmartEntry({ actions: 'not-an-array', recommended: 'progress' })?.command, 'progress');
});

/* ================================================================== *
 * diff / derive
 * ================================================================== */

function snapOf(over: Partial<ProjectSnapshot> = {}): ProjectSnapshot {
  return { root: '/p', planningDir: '/p/.planning', observedAt: 1, health: 'ok', phases: [], blockers: [], ...over };
}

test('diffSnapshots: first observation reports everything', () => {
  assert.deepEqual(diffSnapshots(undefined, snapOf()), ['phase', 'step', 'status', 'blockers', 'uat', 'paused', 'health']);
});

test('diffSnapshots: concerns changes produce no key', () => {
  const a = snapOf({ concerns: ['old advisory'] });
  assert.deepEqual(diffSnapshots(a, { ...a, concerns: ['new advisory', 'another'] }), []);
});

test('diffSnapshots: identical snapshots report nothing', () => {
  const a = snapOf({
    position: { phase: { number: '02', slug: 'x', status: 'executing' }, plan: { id: '02-01', index: 1, total: 3 }, step: 'execute' },
    phases: [{ number: '02', slug: 'x', status: 'executing', plans: 3, summaries: 1, uat: 'pending' }],
    blockers: ['b'],
  });
  assert.deepEqual(diffSnapshots(a, { ...a, observedAt: 2 }), []);
});

test('diffSnapshots: one key at a time', () => {
  const base = snapOf({
    position: { phase: { number: '02', slug: 'x', status: 'executing' }, plan: { id: '02-01', index: 1, total: 3 }, step: 'execute' },
    phases: [{ number: '02', slug: 'x', status: 'executing', plans: 3, summaries: 1 }],
  });
  const phase = structuredClone(base);
  phase.position!.phase!.number = '03';
  assert.deepEqual(diffSnapshots(base, phase), ['phase']);

  const slug = structuredClone(base);
  slug.position!.phase!.slug = 'y';
  assert.deepEqual(diffSnapshots(base, slug), ['phase']);

  const step = structuredClone(base);
  step.position!.plan = { id: '02-02', index: 2, total: 3 };
  assert.deepEqual(diffSnapshots(base, step), ['step']);

  const status = structuredClone(base);
  status.position!.phase!.status = 'verifying';
  status.phases[0]!.status = 'verifying';
  assert.deepEqual(diffSnapshots(base, status), ['status']);

  const blockers = structuredClone(base);
  blockers.blockers = ['new'];
  // a new blocker also flips gsd_status to `blocked`, so `status` rides along
  assert.deepEqual(diffSnapshots(base, blockers), ['status', 'blockers']);

  const uat = structuredClone(base);
  uat.phases[0]!.uat = 'fail';
  assert.deepEqual(diffSnapshots(base, uat), ['uat']);

  const paused = structuredClone(base);
  paused.paused = { file: 'HANDOFF.json', at: 5 };
  assert.deepEqual(diffSnapshots(base, paused), ['status', 'paused']);

  const health = structuredClone(base);
  health.health = 'parse_error';
  assert.deepEqual(diffSnapshots(base, health), ['health']);
});

test('deriveGsdStatus: every branch', () => {
  assert.equal(deriveGsdStatus(snapOf({ health: 'no_planning' })), 'idle');
  assert.equal(deriveGsdStatus(snapOf({ paused: { file: 'x', at: 1 } })), 'paused');
  assert.equal(deriveGsdStatus(snapOf({ phases: [{ number: '1', slug: 'a', status: 'blocked', plans: 1, summaries: 0 }] })), 'blocked');
  assert.equal(deriveGsdStatus(snapOf({ blockers: ['x'] })), 'blocked');
  assert.equal(deriveGsdStatus(snapOf({ concerns: ['x'] })), 'idle', 'concerns never block');
  assert.equal(deriveGsdStatus(snapOf({ phases: [{ number: '1', slug: 'a', status: 'complete', plans: 1, summaries: 1 }] })), 'complete');
  const two = [
    { number: '01', slug: 'a', status: 'complete' as const, plans: 1, summaries: 1 },
    { number: '02', slug: 'b', status: 'planned' as const, plans: 1, summaries: 0 },
  ];
  assert.equal(deriveGsdStatus(snapOf({ phases: two })), 'planning', 'no position → first open phase');
  assert.equal(deriveGsdStatus(snapOf({ phases: two, position: { phase: { number: '1', slug: 'a', status: 'complete' } } })), 'complete');
  assert.equal(deriveGsdStatus(snapOf({ phases: [{ number: '1', slug: 'a', status: 'not_started', plans: 0, summaries: 0 }] })), 'idle');
  assert.equal(deriveGsdStatus(snapOf({ phases: [{ number: '1', slug: 'a', status: 'discussed', plans: 0, summaries: 0 }] })), 'planning');
  assert.equal(deriveGsdStatus(snapOf({ phases: [{ number: '1', slug: 'a', status: 'executing', plans: 2, summaries: 1 }] })), 'executing');
  assert.equal(deriveGsdStatus(snapOf({ phases: [{ number: '1', slug: 'a', status: 'verifying', plans: 2, summaries: 2 }] })), 'verifying');
  // no phases at all: fall back to the step
  for (const [step, out] of [
    ['plan', 'planning'],
    ['discuss', 'planning'],
    ['execute', 'executing'],
    ['verify', 'verifying'],
    ['ship', 'complete'],
  ] as const) {
    assert.equal(deriveGsdStatus(snapOf({ position: { step } })), out, step);
  }
  assert.equal(deriveGsdStatus(snapOf({ position: {} })), 'idle');
});

/* ================================================================== *
 * injected filesystem: hostile trees
 * ================================================================== */

class MemFs implements PlanningFs {
  constructor(
    private readonly files: Record<string, string>,
    private readonly opts: { failStat?: string[]; failReaddir?: string[]; failReadFile?: string[]; odd?: string[]; mtimes?: Record<string, number> } = {},
  ) {}
  private dirSet(): Set<string> {
    const d = new Set<string>();
    for (const f of Object.keys(this.files)) {
      const parts = f.split('/');
      for (let i = 1; i < parts.length; i++) d.add(parts.slice(0, i).join('/') || '/');
    }
    for (const o of this.opts.odd ?? []) d.add(o.slice(0, o.lastIndexOf('/')));
    return d;
  }
  async readFile(p: string): Promise<string> {
    if (this.opts.failReadFile?.includes(p)) throw new Error(`EACCES ${p}`);
    const v = this.files[p];
    if (v === undefined) throw new Error(`ENOENT ${p}`);
    return v;
  }
  async readdir(p: string): Promise<PlanningDirent[]> {
    if (this.opts.failReaddir?.includes(p)) throw new Error(`EACCES ${p}`);
    const dirs = this.dirSet();
    if (!dirs.has(p)) throw new Error(`ENOTDIR ${p}`);
    const names = new Map<string, PlanningDirent>();
    const add = (full: string, kind: 'f' | 'd' | 'o'): void => {
      if (!full.startsWith(`${p}/`)) return;
      const rest = full.slice(p.length + 1);
      const name = rest.split('/')[0] as string;
      const isDir = rest.includes('/') || kind === 'd';
      names.set(name, { name, isDirectory: () => isDir && kind !== 'o', isFile: () => !isDir && kind === 'f' });
    };
    for (const f of Object.keys(this.files)) add(f, 'f');
    for (const o of this.opts.odd ?? []) add(o, 'o');
    return [...names.values()];
  }
  async stat(p: string): Promise<PlanningStat> {
    if (this.opts.failStat?.includes(p)) throw new Error(`EACCES ${p}`);
    const isFile = this.files[p] !== undefined;
    const isDir = this.dirSet().has(p);
    if (!isFile && !isDir) throw new Error(`ENOENT ${p}`);
    return { mtimeMs: this.opts.mtimes?.[p] ?? 1000, isFile: () => isFile, isDirectory: () => isDir };
  }
}

const ROOT = '/proj';
const P = `${ROOT}/.planning`;

test('unreadable phase dir and unreadable nested plans/ are tolerated', async () => {
  const mem = new MemFs(
    {
      [`${P}/PROJECT.md`]: '# P\n',
      [`${P}/STATE.md`]: '---\ncurrent_phase: 1\nstatus: executing\n---\n',
      [`${P}/phases/01-a/01-01-PLAN.md`]: 'x',
      [`${P}/phases/02-b/02-01-PLAN.md`]: 'x',
      [`${P}/phases/02-b/plans/02-02-PLAN.md`]: 'x',
    },
    { failReaddir: [`${P}/phases/01-a`, `${P}/phases/02-b/plans`] },
  );
  const snap = await readProjectSnapshot(ROOT, { ...ISOLATED, fs: mem });
  assert.deepEqual(
    snap.phases.map((p) => [p.number, p.plans]),
    [['02', 1]],
  );
  assert.deepEqual(snap.diagnostics, ['phase dir unreadable: 01-a']);
});

test('missing phases/ dir, unstattable files and odd dirents', async () => {
  const mem = new MemFs(
    {
      [`${P}/PROJECT.md`]: '# P\n',
      [`${P}/ROADMAP.md`]: '# R\n',
      [`${P}/a.md`]: 'x',
      [`${P}/b.md`]: 'x',
      [`${P}/x.lock`]: 'x',
      [`${P}/state.json`]: '{ not json',
      [`${P}/graphs/g.json`]: 'x',
      [`${P}/research/.cache/c.json`]: 'x',
      [`${P}/config.json`]: '{"model_profile":"adaptive"}',
    },
    { failStat: [`${P}/a.md`], odd: [`${P}/sock`], mtimes: { [`${P}/b.md`]: 7777 } },
  );
  const snap = await readProjectSnapshot(ROOT, { ...ISOLATED, fs: mem });
  assert.deepEqual(snap.phases, []);
  assert.deepEqual(snap.lastActivity, { file: 'b.md', at: 7777 });
  assert.deepEqual(snap.config, { modelProfile: 'adaptive' });
  assert.equal(snap.project?.name, 'P');
  assert.equal(snap.paused, undefined);
});

test('the walk is depth-bounded at 4 and skips graphs/ and .cache/', async () => {
  const mem = new MemFs(
    {
      [`${P}/PROJECT.md`]: '# P\n',
      [`${P}/a/b/c/deep.md`]: 'x',
      [`${P}/a/b/c/d/too-deep.md`]: 'x',
      [`${P}/graphs/new.json`]: 'x',
      [`${P}/.cache/new.json`]: 'x',
      [`${P}/a/b/.continue-here.md`]: 'x',
      [`${P}/a/b/c/.continue-here.md`]: 'x',
    },
    { mtimes: { [`${P}/a/b/c/d/too-deep.md`]: 9e9, [`${P}/graphs/new.json`]: 9e9, [`${P}/.cache/new.json`]: 9e9, [`${P}/a/b/c/deep.md`]: 5000, [`${P}/a/b/.continue-here.md`]: 10, [`${P}/a/b/c/.continue-here.md`]: 20 } },
  );
  const snap = await readProjectSnapshot(ROOT, { ...ISOLATED, fs: mem });
  assert.deepEqual(snap.lastActivity, { file: 'a/b/c/deep.md', at: 5000 });
  // depth ≤ 3 below .planning, which is exactly where GSD writes it
  // (`.planning/phases/NN-slug/.continue-here.md`); a/b/c/ is one level too deep.
  assert.equal(snap.paused?.file, 'a/b/.continue-here.md');
});

test('paused_at in STATE.md with no marker file on disk', async () => {
  const mem = new MemFs(
    { [`${P}/STATE.md`]: '---\ncurrent_phase: 1\nstatus: executing\npaused_at: 2026-09-15T10:00:00Z\n---\n' },
    { mtimes: { [`${P}/STATE.md`]: 4242 } },
  );
  const snap = await readProjectSnapshot(ROOT, { ...ISOLATED, fs: mem });
  assert.deepEqual(snap.paused, { file: 'STATE.md', at: 4242 });
  assert.equal(snap.position?.step, undefined, 'paused short-circuits the status token');
  assert.equal(snap.project?.name, 'proj', 'falls back to the directory name');
});

test('paused_at: None is not a pause', async () => {
  const mem = new MemFs({ [`${P}/STATE.md`]: '---\ncurrent_phase: 1\nstatus: executing\npaused_at: None\n---\n' });
  const snap = await readProjectSnapshot(ROOT, { ...ISOLATED, fs: mem });
  assert.equal(snap.paused, undefined);
  assert.equal(snap.position?.step, 'execute');
});

test('an unstattable STATE.md still parses', async () => {
  const mem = new MemFs({ [`${P}/STATE.md`]: '---\ncurrent_phase: 1\n---\n' }, { failStat: [`${P}/STATE.md`] });
  const snap = await readProjectSnapshot(ROOT, { ...ISOLATED, fs: mem });
  assert.equal(snap.position?.phase?.number, '1');
});

test('body-only position parsing (no frontmatter at all)', async () => {
  const mem = new MemFs({
    [`${P}/STATE.md`]: ['# State', '', '## Current Position', '', 'Phase: 7 — Coordinate & Scale (not started)', 'Plan: —', 'Status: Ready to plan', '', '## Other'].join('\n'),
    [`${P}/ROADMAP.md`]: '# Roadmap Title\n',
  });
  const snap = await readProjectSnapshot(ROOT, { ...ISOLATED, fs: mem });
  assert.deepEqual(snap.position?.phase, { number: '7', slug: 'Coordinate & Scale', status: 'not_started' });
  assert.equal(snap.position?.plan, undefined);
  assert.equal(snap.position?.step, 'plan');
  assert.equal(snap.project?.name, 'Roadmap Title', 'ROADMAP h1 when PROJECT.md is absent');
});

test('parenthesised slug spelling and an uppercase trailing status token', async () => {
  const mem = new MemFs({
    [`${P}/STATE.md`]: '## Current Position\n\nPhase: 02 (execution-worktree) — EXECUTING\nPlan: 2 of 18\n',
  });
  const snap = await readProjectSnapshot(ROOT, { ...ISOLATED, fs: mem });
  assert.equal(snap.position?.phase?.number, '02');
  assert.equal(snap.position?.phase?.slug, 'execution-worktree');
  assert.deepEqual(snap.position?.plan, { id: '02-02', index: 2, total: 18 });
});

test('a Phase: line that is not numeric is ignored', async () => {
  const mem = new MemFs({ [`${P}/STATE.md`]: '## Current Position\n\nPhase: TBD\nStatus: planning\n' });
  const snap = await readProjectSnapshot(ROOT, { ...ISOLATED, fs: mem });
  assert.equal(snap.position?.phase, undefined);
  assert.equal(snap.position?.step, 'plan');
});

test('config.json with no recognised keys is dropped entirely', async () => {
  const mem = new MemFs({ [`${P}/PROJECT.md`]: '# P\n', [`${P}/config.json`]: '{"workflow":{"verifier":true}}' });
  assert.equal((await readProjectSnapshot(ROOT, { ...ISOLATED, fs: mem })).config, undefined);
});

test('config.json that is an array is ignored', async () => {
  const mem = new MemFs({ [`${P}/PROJECT.md`]: '# P\n', [`${P}/config.json`]: '[1,2]' });
  assert.equal((await readProjectSnapshot(ROOT, { ...ISOLATED, fs: mem })).config, undefined);
});

test('state.json with no updated_at, bad phases and no next', async () => {
  const mem = new MemFs({
    [`${P}/PROJECT.md`]: '# P\n',
    [`${P}/STATE.md`]: '---\ncurrent_phase: 1\n---\n',
    [`${P}/phases/01-a/01-01-PLAN.md`]: 'x',
    [`${P}/state.json`]: JSON.stringify({ contract: '1.0.0', phases: ['nope', {}, { number: '9', status: 'complete' }, { number: '1', status: 'weird' }], next: {} }),
  });
  const snap = await readProjectSnapshot(ROOT, { ...ISOLATED, fs: mem });
  assert.ok(snap.diagnostics?.[0]?.includes('updated_at=invalid'));
  assert.equal(snap.phases[0]?.status, 'planned');
  assert.equal(snap.next?.source, 'rules');
});

test('fresh state.json: in_progress does not clobber a filesystem verifying', async () => {
  const mem = new MemFs(
    {
      [`${P}/PROJECT.md`]: '# P\n',
      [`${P}/STATE.md`]: '---\ncurrent_phase: 1\n---\n',
      [`${P}/phases/01-a/01-01-PLAN.md`]: 'x',
      [`${P}/phases/01-a/01-01-SUMMARY.md`]: 'x',
      [`${P}/state.json`]: JSON.stringify({ contract: '1.0.0', phases: [{ number: '1', status: 'in_progress' }], updated_at: new Date(3000).toISOString() }),
    },
    { mtimes: { [`${P}/STATE.md`]: 1000 } },
  );
  const snap = await readProjectSnapshot(ROOT, { ...ISOLATED, fs: mem });
  assert.equal(snap.phases[0]?.status, 'verifying');
});

test('gsdVersion from <root>/.claude/gsd-core/VERSION then the config roots', async () => {
  const projectLocal = new MemFs({ [`${P}/PROJECT.md`]: '# P\n', [`${ROOT}/.claude/gsd-core/VERSION`]: '1.13.2\n' });
  assert.equal((await readProjectSnapshot(ROOT, { ...ISOLATED, fs: projectLocal })).gsdVersion, '1.13.2');

  const global = new MemFs({ [`${P}/PROJECT.md`]: '# P\n', ['/cfg/gsd-core/VERSION']: '1.14.0\n' });
  assert.equal((await readProjectSnapshot(ROOT, { fs: global, home: '/h', env: { CLAUDE_CONFIG_DIR: '/cfg' } })).gsdVersion, '1.14.0');

  const home = new MemFs({ [`${P}/PROJECT.md`]: '# P\n', ['/h/.claude-gsd/gsd-core/VERSION']: '1.9.1\n' });
  assert.equal((await readProjectSnapshot(ROOT, { fs: home, home: '/h', env: {} })).gsdVersion, '1.9.1');

  const empty = new MemFs({ [`${P}/PROJECT.md`]: '# P\n', ['/h/.claude/gsd-core/VERSION']: '   \n' });
  assert.equal((await readProjectSnapshot(ROOT, { fs: empty, home: '/h', env: {} })).gsdVersion, undefined);

  const dflt = new MemFs({ [`${P}/PROJECT.md`]: '# P\n' });
  assert.equal((await readProjectSnapshot(ROOT, { fs: dflt })).gsdVersion, undefined);
});

test('a blocker tagged with a phase that is not current does not block', async () => {
  const mem = new MemFs({
    [`${P}/STATE.md`]: '---\ncurrent_phase: 2\nstatus: executing\n---\n\n## Blockers\n\n- [Phase 1] stale advisory\n',
    [`${P}/phases/01-a/01-01-PLAN.md`]: 'x',
    [`${P}/phases/02-b/02-01-PLAN.md`]: 'x',
  });
  const snap = await readProjectSnapshot(ROOT, { ...ISOLATED, fs: mem });
  assert.deepEqual(
    snap.phases.map((p) => p.status),
    ['planned', 'planned'],
  );
  // the project is still blocked (GSD's own signal is `blockers` non-empty),
  // but no *phase* carries the status
  assert.equal(deriveGsdStatus(snap), 'blocked');
});

test('an untagged ## Blockers item blocks the current phase', async () => {
  const mem = new MemFs({
    [`${P}/STATE.md`]: '---\ncurrent_phase: 2\nstatus: executing\n---\n\n## Blockers\n\n- waiting on a vendor key\n',
    [`${P}/phases/02-b/02-01-PLAN.md`]: 'x',
  });
  const snap = await readProjectSnapshot(ROOT, { ...ISOLATED, fs: mem });
  assert.equal(snap.phases[0]?.status, 'blocked');
  assert.equal(deriveGsdStatus(snap), 'blocked');
});

test('concerns alone never block', async () => {
  const mem = new MemFs({
    [`${P}/STATE.md`]: [
      '---',
      'current_phase: 2',
      'status: executing',
      '---',
      '',
      '## Accumulated Context',
      '',
      '### Blockers/Concerns',
      '',
      '- [Phase 2] an advisory carried forward for three milestones',
      '',
    ].join('\n'),
    [`${P}/phases/02-b/02-01-PLAN.md`]: 'x',
  });
  const snap = await readProjectSnapshot(ROOT, { ...ISOLATED, fs: mem });
  assert.deepEqual(snap.blockers, []);
  assert.equal(snap.concerns?.length, 1);
  assert.equal(snap.phases[0]?.status, 'planned');
  assert.equal(deriveGsdStatus(snap), 'planning');
});

test('a STATE.md pointing at a phase with no directory', async () => {
  const mem = new MemFs({ [`${P}/STATE.md`]: '---\ncurrent_phase: 9\nstatus: blocked\n---\n' });
  const snap = await readProjectSnapshot(ROOT, { ...ISOLATED, fs: mem });
  assert.deepEqual(snap.position?.phase, { number: '9', slug: '', status: 'blocked' });
  assert.equal(deriveGsdStatus(snap), 'idle', 'no phase on disk to mark blocked');
});

test('phase ordering is numeric, not lexicographic', async () => {
  const files: Record<string, string> = { [`${P}/PROJECT.md`]: '# P\n' };
  for (const n of ['10-ten', '2-two', '2.1-two-one', '1-one']) files[`${P}/phases/${n}/PLAN.md`] = 'x';
  const snap = await readProjectSnapshot(ROOT, { ...ISOLATED, fs: new MemFs(files) });
  assert.deepEqual(
    snap.phases.map((p) => p.number),
    ['1', '2', '2.1', '10'],
  );
});

test('every tools invocation throwing → available:false, three diagnostics', async () => {
  clearGsdVersionCache();
  const tools = fakeTools(() => {
    throw new Error('EPIPE');
  });
  const snap = await readProjectSnapshot(join(SYN, 'uat-pass'), { ...ISOLATED, tools, toolsSource: 'dead' });
  assert.deepEqual(snap.tools, { available: false, source: 'dead' });
  assert.equal(snap.diagnostics?.length, 3);
  assert.ok(snap.diagnostics?.every((d) => d.includes('EPIPE')));
  assert.equal(snap.next?.source, 'rules');
});

test('VERIFICATION/UAT frontmatter that is unreadable or has no status key', async () => {
  const mem = new MemFs(
    {
      [`${P}/PROJECT.md`]: '# P\n',
      [`${P}/phases/01-a/01-01-PLAN.md`]: 'x',
      [`${P}/phases/01-a/01-01-SUMMARY.md`]: 'x',
      [`${P}/phases/01-a/01-VERIFICATION.md`]: '---\nphase: 01-a\nverified: 2026-01-01\n---\n\nstatus: passed (body only, must not match)\n',
      [`${P}/phases/01-a/01-UAT.md`]: 'no frontmatter at all',
      [`${P}/phases/02-b/PLAN.md`]: 'x',
      [`${P}/phases/02-b/SUMMARY.md`]: 'x',
      [`${P}/phases/02-b/VERIFICATION.md`]: 'unreadable',
      [`${P}/phases/02-b/UAT.md`]: 'unreadable',
    },
    { failReadFile: [`${P}/phases/02-b/VERIFICATION.md`, `${P}/phases/02-b/UAT.md`] },
  );
  const snap = await readProjectSnapshot(ROOT, { ...ISOLATED, fs: mem });
  assert.deepEqual(
    snap.phases.map((p) => [p.status, p.uat]),
    [
      ['verifying', 'pending'],
      ['verifying', 'pending'],
    ],
  );
});

test('two directories spelling the same phase number sort stably', async () => {
  const snap = await readProjectSnapshot(ROOT, {
    ...ISOLATED,
    fs: new MemFs({ [`${P}/PROJECT.md`]: '# P\n', [`${P}/phases/1-b/PLAN.md`]: 'x', [`${P}/phases/01-a/PLAN.md`]: 'x' }),
  });
  assert.deepEqual(
    snap.phases.map((p) => p.number),
    ['01', '1'],
  );
});

test('parseHumanStops: Needs Human table rows and Deferred Verification bullets, h2 or h3, placeholders ignored', () => {
  const doc = [
    '## Current Position',
    'Phase: 3',
    '## Needs Human',
    '| phase | status | action |',
    '|---|---|---|',
    '| 03 | needs_human | resolve blocker, then /gsd-autonomous --from 3 |',
    '### Deferred Verification',
    '- 02 verification_deferred_human',
    '- none',
    '## Blockers',
    '- None yet.',
  ].join('\n');
  assert.deepEqual(parseHumanStops(doc), [
    { marker: 'needs_human', text: '03 · needs_human · resolve blocker, then /gsd-autonomous --from 3' },
    { marker: 'deferred_verification', text: '02 verification_deferred_human' },
  ]);
  assert.deepEqual(parseHumanStops('## Needs Human\n\n(none)\n'), []);
  assert.deepEqual(parseHumanStops('## Needs Human\n| a | b |\n|---|---|\n'), []);
  assert.deepEqual(parseHumanStops('# nothing'), []);
  const snap: ProjectSnapshot = { root: '/r', planningDir: '/r/.planning', observedAt: 0, health: 'ok', phases: [{ number: '03', slug: 'x', status: 'executing', plans: 1, summaries: 0 }], blockers: [], humanStops: [{ marker: 'needs_human', text: '03' }] };
  assert.equal(deriveGsdStatus(snap), 'blocked');
  assert.deepEqual(diffSnapshots({ ...snap, humanStops: undefined }, snap), ['status', 'human']);
});

test('parseGsdConfig: the keys orchestration acts on, unknown values dropped, empty → undefined', () => {
  assert.equal(parseGsdConfig(undefined), undefined);
  assert.equal(parseGsdConfig({}), undefined);
  assert.equal(parseGsdConfig({ mode: 7, git: { branching_strategy: 'weird' } }), undefined);
  assert.deepEqual(
    parseGsdConfig({
      parallelization: true,
      model_profile: 'adaptive',
      commit_docs: false,
      mode: 'yolo',
      workflow: { use_worktrees: false, auto_advance: true, _auto_chain_active: false },
      git: { branching_strategy: 'phase', phase_branch_template: 'gsd/phase-{phase}-{slug}', allow_default_branch_commits: true },
    }),
    {
      parallelization: true,
      modelProfile: 'adaptive',
      commitDocs: false,
      mode: 'yolo',
      useWorktrees: false,
      autoAdvance: true,
      branchingStrategy: 'phase',
      phaseBranchTemplate: 'gsd/phase-{phase}-{slug}',
      allowDefaultBranchCommits: true,
    },
  );
  assert.deepEqual(parseGsdConfig({ git: { phase_branch_template: '   ' } }), undefined);
});

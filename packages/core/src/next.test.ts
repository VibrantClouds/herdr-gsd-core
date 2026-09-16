import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recommendNext, currentPhaseIndex, trimNumber } from './next';
import type { ProjectSnapshot, PhaseInfo } from './types';

function snap(phases: PhaseInfo[], extra: Partial<ProjectSnapshot> = {}): ProjectSnapshot {
  return { root: '/p', planningDir: '/p/.planning', observedAt: 0, health: 'ok', phases, blockers: [], ...extra };
}
const ph = (number: string, status: PhaseInfo['status'], plans = 0, summaries = 0, uat?: PhaseInfo['uat']): PhaseInfo => ({
  number,
  slug: `s${number}`,
  status,
  plans,
  summaries,
  ...(uat ? { uat } : {}),
});

test('no phases → discuss-phase (GSD\'s own recommendation for an initialised-but-empty project)', () => {
  // spike §7: smart-entry classifies this as `needs-first-phase` and recommends
  // /gsd:discuss-phase, not /gsd:new-project. rules.json follows GSD.
  assert.equal(recommendNext(snap([])), 'discuss-phase');
});

test('paused wins over everything', () => {
  assert.equal(recommendNext(snap([ph('01', 'executing', 2, 1)], { paused: { file: 'continue-here.md', at: 1 } })), 'resume-work');
});

test('not_started / discussed → plan-phase N', () => {
  assert.equal(recommendNext(snap([ph('01', 'not_started')])), 'plan-phase 1');
  assert.equal(recommendNext(snap([ph('02', 'discussed')])), 'plan-phase 2');
});

test('planned with no summaries → execute-phase N', () => {
  assert.equal(recommendNext(snap([ph('03', 'planned', 4, 0)])), 'execute-phase 3');
});

test('partially executed → execute-phase N', () => {
  assert.equal(recommendNext(snap([ph('03', 'executing', 4, 2)])), 'execute-phase 3');
});

test('summaries == plans, no UAT → verify-work N', () => {
  assert.equal(recommendNext(snap([ph('03', 'executing', 4, 4)])), 'verify-work 3');
  assert.equal(recommendNext(snap([ph('03', 'verifying', 4, 4)])), 'verify-work 3');
});

test('UAT fail → execute-phase N', () => {
  assert.equal(recommendNext(snap([ph('03', 'verifying', 4, 4, 'fail')])), 'execute-phase 3');
});

test('UAT pass → plan-phase N+1 or ship N', () => {
  assert.equal(recommendNext(snap([ph('03', 'verifying', 4, 4, 'pass'), ph('04', 'not_started')])), 'plan-phase 4');
  assert.equal(recommendNext(snap([ph('03', 'verifying', 4, 4, 'pass')])), 'ship 3');
});

test('phase complete → plan next or ship', () => {
  assert.equal(recommendNext(snap([ph('01', 'complete', 1, 1), ph('02', 'not_started')])), 'plan-phase 2');
  assert.equal(recommendNext(snap([ph('01', 'complete', 1, 1)])), 'ship 1');
});

test('blocked → execute-phase N', () => {
  assert.equal(recommendNext(snap([ph('01', 'blocked', 1, 0)])), 'execute-phase 1');
});

test('UAT pending is treated like absent (verify-work)', () => {
  assert.equal(recommendNext(snap([ph('03', 'verifying', 2, 2, 'pending')])), 'verify-work 3');
});

test('current phase follows STATE.md position when present', () => {
  const s = snap([ph('01', 'complete', 1, 1), ph('02', 'planned', 2, 0), ph('03', 'not_started')], {
    position: { phase: { number: '03', slug: 's03', status: 'not_started' } },
  });
  assert.equal(currentPhaseIndex(s), 2);
  assert.equal(recommendNext(s), 'plan-phase 3');
});

test('position pointing at unknown phase falls back to first open phase', () => {
  const s = snap([ph('01', 'complete', 1, 1), ph('02', 'planned', 2, 0)], {
    position: { phase: { number: '09', slug: 'x', status: 'planned' } },
  });
  assert.equal(currentPhaseIndex(s), 1);
});

test('all complete → last index, ship', () => {
  const s = snap([ph('01', 'complete', 1, 1), ph('02', 'complete', 1, 1)]);
  assert.equal(currentPhaseIndex(s), 1);
  assert.equal(recommendNext(s), 'ship 2');
});

test('unknown predicate throws', () => {
  assert.throws(() => recommendNext(snap([]), { rules: [{ when: 'nope', next: 'x' }] }), /unknown predicate/);
});

test('empty rule table → progress', () => {
  assert.equal(recommendNext(snap([]), { rules: [] }), 'progress');
});

test('trimNumber', () => {
  assert.equal(trimNumber('03'), '3');
  assert.equal(trimNumber('10'), '10');
  assert.equal(trimNumber('03.1'), '3.1');
  assert.equal(trimNumber('abc'), 'abc');
});

test('zero-padded and bare phase numbers match (STATE.md `4` vs phases/04-images)', () => {
  const s = snap([ph('04', 'planned', 2, 0)], { position: { phase: { number: '4', slug: 'images', status: 'planned' } } });
  assert.equal(currentPhaseIndex(s), 0);
  assert.equal(recommendNext(s), 'execute-phase 4');
});

test('STATE.md-declared step wins over file counts while the phase is open', () => {
  const pos = (step: 'plan' | 'execute' | 'verify', ph: PhaseInfo[]) => snap(ph, { position: { phase: { number: ph[0]!.number, slug: 's', status: ph[0]!.status }, step } });
  // plans exist but STATE.md still says planning → keep plan-phase
  assert.equal(recommendNext(pos('plan', [ph('04', 'planned', 10, 0)])), 'plan-phase 4');
  // executing with partial summaries and step verify → verify-work
  assert.equal(recommendNext(pos('verify', [ph('04', 'executing', 3, 2)])), 'verify-work 4');
  // step execute with no summaries → execute-phase (same as file heuristic)
  assert.equal(recommendNext(pos('execute', [ph('04', 'planned', 3, 0)])), 'execute-phase 4');
  // step execute but all summaries done → falls through to verify-work
  assert.equal(recommendNext(pos('execute', [ph('04', 'executing', 3, 3)])), 'verify-work 4');
  // UAT fail still wins over step
  assert.equal(recommendNext(pos('plan', [ph('04', 'verifying', 3, 3, 'fail')])), 'execute-phase 4');
  // UAT pass ignores step verify
  assert.equal(recommendNext(pos('verify', [ph('04', 'verifying', 3, 3, 'pass')])), 'ship 4');
  // closed phase ignores step
  assert.equal(recommendNext(pos('plan', [ph('04', 'complete', 3, 3), ph('05', 'not_started')])), 'plan-phase 5');
  assert.equal(recommendNext(pos('plan', [ph('04', 'blocked', 3, 0)])), 'execute-phase 4');
  // position pointing elsewhere than current → step ignored
  assert.equal(recommendNext(snap([ph('04', 'planned', 2, 0)], { position: { phase: { number: '09', slug: 'x', status: 'planned' }, step: 'plan' } })), 'execute-phase 4');
  assert.equal(recommendNext(snap([ph('04', 'planned', 2, 0)], { position: { step: 'plan' } })), 'execute-phase 4');
});

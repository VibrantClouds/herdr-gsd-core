import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workspaceTokens, paneTokens, tokenDelta, statusFromSnapshot, paneTitle, shortSlug, healthError } from './projection';
import type { ProjectSnapshot, PhaseInfo } from '@herdr-gsd/core';

const ph = (number: string, status: PhaseInfo['status'], plans = 1, summaries = 0): PhaseInfo => ({ number, slug: `slug-${number}`, status, plans, summaries });
const snap = (over: Partial<ProjectSnapshot> = {}): ProjectSnapshot => ({
  root: '/p',
  planningDir: '/p/.planning',
  observedAt: 0,
  health: 'ok',
  phases: [],
  blockers: [],
  ...over,
});

test('workspace tokens: full position', () => {
  const s = snap({
    project: { name: 'myproj' },
    phases: [ph('01', 'complete', 2, 2), ph('03', 'executing', 4, 1)],
    position: { phase: { number: '03', slug: 'auth-flow', status: 'executing' }, plan: { id: '03-02', index: 2, total: 4 }, wave: 1, step: 'execute' },
  });
  assert.deepEqual(workspaceTokens(s, 'execute-phase 3'), {
    gsd_phase: '03 auth flow',
    gsd_phase_num: '03',
    gsd_phase_name: 'auth flow',
    gsd_step: 'execute 2/4 w1',
    gsd_status: 'executing',
    gsd_next: 'execute-phase 3',
    gsd_err: null,
  });
  assert.equal(paneTitle(s), 'GSD · myproj · 03 auth flow');
});

test('workspace tokens: no planning → all cleared except err', () => {
  assert.deepEqual(workspaceTokens(snap({ health: 'no_planning' }), 'x', 'gsd-tools missing'), {
    gsd_phase: null,
    gsd_phase_num: null,
    gsd_phase_name: null,
    gsd_step: null,
    gsd_status: null,
    gsd_next: null,
    gsd_err: 'gsd-tools missing',
  });
});

test('workspace tokens: empty phases, health errors, plan without step', () => {
  const t = workspaceTokens(snap({ health: 'locked' }), undefined);
  assert.equal(t.gsd_phase, 'none');
  assert.equal(t.gsd_err, 'STATE.md locked');
  assert.equal(t.gsd_next, null);
  assert.equal(workspaceTokens(snap({ health: 'parse_error', phases: [ph('01', 'planned')] }), 'x').gsd_phase, '—');
  assert.equal(workspaceTokens(snap({ health: 'tools_missing' }), 'x').gsd_err, 'gsd-tools missing');
  assert.equal(healthError(snap({ health: 'no_planning' })), null);
  const p = workspaceTokens(snap({ position: { plan: { id: 'x', index: 1, total: 3 } } }), 'x');
  assert.equal(p.gsd_step, 'plan 1/3');
  const q = workspaceTokens(snap({ position: { step: 'plan' } }), 'x'.repeat(100));
  assert.equal(q.gsd_step, 'plan');
  assert.equal(q.gsd_next?.length, 80);
  assert.equal(workspaceTokens(snap({ health: 'ok' }), 'x', 'soft').gsd_err, 'soft');
});

test('statusFromSnapshot', () => {
  assert.equal(statusFromSnapshot(snap({ health: 'no_planning' })), 'idle');
  assert.equal(statusFromSnapshot(snap({ paused: { file: 'continue-here.md', at: 1 } })), 'paused');
  assert.equal(statusFromSnapshot(snap({ phases: [ph('01', 'complete')] })), 'complete');
  assert.equal(statusFromSnapshot(snap({ phases: [ph('01', 'executing')], blockers: ['x'] })), 'blocked');
  assert.equal(statusFromSnapshot(snap({ phases: [ph('01', 'blocked')], position: { phase: { number: '01', slug: 's', status: 'blocked' } } })), 'blocked');
  const pos = (status: PhaseInfo['status']) => snap({ phases: [ph('01', status), ph('02', 'not_started')], position: { phase: { number: '01', slug: 's', status } } });
  assert.equal(statusFromSnapshot(pos('executing')), 'executing');
  assert.equal(statusFromSnapshot(pos('verifying')), 'verifying');
  assert.equal(statusFromSnapshot(pos('planned')), 'planning');
  assert.equal(statusFromSnapshot(pos('discussed')), 'planning');
  assert.equal(statusFromSnapshot(pos('not_started')), 'planning');
  assert.equal(statusFromSnapshot(pos('complete')), 'planning');
  assert.equal(statusFromSnapshot(snap({ position: { phase: { number: '09', slug: 's', status: 'executing' } } })), 'executing');
  assert.equal(statusFromSnapshot(snap({ position: { step: 'execute' } })), 'executing');
  assert.equal(statusFromSnapshot(snap({ position: { step: 'verify' } })), 'verifying');
  assert.equal(statusFromSnapshot(snap()), 'idle');
  // declared step overrides file-count status for open phases
  const withStep = (status: PhaseInfo['status'], step: 'execute' | 'verify' | 'plan') =>
    snap({ phases: [ph('07', status, 3, 0)], position: { phase: { number: '07', slug: 's', status }, step } });
  assert.equal(statusFromSnapshot(withStep('planned', 'execute')), 'executing');
  assert.equal(statusFromSnapshot(withStep('planned', 'verify')), 'verifying');
  assert.equal(statusFromSnapshot(withStep('planned', 'plan')), 'planning');
  assert.equal(statusFromSnapshot(withStep('executing', 'plan')), 'executing');
});

test('pane tokens and delta', () => {
  assert.deepEqual(paneTokens(undefined), { gsd_agent: null, gsd_workers: null, gsd_ctx: null });
  assert.deepEqual(paneTokens(undefined, 62), { gsd_agent: null, gsd_workers: null, gsd_ctx: '62%' });
  assert.deepEqual(paneTokens({ agent: 'executor', workers: 2, sessionEnded: false }, 40), { gsd_agent: 'executor', gsd_workers: '2 active', gsd_ctx: '40%' });
  assert.deepEqual(paneTokens({ workers: 0, sessionEnded: true }), { gsd_agent: null, gsd_workers: null, gsd_ctx: null });
  const a: Record<string, string | null> = { x: '1', y: null, z: 'same' };
  const b: Record<string, string | null> = { x: '2', y: 'now', z: 'same' };
  assert.deepEqual(tokenDelta(a, b), { x: '2', y: 'now' });
  assert.deepEqual(tokenDelta(undefined, b), b);
  assert.deepEqual(tokenDelta(b, b), {});
});

test('shortSlug and title without phase', () => {
  assert.equal(shortSlug('auth-flow_and-more'), 'auth flow and more');
  assert.equal(shortSlug('a'.repeat(80)).length, 60);
  assert.equal(shortSlug('a'.repeat(40), 24).length, 24);
  assert.equal(paneTitle(snap()), 'GSD · project');
});

test('shortSlug: directory slugs de-slug, human phase names keep their hyphens', () => {
  // `current_phase_name` is prose and may carry a meaningful hyphen —
  // InternalDeveloperPlatform's phase 54 is "Production-Only Onboarding"
  assert.equal(shortSlug('Production-Only Onboarding'), 'Production-Only Onboarding');
  assert.equal(shortSlug('Engine Wired Into Live Line CRUD — Lever, Pin and Snapshot (Backend)'), 'Engine Wired Into Live Line CRUD — Lever, Pin and Snapshot …');
  // a real directory slug still collapses
  assert.equal(shortSlug('40-engine-wired-into-live'), '40 engine wired into live');
  assert.equal(shortSlug('execution_worktree_runner'), 'execution worktree runner');
  assert.equal(shortSlug(''), '');
});

test('reviewing renders as its own status and step', () => {
  const s = snap({
    phases: [ph('03', 'reviewing', 4, 4)],
    position: { phase: { number: '03', slug: 'auth', status: 'reviewing' }, plan: { id: '03-04', index: 4, total: 4 }, step: 'review' },
  });
  assert.equal(statusFromSnapshot(s), 'reviewing');
  assert.equal(workspaceTokens(s, undefined).gsd_step, 'review 4/4');
  assert.equal(workspaceTokens(s, undefined).gsd_status, 'reviewing');
});

test('a review with critical findings wants a human', () => {
  const withReview = (critical: number): ProjectSnapshot =>
    snap({
      phases: [{ ...ph('03', 'reviewing', 4, 4), review: { status: 'issues_found', critical, warning: 2, info: 0 } }],
      position: { phase: { number: '03', slug: 'auth', status: 'reviewing' }, step: 'review' },
    });
  assert.equal(statusFromSnapshot(withReview(0)), 'reviewing');
  assert.equal(statusFromSnapshot(withReview(1)), 'blocked');
});

test('all phase dirs complete is not milestone complete while STATE.md has moved on', () => {
  // GPS.CommercialCRM: phases 37-40 all complete on disk, STATE.md on phase 41,
  // whose directory GSD has not created yet
  const movedOn = snap({
    phases: [ph('39', 'complete', 5, 5), ph('40', 'complete', 10, 10)],
    position: { phase: { number: '41', slug: 'Recurring Line Class', status: 'not_started' }, step: 'plan' },
  });
  assert.equal(statusFromSnapshot(movedOn), 'planning');

  // the same project once STATE.md agrees the phase is done
  const done = snap({
    phases: [ph('39', 'complete', 5, 5), ph('40', 'complete', 10, 10)],
    position: { phase: { number: '40', slug: 'engine', status: 'complete' }, step: 'ship' },
  });
  assert.equal(statusFromSnapshot(done), 'complete');

  // a shipped milestone declares no current phase at all
  assert.equal(statusFromSnapshot(snap({ phases: [ph('08', 'complete', 3, 3)] })), 'complete');
});

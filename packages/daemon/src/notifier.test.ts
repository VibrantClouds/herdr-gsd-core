import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Notifier, describeChange, clampTitle, clampBody, type PendingChange, type NotificationPayload } from './notifier';
import { DEFAULT_CONFIG, type ProjectSnapshot, type PhaseInfo } from '@herdr-gsd/core';

const ph = (number: string, status: PhaseInfo['status'], uat?: PhaseInfo['uat']): PhaseInfo => ({ number, slug: 's', status, plans: 1, summaries: 1, ...(uat ? { uat } : {}) });
const snap = (over: Partial<ProjectSnapshot> = {}): ProjectSnapshot => ({ root: '/p', planningDir: '/p/.planning', observedAt: 0, health: 'ok', phases: [], blockers: [], ...over });
const cfg = () => ({ ...DEFAULT_CONFIG.notify });

/** immediate timers so tests don't wait */
const instant = ((fn: () => void) => {
  const t = setTimeout(fn, 0);
  return t;
}) as unknown as typeof setTimeout;

function change(before: ProjectSnapshot | undefined, after: ProjectSnapshot, keys: PendingChange['keys'], next?: string): PendingChange {
  return { root: '/p', project: 'proj', keys, before, after, next };
}

test('describeChange categories', () => {
  const c = cfg();
  const exec = snap({ phases: [ph('03', 'executing')], position: { phase: { number: '03', slug: 's', status: 'executing' } } });
  const ver = snap({ phases: [ph('03', 'verifying')], position: { phase: { number: '03', slug: 's', status: 'verifying' } } });
  assert.deepEqual(describeChange(change(exec, ver, ['status']), c), { headline: 'phase 03 executing → 03 verifying', category: 'phase_boundary' });
  assert.deepEqual(describeChange(change(undefined, ver, ['phase']), c), { headline: 'phase 03 verifying', category: 'phase_boundary' });
  assert.equal(describeChange(change(ver, ver, ['status']), c), undefined);
  assert.equal(describeChange(change(exec, ver, ['status']), { ...c, phase_boundary: false }), undefined);
  const paused = snap({ ...ver, paused: { file: 'continue-here.md', at: 1 } });
  assert.deepEqual(describeChange(change(ver, paused, ['paused']), c), { headline: 'phase 03 paused (continue-here)', category: 'paused' });
  assert.equal(describeChange(change(paused, paused, ['paused']), c), undefined);
  const uat = snap({ ...ver, phases: [ph('03', 'verifying', 'pass')] });
  assert.deepEqual(describeChange(change(ver, uat, ['uat']), c), { headline: 'phase 03 UAT pass', category: 'uat_ready' });
  assert.equal(describeChange(change(uat, uat, ['uat']), c), undefined);
  assert.equal(describeChange(change(ver, uat, ['uat']), { ...c, uat_ready: false }), undefined);
  const drift = snap({ drift: { stateVsDisk: true } });
  assert.deepEqual(describeChange(change(undefined, drift, ['health']), { ...c, drift: true }), { headline: 'project STATE.md drift detected', category: 'drift' });
  assert.equal(describeChange(change(undefined, drift, ['health']), c), undefined);
  assert.equal(describeChange(change(undefined, snap(), ['blockers']), c), undefined);
  assert.equal(describeChange(change(undefined, snap({ position: { phase: { number: '01', slug: 's', status: 'planned' } } }), ['phase']), c)?.headline, 'phase 01 planned');
});

test('coalesces changes per root into one notification with next hint', async () => {
  const shown: NotificationPayload[] = [];
  const n = new Notifier({ config: cfg(), show: async (p) => (shown.push(p), { shown: true }), setTimeoutFn: instant });
  const a = snap({ position: { phase: { number: '03', slug: 's', status: 'planned' } } });
  const b = snap({ position: { phase: { number: '03', slug: 's', status: 'executing' } } });
  const c = snap({ position: { phase: { number: '03', slug: 's', status: 'verifying' } } });
  n.push(change(a, b, ['status'], 'execute-phase 3'));
  n.push(change(b, c, ['status'], 'verify-work 3'));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(shown.length, 1);
  assert.equal(shown[0]?.title, 'GSD · proj: phase 03 planned → 03 verifying');
  assert.equal(shown[0]?.body, 'next: verify-work 3');
  assert.equal(shown[0]?.sound, 'done');
  assert.equal(n.stats.shown, 1);
});

test('rate_limited → retry once; busy retry fails → dropped; other reason dropped; throw dropped', async () => {
  const results: Array<{ shown: boolean; reason?: string } | Error> = [
    { shown: false, reason: 'rate_limited' },
    { shown: true },
    { shown: false, reason: 'busy' },
    { shown: false, reason: 'busy' },
    { shown: false, reason: 'disabled' },
    new Error('socket gone'),
  ];
  const n = new Notifier({
    config: cfg(),
    show: async () => {
      const r = results.shift()!;
      if (r instanceof Error) throw r;
      return r;
    },
    setTimeoutFn: instant,
    log: () => undefined,
  });
  const a = snap({ position: { phase: { number: '01', slug: 's', status: 'planned' } } });
  const b = snap({ position: { phase: { number: '01', slug: 's', status: 'executing' } } });
  for (let i = 0; i < 4; i++) {
    n.push(change(a, b, ['status']));
    await n.flush();
  }
  assert.deepEqual(n.stats, { shown: 1, suppressed: 0, dropped: 3, retried: 2 });
});

test('quiet_when_focused suppresses; disabled when config off', async () => {
  let calls = 0;
  const n = new Notifier({ config: cfg(), show: async () => (calls++, { shown: true }), isFocused: () => true, setTimeoutFn: instant, log: () => undefined });
  const a = snap({ position: { phase: { number: '01', slug: 's', status: 'planned' } } });
  const b = snap({ position: { phase: { number: '01', slug: 's', status: 'executing' } } });
  n.push(change(a, b, ['status']));
  await n.flush();
  assert.equal(calls, 0);
  assert.equal(n.stats.suppressed, 1);
  const n2 = new Notifier({ config: { ...cfg(), quiet_when_focused: false }, show: async () => (calls++, { shown: true }), isFocused: () => true, setTimeoutFn: instant });
  n2.push(change(a, b, ['status']));
  await n2.flush();
  assert.equal(calls, 1);
});

test('blocked notification gated on config and completeness', async () => {
  const shown: NotificationPayload[] = [];
  const n = new Notifier({ config: cfg(), show: async (p) => (shown.push(p), { shown: true }) });
  await n.blocked('/p', 'proj', snap({ phases: [ph('01', 'complete')] }));
  assert.equal(shown.length, 0);
  await n.blocked('/p', 'proj', snap({ phases: [ph('02', 'executing')], position: { phase: { number: '02', slug: 's', status: 'executing' } } }), 'execute-phase 2');
  assert.equal(shown.length, 1);
  assert.equal(shown[0]?.title, 'GSD · proj · phase 02: waiting for you');
  assert.equal(shown[0]?.body, 'next: execute-phase 2');
  assert.equal(shown[0]?.sound, 'request');
  await n.blocked('/p', 'proj', snap({ phases: [ph('02', 'executing')] }));
  assert.equal(shown[1]?.body, 'agent is blocked');
  const quiet = new Notifier({ config: { ...cfg(), sound: 'none' }, show: async (p) => (shown.push(p), { shown: true }) });
  await quiet.blocked('/p', 'proj', snap({ phases: [ph('02', 'executing')] }));
  assert.equal(shown[2]?.sound, 'none');
  const off = new Notifier({ config: { ...cfg(), blocked: false }, show: async (p) => (shown.push(p), { shown: true }) });
  await off.blocked('/p', 'proj', snap({ phases: [ph('02', 'executing')] }));
  assert.equal(shown.length, 3);
});

test('clamps', () => {
  assert.equal(clampTitle('x'.repeat(100)).length, 80);
  assert.equal(clampBody('x'.repeat(300)).length, 240);
  assert.equal(clampTitle('ok'), 'ok');
});

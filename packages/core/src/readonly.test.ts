import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GSD_TOOLS_READONLY, ReadOnlyViolationError, assertReadOnly } from './readonly';

/** Every args array `planning.ts` can build. Kept in sync by the test below. */
export const PLANNING_INVOCATIONS: string[][] = [
  ['state-snapshot', '--project-dir', '/tmp/p'],
  ['smart-entry', '--json', '--project-dir', '/tmp/p'],
  ['runtime-identity'],
];

test('the §2.6 list is pinned verbatim', () => {
  assert.deepEqual(
    [...GSD_TOOLS_READONLY],
    [
      'state get',
      'state load',
      'state json',
      'state-snapshot',
      'phases list',
      'progress',
      'history-digest',
      'phase-plan-index',
      'roadmap get-phase',
      'stats',
      'smart-entry --json',
      'runtime-identity',
      'config-path',
      'config-get',
      'state',
      'find-phase',
    ],
  );
});

test('every invocation planning.ts makes passes assertReadOnly', () => {
  for (const args of PLANNING_INVOCATIONS) assert.ok(assertReadOnly(args));
});

test('accepts each pinned entry, with and without global flags', () => {
  const samples: Array<[string[], string]> = [
    [['state', 'get'], 'state get'],
    [['state', 'get', 'Current Position'], 'state get'],
    [['state', 'load'], 'state load'],
    [['state', 'json'], 'state json'],
    [['state'], 'state'],
    [['state-snapshot'], 'state-snapshot'],
    [['phases', 'list'], 'phases list'],
    [['progress'], 'progress'],
    [['history-digest'], 'history-digest'],
    [['phase-plan-index', '2'], 'phase-plan-index'],
    [['roadmap', 'get-phase', '2'], 'roadmap get-phase'],
    [['stats'], 'stats'],
    [['smart-entry', '--json'], 'smart-entry --json'],
    [['runtime-identity'], 'runtime-identity'],
    [['config-path'], 'config-path'],
    [['config-get', 'workflow.verifier'], 'config-get'],
    [['find-phase', 'auth'], 'find-phase'],
  ];
  for (const [args, expected] of samples) {
    assert.equal(assertReadOnly(args), expected, args.join(' '));
    assert.equal(assertReadOnly([...args, '--raw', '--json-errors', '--exit-contract=v2', '--cwd', '/x', '--ws', 'w', '--pick', 'a.b', '--project-dir', '/y']), expected);
  }
});

test('state planned-phase — the command that damaged a real project — is refused', () => {
  assert.throws(() => assertReadOnly(['state', 'planned-phase', '--phase', '2']), ReadOnlyViolationError);
  assert.throws(() => assertReadOnly(['state', 'planned-phase']), ReadOnlyViolationError);
});

test('refuses every other known write', () => {
  const writes = [
    ['state', 'advance-plan'],
    ['state', 'begin-phase'],
    ['state', 'complete-phase'],
    ['state', 'patch'],
    ['phase', 'add'],
    ['phase', 'complete'],
    ['milestone', 'complete'],
    ['config-set', 'a', 'b'],
    ['commit'],
    ['scaffold'],
    ['graphify', 'build'],
    ['worktree', 'create'],
  ];
  for (const w of writes) assert.throws(() => assertReadOnly(w), ReadOnlyViolationError, w.join(' '));
});

test('refuses empty args, unknown flags and bare smart-entry', () => {
  assert.throws(() => assertReadOnly([]), ReadOnlyViolationError);
  assert.throws(() => assertReadOnly(['--raw']), ReadOnlyViolationError);
  assert.throws(() => assertReadOnly(['progress', '--force']), ReadOnlyViolationError);
  assert.throws(() => assertReadOnly(['smart-entry']), ReadOnlyViolationError);
  assert.throws(() => assertReadOnly(['smart-entry', '--json', 'extra']), ReadOnlyViolationError);
});

test('a no-arg entry may not carry a positional tail', () => {
  assert.throws(() => assertReadOnly(['progress', 'reset']), ReadOnlyViolationError);
  assert.throws(() => assertReadOnly(['phases', 'list', 'all']), ReadOnlyViolationError);
});

test('error carries the offending args', () => {
  try {
    assertReadOnly(['state', 'planned-phase']);
    assert.fail('expected throw');
  } catch (e) {
    assert.ok(e instanceof ReadOnlyViolationError);
    assert.deepEqual(e.args, ['state', 'planned-phase']);
    assert.match(e.message, /state planned-phase/);
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ActivityEvent, ProjectSnapshot } from '@herdr-gsd/core';
import type { ProjectDetail } from '@herdr-gsd/daemon';
import { renderFrame, stripAnsi, truncateToWidth, visibleWidth, type DashboardState } from './render';

const NOW = Date.UTC(2026, 8, 15, 12, 1, 5);

function snapshot(over: Partial<ProjectSnapshot> = {}): ProjectSnapshot {
  return {
    root: '/home/u/myproj',
    planningDir: '/home/u/myproj/.planning',
    observedAt: NOW - 1000,
    health: 'ok',
    project: { name: 'myproj' },
    position: { phase: { number: '03', slug: 'auth', status: 'executing' }, plan: { id: '03-02', index: 2, total: 4 }, wave: 1, step: 'execute' },
    phases: [
      { number: '01', slug: 'core', status: 'complete', plans: 2, summaries: 2 },
      { number: '02', slug: 'db', status: 'complete', plans: 3, summaries: 3 },
      { number: '03', slug: 'auth', status: 'executing', plans: 4, summaries: 1 },
      { number: '04', slug: 'api', status: 'not_started', plans: 0, summaries: 0 },
      { number: '05', slug: 'ship', status: 'not_started', plans: 0, summaries: 0 },
    ],
    blockers: [],
    ...over,
  };
}

function ev(over: Partial<ActivityEvent> & { ts: number }): ActivityEvent {
  return { v: 1, harness: 'claude-code', cwd: '/home/u/myproj', kind: 'tool.pre', ...over };
}

function detail(over: Partial<ProjectDetail> = {}): ProjectDetail {
  return {
    root: '/home/u/myproj',
    snapshot: snapshot(),
    next: 'verify-work 3',
    status: 'executing',
    activity: { agent: 'gsd-executor', workers: 1, tool: 'Bash', sessionEnded: false },
    recent: [
      ev({ ts: NOW - 120_000, agent: 'gsd-planner', kind: 'subagent.stop', tool: undefined }),
      ev({ ts: NOW - 24_000, agent: 'gsd-executor', tool: 'Bash', detail: 'pnpm test' }),
      ev({ ts: NOW - 2_000, agent: 'gsd-executor', tool: 'Edit', detail: 'src/auth/session.ts' }),
    ],
    bindings: [],
    tokens: { workspace: {} },
    ...over,
  };
}

function state(over: Partial<DashboardState> = {}): DashboardState {
  return { connected: true, projects: [detail()], selected: 0, lastUpdateAt: NOW - 2000, now: NOW, ...over };
}

function check(rows: string[], size: { cols: number; rows: number }): void {
  assert.equal(rows.length, size.rows, `expected ${size.rows} rows, got ${rows.length}`);
  for (const [i, r] of rows.entries()) assert.ok(visibleWidth(r) <= size.cols, `row ${i} is ${visibleWidth(r)} > ${size.cols}: ${JSON.stringify(stripAnsi(r))}`);
}

test('width helpers ignore ANSI and treat status glyphs as one cell', () => {
  assert.equal(visibleWidth('abc'), 3);
  assert.equal(visibleWidth('\u001b[32mabc\u001b[0m'), 3);
  for (const g of ['✓', '▶', '·', '✗', '⋯', '↻', '…']) assert.equal(visibleWidth(g), 1, `${g} should be width 1`);
  assert.equal(visibleWidth('03 auth ▶'), 9);
  assert.equal(truncateToWidth('abcdef', 4), 'abc…');
  assert.equal(visibleWidth(truncateToWidth('abcdef', 4)), 4);
  assert.equal(truncateToWidth('abc', 10), 'abc');
  assert.equal(visibleWidth(truncateToWidth('\u001b[1mabcdefghij\u001b[0m', 5)), 5);
});

test('80x24 single executing project renders the spec layout', () => {
  const size = { cols: 80, rows: 24 };
  const rows = renderFrame(state(), size, { colors: false });
  check(rows, size);
  assert.match(rows[0]!, /^ GSD · myproj · Phase 03 auth · executing \(plan 2\/4, wave 1\)/);
  assert.match(rows[0]!, /↻ 2s ago$/);
  assert.match(rows[1]!, /^ ─+$/);
  assert.match(rows[2]!, /^ Phases {3}01 core ✓ {3}02 db ✓ {3}03 auth ▶ {3}04 api · {3}05 ship ·$/);
  assert.match(rows[3]!, /^ Plans {4}03-01 ✓ {2}03-02 ▶ executor \(Bash\) {2}03-03 · {2}03-04 ·$/);
  assert.match(rows[4]!, /^ Blockers {1}none$/);
  assert.match(rows[5]!, /^ Next {5}verify-work 3 {3}\[enter\] send to driver {3}\[o\] new pane {3}\[w\] worktree$/);
  assert.match(rows[6]!, /^ Activity \d\d:\d\d:\d\d executor {2}Edit src\/auth\/session\.ts$/);
  // newest first
  assert.match(rows[7]!, /Bash pnpm test$/);
  assert.match(rows[8]!, /planner {3}subagent\.stop$/);
  assert.equal(rows[23], ' Keys  q quit · r rescan · n notify · o run · w worktree · a auto · x stop');
  // remaining space between activity and the footer is blank
  assert.equal(rows[10], '');
});

test('colours keep every row within the terminal width', () => {
  const size = { cols: 80, rows: 24 };
  const rows = renderFrame(state(), size, { colors: true });
  check(rows, size);
  assert.ok(rows.some((r) => r.includes('\u001b[')), 'expected ANSI output');
  assert.match(stripAnsi(rows[0]!), /^ GSD · myproj/);
});

test('blockers, no next command, and no activity degrade politely', () => {
  const size = { cols: 80, rows: 24 };
  const d = detail({ snapshot: snapshot({ blockers: ['UAT 03 failing', 'missing migration'] }), next: undefined, recent: [], activity: undefined });
  const rows = renderFrame(state({ projects: [d] }), size, { colors: false });
  check(rows, size);
  assert.match(rows[4]!, /^ Blockers UAT 03 failing · missing migration$/);
  assert.match(rows[5]!, /^ Next {5}\(nothing recommended\)$/);
  assert.match(rows[6]!, /^ Activity \(no events\)$/);
  assert.match(rows[3]!, /03-02 ▶ {2}/, 'plan row has no agent annotation without an activity view');
});

test('multiple projects show the selector and honour `selected`', () => {
  const size = { cols: 80, rows: 24 };
  const b = detail({ root: '/home/u/other', snapshot: snapshot({ root: '/home/u/other', project: { name: 'other' } }), status: 'planning' });
  const c = detail({ root: '/home/u/third', snapshot: snapshot({ root: '/home/u/third', project: { name: 'third' } }) });
  const rows = renderFrame(state({ projects: [detail(), b, c], selected: 1 }), size, { colors: false });
  check(rows, size);
  assert.match(rows[0]!, /^ GSD · other · /);
  assert.equal(rows[2], ' [tab] project 2/3');
  const single = renderFrame(state(), size, { colors: false });
  assert.ok(!single.some((r) => r.includes('[tab] project')), 'no selector for a single project');
});

test('disconnected renders a centered retry panel with the footer', () => {
  const size = { cols: 80, rows: 24 };
  const rows = renderFrame(state({ connected: false, projects: [], lastUpdateAt: undefined }), size, { colors: false });
  check(rows, size);
  const panel = rows.find((r) => r.includes('gsdd not running'));
  assert.ok(panel, 'expected the retry panel');
  assert.match(panel!, /│ +gsdd not running — retrying… +│/);
  assert.ok(panel!.startsWith('     '), 'panel is horizontally centered');
  assert.match(rows[23]!, /^ Keys  q quit/);
});

test('connected with zero projects shows the empty panel', () => {
  const size = { cols: 80, rows: 24 };
  const rows = renderFrame(state({ projects: [] }), size, { colors: false });
  check(rows, size);
  assert.ok(rows.some((r) => r.includes('no GSD projects found')));
});

test('60x12 drops Activity first, then Plans', () => {
  const size = { cols: 60, rows: 12 };
  const rows = renderFrame(state(), size, { colors: false });
  check(rows, size);
  assert.ok(rows.some((r) => r.startsWith(' Phases')));
  assert.ok(rows.some((r) => r.startsWith(' Plans')));
  assert.ok(rows.some((r) => r.startsWith(' Blockers')));
  assert.ok(rows.some((r) => r.startsWith(' Next')));
  // phases wrap at 60 cols, so the sections above still fit and activity shrinks
  const activity = rows.filter((r) => r.startsWith(' Activity') || /^ {10}\d\d:\d\d:\d\d/.test(r));
  assert.ok(activity.length >= 1, 'a little activity still fits at 60x12');

  const tiny = { cols: 60, rows: 8 };
  const tinyRows = renderFrame(state(), tiny, { colors: false });
  check(tinyRows, tiny);
  assert.ok(!tinyRows.some((r) => r.startsWith(' Activity')), 'Activity is dropped first');
  assert.ok(tinyRows.some((r) => r.startsWith(' Next')));

  const tinier = { cols: 60, rows: 6 };
  const tinierRows = renderFrame(state(), tinier, { colors: false });
  check(tinierRows, tinier);
  assert.ok(!tinierRows.some((r) => r.startsWith(' Plans')), 'Plans is dropped second');
  assert.ok(tinierRows.some((r) => r.startsWith(' Phases')));
  assert.ok(tinierRows.some((r) => r.startsWith(' Blockers')));
});

test('very long names and many phases wrap or truncate, never overflow', () => {
  const size = { cols: 60, rows: 24 };
  const phases = Array.from({ length: 14 }, (_, i) => ({
    number: String(i + 1).padStart(2, '0'),
    slug: `extremely-long-phase-slug-number-${i + 1}`,
    status: (i < 3 ? 'complete' : i === 3 ? 'executing' : 'not_started') as ProjectSnapshot['phases'][number]['status'],
    plans: 2,
    summaries: 1,
  }));
  const d = detail({
    snapshot: snapshot({
      project: { name: 'a-really-really-long-project-name-that-will-not-fit-anywhere' },
      position: { phase: { number: '04', slug: phases[3]!.slug, status: 'executing' }, plan: { id: '04-01', index: 1, total: 9 }, wave: 3 },
      phases,
      blockers: ['a blocker message that is far longer than the terminal is wide, by a lot'],
    }),
    next: 'execute-phase 4 --wave 3 --with-a-very-long-flag-list',
    recent: [ev({ ts: NOW - 1000, agent: 'gsd-executor', tool: 'Bash', detail: 'x'.repeat(200) })],
  });
  const rows = renderFrame(state({ projects: [d] }), size, { colors: false });
  check(rows, size);
  assert.ok(rows.some((r) => r.includes('…')), 'something was truncated');
  assert.ok(rows.filter((r) => r.startsWith(' Phases') || /^ {10}\d\d /.test(r)).length > 1, 'phases wrapped onto continuation rows');
});

test('confirm and error messages render just above the footer', () => {
  const size = { cols: 80, rows: 24 };
  const confirm = renderFrame(state({ confirmPending: { text: 'send /gsd-verify-work 3 to driver pane? y/N' } }), size, { colors: false });
  check(confirm, size);
  assert.equal(confirm[22], ' send /gsd-verify-work 3 to driver pane? y/N');
  assert.match(confirm[23]!, /^ Keys  q quit/);

  const err = renderFrame(state({ message: { text: 'agent_blocked: driver agent is blocked, not sent', kind: 'error' } }), size, { colors: false });
  check(err, size);
  assert.equal(err[22], ' agent_blocked: driver agent is blocked, not sent');
});

test('runs row shows the active run first with its waiting reason; keys line names the orchestrate keys', () => {
  const runs = [
    { v: 1, id: 'r0', project: '/home/u/myproj', repo: '/home/u/myproj', unit: 'phase', command: '/gsd-plan-phase 2', harness: 'claude-code', kind: 'claude', target: { workspaceId: 'w1', paneId: 'w1:p3', agentName: 'a', cwd: '/x' }, createdPane: true, startedAt: NOW - 90_000, updatedAt: NOW - 60_000, status: 'done', reason: 'harness is idle after /gsd-plan-phase 2', prompts: [], sawWorking: true, resumes: 0, warnings: [] },
    { v: 1, id: 'r1', project: '/home/u/myproj', repo: '/home/u/myproj', unit: 'phase-isolated', command: '/gsd-execute-phase 3', harness: 'claude-code', kind: 'claude', target: { workspaceId: 'w2', paneId: 'w2:p1', agentName: 'b', cwd: '/y', worktree: { path: '/y', branch: 'gsd/phase-03-auth', workspaceId: 'w2' } }, createdPane: true, startedAt: NOW - 30_000, updatedAt: NOW - 1000, status: 'waiting', waitingFor: 'agent_blocked', reason: 'agent is waiting for you in pane w2:p1', prompts: [], sawWorking: true, resumes: 0, warnings: [] },
  ] as unknown as NonNullable<ProjectDetail['runs']>;
  const rows = renderFrame({ connected: true, projects: [detail({ runs })], selected: 0, now: NOW }, { cols: 120, rows: 24 }, { colors: false });
  const runsRow = rows.find((r) => r.includes('Runs'))!;
  assert.ok(runsRow, rows.join('\n'));
  assert.ok(runsRow.includes('waiting/agent_blocked /gsd-execute-phase 3 → gsd/phase-03-auth · agent is waiting for you'), runsRow);
  const second = rows[rows.indexOf(runsRow) + 1]!;
  assert.ok(second.includes('done /gsd-plan-phase 2 → w1:p3'), second);
  assert.ok(rows.at(-1)!.includes('o run next · w worktree run · a autonomous · x stop'));
  for (const r of rows) assert.ok(visibleWidth(r) <= 120);
  // no runs → no row
  const bare = renderFrame({ connected: true, projects: [detail()], selected: 0, now: NOW }, { cols: 80, rows: 24 }, { colors: false });
  assert.ok(!bare.some((r) => r.startsWith(' Runs')));
});

test('complete phase marks every plan done and a blocked phase shows ✗', () => {
  const size = { cols: 80, rows: 24 };
  const d = detail({
    snapshot: snapshot({
      position: { phase: { number: '03', slug: 'auth', status: 'complete' }, plan: { id: '03-04', index: 4, total: 4 } },
      phases: [
        { number: '01', slug: 'core', status: 'complete', plans: 2, summaries: 2 },
        { number: '02', slug: 'db', status: 'blocked', plans: 3, summaries: 1 },
        { number: '03', slug: 'auth', status: 'verifying', plans: 4, summaries: 4 },
      ],
    }),
    status: 'complete',
  });
  const rows = renderFrame(state({ projects: [d] }), size, { colors: false });
  check(rows, size);
  assert.match(rows[2]!, /02 db ✗/);
  assert.match(rows[2]!, /03 auth ⋯/);
  assert.match(rows[3]!, /^ Plans {4}03-01 ✓ {2}03-02 ✓ {2}03-03 ✓ {2}03-04 ✓$/);
});

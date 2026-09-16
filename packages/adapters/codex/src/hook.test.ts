/**
 * M2 acceptance for the Codex adapter: every fixture payload from
 * test/fixtures/hooks/codex/ piped into the COMPILED hook via spawnSync.
 *
 * The fixtures are speculative (Claude-schema-by-analogy, docs/spikes/
 * M0-A-hooks.md §2), so these tests pin the DEFENSIVE behaviour — a missing
 * field must be omitted, never guessed — as much as the happy path.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { shortHash } from './emit';
import type { ActivityEvent } from './emit';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const HOOK = path.join(__dirname, 'hook.js');
const FIXTURES = path.join(REPO_ROOT, 'test', 'fixtures', 'hooks', 'codex');
const FIXTURE_CWD = '/home/user/myproj';

function tmpSpool(): string {
  return mkdtempSync(path.join(os.tmpdir(), 'herdr-gsd-cx-spool-'));
}

function fixture(name: string): string {
  return readFileSync(path.join(FIXTURES, name), 'utf8');
}

interface RunOut {
  status: number | null;
  ms: number;
  lines: ActivityEvent[];
  raw: string;
}

function runHook(kind: string | undefined, stdin: string, spool: string, env: NodeJS.ProcessEnv = {}, cwd = FIXTURE_CWD): RunOut {
  const args = [HOOK];
  if (kind !== undefined) args.push(kind);
  args.push('--spool', spool);
  const started = Date.now();
  const r = spawnSync(process.execPath, args, {
    input: stdin,
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '', HOME: os.tmpdir(), ...env },
  });
  const ms = Date.now() - started;
  const file = path.join(spool, `${shortHash(cwd)}.jsonl`);
  const raw = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const lines = raw
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as ActivityEvent);
  return { status: r.status, ms, lines, raw };
}

test('compiled hook script exists (run `npm run build` first)', () => {
  assert.ok(existsSync(HOOK), `${HOOK} missing`);
});

test('the shipped hook is a single self-contained file (spec §12.5)', () => {
  const src = readFileSync(HOOK, 'utf8');
  assert.equal(src.match(/require\("\.\//g), null, 'no relative require may survive bundling');
  for (const m of src.matchAll(/require\(([^)]*)\)/g)) {
    const arg = (m[1] ?? '').trim();
    assert.ok(/^"node:[a-z_]+"$/.test(arg) || arg === '', `only node: builtins may be required, found ${arg}`);
  }
  assert.ok(src.includes('setTimeout'), 'the 2 s self-timeout is present');
});

const CASES: ReadonlyArray<{ file: string; kind: string; kinds: string[]; tool?: string; detail?: string; agent?: string }> = [
  { file: 'SessionStart.json', kind: 'session-start', kinds: ['session.start'] },
  { file: 'SubagentStart.json', kind: 'subagent-start', kinds: ['subagent.start'], agent: 'gsd-executor' },
  { file: 'SubagentStop.json', kind: 'subagent-stop', kinds: ['subagent.stop'], agent: 'gsd-executor' },
  { file: 'Stop.json', kind: 'stop', kinds: ['session.stop'] },
  { file: 'PreCompact.json', kind: 'compact-pre', kinds: ['compact.pre'] },
  { file: 'PostToolUse.json', kind: 'tool-post', kinds: ['tool.post'], tool: 'shell', detail: 'npm test' },
  { file: 'PreToolUse.bash-bearer-secret.json', kind: 'tool-pre', kinds: ['tool.pre'], tool: 'shell', detail: 'curl -H ***' },
];

for (const c of CASES) {
  test(`${c.file} → ${c.kinds.join(' + ')}`, () => {
    const spool = tmpSpool();
    const out = runHook(c.kind, fixture(c.file), spool, { HERDR_PANE_ID: 'w2:p3' });
    assert.equal(out.status, 0, 'hook must exit 0');
    assert.equal(out.lines.length, c.kinds.length, out.raw);
    assert.deepEqual(
      out.lines.map((l) => l.kind),
      c.kinds,
    );
    const first = out.lines[0];
    assert.ok(first);
    assert.equal(first.v, 1);
    assert.equal(first.harness, 'codex');
    assert.equal(first.cwd, FIXTURE_CWD);
    assert.equal(first.sessionId, 'codex-sess-0001');
    assert.equal(first.paneId, 'w2:p3');
    assert.equal(typeof first.panePid, 'number');
    if (c.tool !== undefined) assert.equal(first.tool, c.tool);
    if (c.detail !== undefined) assert.equal(first.detail, c.detail);
    if (c.agent !== undefined) assert.equal(first.agent, c.agent);
  });
}

test('every codex fixture is covered by a case', () => {
  const files = readdirSync(FIXTURES).filter((f) => f.endsWith('.json'));
  const covered = new Set(CASES.map((c) => c.file));
  for (const f of files) assert.ok(covered.has(f), `uncovered fixture ${f}`);
});

test('an Agent tool call also opens an inferred subagent span', () => {
  const spool = tmpSpool();
  const payload = JSON.stringify({
    session_id: 'codex-sess-0001',
    cwd: FIXTURE_CWD,
    hook_event_name: 'PreToolUse',
    tool_name: 'Agent',
    tool_input: { subagent_type: 'gsd-verifier' },
  });
  const out = runHook('tool-pre', payload, spool);
  assert.deepEqual(
    out.lines.map((l) => l.kind),
    ['tool.pre', 'subagent.start'],
  );
  assert.equal(out.lines[1]?.agent, 'gsd-verifier');
});

test('speculative fields are read defensively: missing fields are omitted, not guessed', () => {
  const spool = tmpSpool();
  const out = runHook('session-start', JSON.stringify({ hook_event_name: 'SessionStart' }), spool, {}, process.cwd());
  assert.equal(out.status, 0);
  assert.equal(out.lines.length, 1, out.raw);
  const ev = out.lines[0];
  assert.equal(ev?.sessionId, undefined);
  assert.equal(ev?.tool, undefined);
  assert.equal(ev?.detail, undefined);
  assert.equal(ev?.cwd, process.cwd(), 'cwd falls back to the process cwd');
  assert.ok(!out.raw.includes('sessionId'));
});

test('alternative Codex field spellings are accepted', () => {
  const spool = tmpSpool();
  const payload = JSON.stringify({
    conversation_id: 'conv-1',
    workspace_root: FIXTURE_CWD,
    hook_event_name: 'PostToolUse',
    tool: 'shell',
    args: { command: 'npm test' },
  });
  const out = runHook(undefined, payload, spool);
  assert.equal(out.lines.length, 1, out.raw);
  assert.equal(out.lines[0]?.sessionId, 'conv-1');
  assert.equal(out.lines[0]?.tool, 'shell');
  assert.equal(out.lines[0]?.detail, 'npm test');
});

test('garbage, empty and non-object stdin yield exit 0 and no spool line', () => {
  for (const bad of ['', '   ', 'nope', '[]', '{"a":']) {
    const spool = tmpSpool();
    const out = runHook('session-start', bad, spool);
    assert.equal(out.status, 0);
    assert.equal(readdirSync(spool).length, 0);
  }
});

test('unwritable spool dir yields exit 0', () => {
  const spool = path.join(tmpSpool(), 'ro');
  mkdirSync(spool);
  chmodSync(spool, 0o500);
  try {
    const out = runHook('session-start', fixture('SessionStart.json'), spool);
    assert.equal(out.status, 0);
    assert.equal(out.lines.length, 0);
  } finally {
    chmodSync(spool, 0o700);
  }
});

test('hook completes well under the 200 ms p99 budget (20 runs, CI threshold 500 ms)', () => {
  const spool = tmpSpool();
  const payload = fixture('PostToolUse.json');
  const times: number[] = [];
  for (let i = 0; i < 20; i++) times.push(runHook('tool-post', payload, spool).ms);
  times.sort((a, b) => a - b);
  const p99 = times[times.length - 1] ?? 0;
  assert.ok(p99 < 500, `p99 ${p99} ms (all: ${times.join(',')})`);
});

test('redaction: no fragment of the fake secret reaches the spool', () => {
  const spool = tmpSpool();
  const out = runHook('tool-pre', fixture('PreToolUse.bash-bearer-secret.json'), spool);
  assert.ok(out.raw.length > 0);
  for (const frag of ['sk-FAKE123', 'FAKE123', 'Bearer sk-']) assert.ok(!out.raw.includes(frag), `leaked ${frag}`);
  assert.ok(out.raw.includes('***'));
});

test('tool output is never spooled', () => {
  const spool = tmpSpool();
  const out = runHook('tool-post', fixture('PostToolUse.json'), spool);
  assert.ok(!out.raw.includes('tool_response'));
  assert.ok(!out.raw.includes('exit_code'));
});

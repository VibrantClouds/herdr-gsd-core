/**
 * M2 acceptance: every recorded Claude Code hook payload (test/fixtures/hooks/
 * claude-code/) piped into the COMPILED hook via spawnSync.
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
const FIXTURES = path.join(REPO_ROOT, 'test', 'fixtures', 'hooks', 'claude-code');
/** cwd carried by every claude-code fixture. */
const FIXTURE_CWD = '/home/user/myproj';

function tmpSpool(): string {
  return mkdtempSync(path.join(os.tmpdir(), 'herdr-gsd-cc-spool-'));
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

function runHook(kind: string | undefined, stdin: string, spool: string, env: NodeJS.ProcessEnv = {}): RunOut {
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
  const file = path.join(spool, `${shortHash(FIXTURE_CWD)}.jsonl`);
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
  { file: 'PostToolUse.json', kind: 'tool-post', kinds: ['tool.post'], tool: 'Edit', detail: 'src/auth/login.ts' },
  { file: 'PreToolUse.bash-bearer-secret.json', kind: 'tool-pre', kinds: ['tool.pre'], tool: 'Bash', detail: 'curl -H ***' },
  {
    file: 'PreToolUse.bash-apikey-env-prefix.json',
    kind: 'tool-pre',
    kinds: ['tool.pre'],
    tool: 'Bash',
    detail: 'API_KEY=*** curl https://api.example.com/v1/upload',
  },
  {
    file: 'PreToolUse.agent-spawn.json',
    kind: 'tool-pre',
    kinds: ['tool.pre', 'subagent.start'],
    tool: 'Agent',
    detail: 'gsd-executor',
    agent: 'gsd-executor',
  },
];

for (const c of CASES) {
  test(`${c.file} → ${c.kinds.join(' + ')}`, () => {
    const spool = tmpSpool();
    const out = runHook(c.kind, fixture(c.file), spool, { HERDR_PANE_ID: 'w3:p1' });
    assert.equal(out.status, 0, 'hook must exit 0');
    assert.equal(out.lines.length, c.kinds.length, out.raw);
    assert.deepEqual(
      out.lines.map((l) => l.kind),
      c.kinds,
    );
    const first = out.lines[0];
    assert.ok(first);
    assert.equal(first.v, 1);
    assert.equal(first.harness, 'claude-code');
    assert.equal(first.cwd, FIXTURE_CWD);
    assert.equal(first.sessionId, 'a1b2c3d4-0001-4a11-8f00-000000000001');
    assert.equal(first.paneId, 'w3:p1', 'paneId comes from inherited HERDR_PANE_ID');
    assert.equal(typeof first.panePid, 'number');
    assert.ok(typeof first.ts === 'number' && first.ts > 0);
    if (c.tool !== undefined) assert.equal(first.tool, c.tool);
    if (c.detail !== undefined) assert.equal(first.detail, c.detail);
    if (c.agent !== undefined) assert.equal(first.agent, c.agent);
    assert.ok(Buffer.byteLength(out.raw.split('\n')[0] ?? '') <= 4096, 'line under 4 KiB');
  });
}

test('every claude-code fixture is covered by a case or is an unregistered event', () => {
  const files = readdirSync(FIXTURES).filter((f) => f.endsWith('.json'));
  const covered = new Set(CASES.map((c) => c.file));
  const unregistered = new Set(['Notification.json', 'UserPromptSubmit.json']);
  for (const f of files) assert.ok(covered.has(f) || unregistered.has(f), `uncovered fixture ${f}`);
});

test('unregistered events (no argv kind, unmapped hook_event_name) spool nothing, exit 0', () => {
  for (const f of ['Notification.json', 'UserPromptSubmit.json']) {
    const spool = tmpSpool();
    const out = runHook(undefined, fixture(f), spool);
    assert.equal(out.status, 0);
    assert.equal(out.lines.length, 0);
  }
});

test('hook_event_name is used when argv kind is absent', () => {
  const spool = tmpSpool();
  const out = runHook(undefined, fixture('SessionStart.json'), spool);
  assert.equal(out.status, 0);
  assert.equal(out.lines[0]?.kind, 'session.start');
});

test('paneId is omitted when HERDR_PANE_ID is unset', () => {
  const spool = tmpSpool();
  const out = runHook('session-start', fixture('SessionStart.json'), spool);
  assert.equal(out.status, 0);
  assert.equal(out.lines[0]?.paneId, undefined);
  assert.ok(!out.raw.includes('paneId'));
});

test('HERDR_GSD_SPOOL_DIR is used when --spool is absent', () => {
  const spool = tmpSpool();
  const r = spawnSync(process.execPath, [HOOK, 'session-start'], {
    input: fixture('SessionStart.json'),
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '', HOME: os.tmpdir(), HERDR_GSD_SPOOL_DIR: spool },
  });
  assert.equal(r.status, 0);
  const file = path.join(spool, `${shortHash(FIXTURE_CWD)}.jsonl`);
  assert.ok(existsSync(file), 'spool file created under HERDR_GSD_SPOOL_DIR');
});

test('spool dir is created recursively when missing', () => {
  const spool = path.join(tmpSpool(), 'a', 'b', 'c');
  const out = runHook('session-start', fixture('SessionStart.json'), spool);
  assert.equal(out.status, 0);
  assert.equal(out.lines.length, 1);
});

test('garbage, empty and non-object stdin yield exit 0 and no spool line', () => {
  const bads = ['', '   ', 'not json at all', '[1,2,3]', '{"unterminated": ', String.fromCharCode(0, 1, 2)];
  for (const bad of bads) {
    const spool = tmpSpool();
    const out = runHook('session-start', bad, spool);
    assert.equal(out.status, 0, `exit 0 for ${JSON.stringify(bad)}`);
    assert.equal(out.lines.length, 0);
    assert.equal(readdirSync(spool).length, 0, 'nothing written at all');
  }
});

test('unwritable spool dir yields exit 0, harness unaffected', () => {
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
  const payload = fixture('PreToolUse.bash-bearer-secret.json');
  const times: number[] = [];
  for (let i = 0; i < 20; i++) times.push(runHook('tool-pre', payload, spool).ms);
  times.sort((a, b) => a - b);
  const p99 = times[times.length - 1] ?? 0;
  assert.ok(p99 < 500, `p99 ${p99} ms (all: ${times.join(',')})`);
});

test('redaction: no fragment of the fake secrets ever reaches the spool', () => {
  const fragments = ['sk-FAKE123', 'sk-FAKE456', 'FAKE123', 'FAKE456', 'Bearer sk-'];
  for (const f of ['PreToolUse.bash-bearer-secret.json', 'PreToolUse.bash-apikey-env-prefix.json']) {
    const spool = tmpSpool();
    const out = runHook('tool-pre', fixture(f), spool);
    assert.equal(out.status, 0);
    assert.ok(out.raw.length > 0);
    for (const frag of fragments) assert.ok(!out.raw.includes(frag), `${f}: leaked ${frag} in ${out.raw}`);
    assert.ok(out.raw.includes('***'), `${f}: expected a redaction marker`);
  }
});

test('tool stdin/stdout is never spooled', () => {
  const spool = tmpSpool();
  const out = runHook('tool-post', fixture('PostToolUse.json'), spool);
  assert.ok(!out.raw.includes('tool_response'));
  assert.ok(!out.raw.includes('validate(token)'), 'new_string content must not leak');
  assert.ok(!out.raw.includes('last_assistant_message'));
});

test('an oversize payload still yields one line under 4 KiB', () => {
  const spool = tmpSpool();
  const payload = JSON.stringify({
    session_id: 's',
    cwd: FIXTURE_CWD,
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command: `echo ${'x'.repeat(50000)}` },
  });
  const out = runHook('tool-pre', payload, spool);
  assert.equal(out.status, 0);
  assert.equal(out.lines.length, 1);
  assert.ok(Buffer.byteLength(out.raw) <= 4097);
  assert.ok((out.lines[0]?.detail ?? '').length <= 200);
});

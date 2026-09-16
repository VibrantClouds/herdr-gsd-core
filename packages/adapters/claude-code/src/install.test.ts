/**
 * M2 acceptance: `adapter install claude-code` adds only managed entries and
 * `adapter uninstall` restores the file BYTE-IDENTICALLY, tested on a fixture
 * settings.json that already contains unrelated hooks.
 *
 * Every test writes under a fresh mkdtemp dir — never the real ~/.claude.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  EVENTS,
  HOOK_TIMEOUT_SECONDS,
  OWNER_MARKER,
  POST_TOOL_MATCHER,
  PRE_TOOL_MATCHER,
  applyInstall,
  applyUninstall,
  desiredEntries,
  doctor,
  hookCommand,
  hookScriptPath,
  install,
  settingsPath,
  uninstall,
} from './install';
import type { AdapterOptions } from './install';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const FIXTURE = path.join(REPO_ROOT, 'test', 'fixtures', 'adapters', 'claude-settings.with-unrelated-hooks.json');
const PLUGIN_ROOT = REPO_ROOT;

function tmp(prefix = 'herdr-gsd-cc-inst-'): string {
  return mkdtempSync(path.join(os.tmpdir(), prefix));
}

function localOpts(dir: string, spoolDir = path.join(dir, 'spool')): AdapterOptions {
  return { scope: 'local', dir, pluginRoot: PLUGIN_ROOT, spoolDir, env: { PATH: process.env.PATH ?? '' }, home: dir };
}

function seedLocal(text = readFileSync(FIXTURE, 'utf8')): { dir: string; file: string; original: string; opts: AdapterOptions } {
  const dir = tmp();
  const file = path.join(dir, '.claude', 'settings.json');
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
  return { dir, file, original: text, opts: localOpts(dir) };
}

interface Settings {
  hooks?: Record<string, Array<{ matcher?: string; hooks: Array<{ type: string; command: string; timeout?: number }> }>>;
  [k: string]: unknown;
}

test('path resolution: local, global, and CLAUDE_CONFIG_DIR', () => {
  assert.equal(settingsPath(localOpts('/p')), path.join('/p', '.claude', 'settings.json'));
  assert.equal(
    settingsPath({ scope: 'global', pluginRoot: PLUGIN_ROOT, spoolDir: '/s', env: {}, home: '/h' }),
    path.join('/h', '.claude', 'settings.json'),
  );
  assert.equal(
    settingsPath({ scope: 'global', pluginRoot: PLUGIN_ROOT, spoolDir: '/s', env: { CLAUDE_CONFIG_DIR: '/cfg' }, home: '/h' }),
    path.join('/cfg', 'settings.json'),
  );
  assert.throws(() => settingsPath({ scope: 'local', pluginRoot: PLUGIN_ROOT, spoolDir: '/s' }), /requires a project directory/);
});

test('hook command bakes the script path, the kind and the spool dir', () => {
  const cmd = hookCommand('/plug', 'tool-pre', '/var/spool dir');
  assert.equal(cmd, `node "${path.join('/plug', OWNER_MARKER)}" tool-pre --spool "/var/spool dir"`);
  assert.ok(cmd.includes(OWNER_MARKER), 'ownership marker present in every command');
});

test('all 7 events are registered with the spiked matchers and a 2 s timeout', () => {
  const entries = desiredEntries('/plug', '/spool');
  assert.equal(entries.length, 7);
  assert.deepEqual(
    entries.map((e) => e.event),
    ['SessionStart', 'SubagentStart', 'SubagentStop', 'PreToolUse', 'PostToolUse', 'Stop', 'PreCompact'],
  );
  assert.equal(entries.find((e) => e.event === 'PreToolUse')?.matcher, PRE_TOOL_MATCHER);
  assert.equal(entries.find((e) => e.event === 'PostToolUse')?.matcher, POST_TOOL_MATCHER);
  assert.equal(PRE_TOOL_MATCHER, 'Bash|Edit|Write|MultiEdit|Agent|Task');
  assert.equal(POST_TOOL_MATCHER, 'Agent|Task');
  for (const e of entries) assert.equal(e.timeout, HOOK_TIMEOUT_SECONDS);
  assert.equal(HOOK_TIMEOUT_SECONDS, 2, 'timeout is in SECONDS on this surface (spike §1.3)');
});

test('install adds exactly our entries and leaves unrelated hooks and keys untouched', () => {
  const { file, opts, original } = seedLocal();
  const res = install(opts);
  assert.equal(res.changed, true);
  assert.equal(res.file, file);
  assert.equal(res.entries, 7);

  const before = JSON.parse(original) as Settings;
  const after = JSON.parse(readFileSync(file, 'utf8')) as Settings;
  assert.equal(after.model, before.model);
  assert.deepEqual(after.permissions, before.permissions);
  assert.deepEqual(after.statusLine, before.statusLine);
  assert.deepEqual(Object.keys(after), Object.keys(before), 'no new top-level keys, order preserved');

  // unrelated entries survive, in place
  assert.deepEqual(after.hooks?.SessionStart?.[0], before.hooks?.SessionStart?.[0]);
  assert.deepEqual(after.hooks?.PreToolUse?.[0], before.hooks?.PreToolUse?.[0]);
  assert.deepEqual(after.hooks?.Notification, before.hooks?.Notification);

  // ours are appended
  const ours = Object.values(after.hooks ?? {})
    .flat()
    .flatMap((g) => g.hooks)
    .filter((h) => h.command.includes(OWNER_MARKER));
  assert.equal(ours.length, 7);
  for (const h of ours) {
    assert.equal(h.type, 'command');
    assert.equal(h.timeout, 2);
    assert.ok(h.command.startsWith('node "'));
    assert.ok(h.command.includes(`--spool "${opts.spoolDir}"`));
  }
  assert.equal(after.hooks?.SubagentStart?.length, 1, 'SubagentStart exists in 2.1.273 and is registered');
});

test('M2: install then uninstall is byte-identical on a settings.json with unrelated hooks', () => {
  const { file, opts, original } = seedLocal();
  install(opts);
  assert.notEqual(readFileSync(file, 'utf8'), original);
  const res = uninstall(opts);
  assert.equal(res.removed, 7);
  assert.equal(readFileSync(file, 'utf8'), original, 'uninstall must restore the file byte-for-byte');
});

test('install is idempotent: a second install is a no-op', () => {
  const { file, opts } = seedLocal();
  install(opts);
  const first = readFileSync(file, 'utf8');
  const second = install(opts);
  assert.equal(second.changed, false);
  assert.equal(readFileSync(file, 'utf8'), first);
  install(opts);
  assert.equal(readFileSync(file, 'utf8'), first);
});

test('re-install with a new spool dir replaces only our entries', () => {
  const { file, opts, original } = seedLocal();
  install(opts);
  const moved: AdapterOptions = { ...opts, spoolDir: '/new/spool' };
  install(moved);
  const after = JSON.parse(readFileSync(file, 'utf8')) as Settings;
  const ours = Object.values(after.hooks ?? {})
    .flat()
    .flatMap((g) => g.hooks)
    .filter((h) => h.command.includes(OWNER_MARKER));
  assert.equal(ours.length, 7, 'no duplicates after re-install');
  for (const h of ours) assert.ok(h.command.includes('--spool "/new/spool"'));
  uninstall(moved);
  assert.equal(readFileSync(file, 'utf8'), original);
});

test('install into a missing settings.json creates it; uninstall empties our table', () => {
  const dir = tmp();
  const opts = localOpts(dir);
  const res = install(opts);
  assert.equal(res.changed, true);
  assert.ok(existsSync(res.file));
  const parsed = JSON.parse(readFileSync(res.file, 'utf8')) as Settings;
  assert.equal(Object.keys(parsed).length, 1);
  assert.equal(Object.keys(parsed.hooks ?? {}).length, 7);
  uninstall(opts);
  assert.equal(readFileSync(res.file, 'utf8'), '{}\n', 'all containers we created are removed');
});

test('a one-time .bak is taken on first install only', () => {
  const { file, opts, original } = seedLocal();
  const first = install(opts);
  assert.equal(first.backup, `${file}.bak`);
  assert.equal(readFileSync(`${file}.bak`, 'utf8'), original);
  uninstall(opts);
  const second = install({ ...opts, spoolDir: '/other' });
  assert.equal(second.backup, undefined, 'the original backup is never overwritten');
  assert.equal(readFileSync(`${file}.bak`, 'utf8'), original);
});

test('formatting is preserved: 4-space indent, tab indent, and no trailing newline', () => {
  const src = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Settings;
  for (const [indent, trailing] of [
    ['    ', true],
    ['\t', true],
    ['  ', false],
  ] as ReadonlyArray<[string, boolean]>) {
    const text = JSON.stringify(src, null, indent) + (trailing ? '\n' : '');
    const { file, opts } = seedLocal(text);
    install(opts);
    const installed = readFileSync(file, 'utf8');
    assert.ok(installed.includes(`\n${indent}"model"`), `indent ${JSON.stringify(indent)} preserved`);
    assert.equal(installed.endsWith('\n'), trailing);
    uninstall(opts);
    assert.equal(readFileSync(file, 'utf8'), text);
  }
});

test('corrupt JSON is refused, never overwritten', () => {
  const broken = '{ "hooks": { "SessionStart": [ } }\n';
  const { file, opts } = seedLocal(broken);
  assert.throws(() => install(opts), /not valid JSON/);
  assert.equal(readFileSync(file, 'utf8'), broken);
  assert.throws(() => uninstall(opts), /not valid JSON/);
  assert.equal(readFileSync(file, 'utf8'), broken);
  const { file: f2, opts: o2 } = seedLocal('[1,2,3]\n');
  assert.throws(() => install(o2), /top level is not a JSON object/);
  assert.equal(readFileSync(f2, 'utf8'), '[1,2,3]\n');
});

test('applyInstall / applyUninstall are pure over file contents', () => {
  const original = readFileSync(FIXTURE, 'utf8');
  const installed = applyInstall(original, FIXTURE, '/plug', '/spool');
  assert.notEqual(installed, original);
  assert.equal(applyInstall(installed, FIXTURE, '/plug', '/spool'), installed, 'idempotent');
  const { text, removed } = applyUninstall(installed, FIXTURE);
  assert.equal(removed, 7);
  assert.equal(text, original);
  assert.equal(applyUninstall(original, FIXTURE).removed, 0);
});

test('a foreign entry that merely mentions another adapter is not ours', () => {
  const foreign = JSON.stringify(
    { hooks: { Stop: [{ hooks: [{ type: 'command', command: 'node /x/packages/adapters/codex/dist/hook.js stop' }] }] } },
    null,
    2,
  ) + '\n';
  const { file, opts } = seedLocal(foreign);
  install(opts);
  uninstall(opts);
  assert.equal(readFileSync(file, 'utf8'), foreign);
});

test('uninstall on an absent file is a safe no-op', () => {
  const res = uninstall(localOpts(tmp()));
  assert.equal(res.changed, false);
  assert.equal(res.removed, 0);
});

test('doctor reports missing config, then a healthy install', () => {
  const dir = tmp();
  const opts = localOpts(dir);
  const missing = doctor(opts);
  assert.equal(missing.ok, false);
  assert.ok(doctor({ ...opts, env: {} }).findings.some((f) => f.message.startsWith('node not found')));
  assert.ok(missing.findings.some((f) => f.level === 'error' && f.message.includes('settings file not found')));

  install(opts);
  const ok = doctor(opts);
  assert.equal(ok.ok, true, JSON.stringify(ok.findings));
  assert.ok(ok.findings.some((f) => f.message.includes('7 hook entries installed')));
  assert.ok(ok.findings.some((f) => f.message.includes('spool dir writable')));
  assert.ok(ok.findings.some((f) => f.message.startsWith('hook script present')));
  assert.ok(ok.findings.some((f) => f.message.startsWith('node on PATH')));
  assert.ok(existsSync(hookScriptPath(PLUGIN_ROOT)));
});

test('doctor flags a partial install and a stale plugin root', () => {
  const { file, opts } = seedLocal();
  install(opts);
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as Settings;
  delete parsed.hooks?.PreCompact;
  writeFileSync(file, `${JSON.stringify(parsed, null, 2)}\n`);
  const partial = doctor(opts);
  assert.ok(partial.findings.some((f) => f.level === 'warn' && f.message.includes('/7 hook entries installed')));

  const stale = doctor({ ...opts, pluginRoot: '/somewhere/else' });
  assert.ok(stale.findings.some((f) => f.level === 'warn' && f.message.includes('different plugin root')));
});

test('doctor reports a broken settings file without throwing', () => {
  const { opts } = seedLocal('{oops\n');
  const res = doctor(opts);
  assert.equal(res.ok, false);
  assert.ok(res.findings.some((f) => f.level === 'error' && f.message.includes('not valid JSON')));
});

test('EVENTS is the spiked event set', () => {
  assert.deepEqual(
    EVENTS.map((e) => e.kind),
    ['session-start', 'subagent-start', 'subagent-stop', 'tool-pre', 'tool-post', 'stop', 'compact-pre'],
  );
});

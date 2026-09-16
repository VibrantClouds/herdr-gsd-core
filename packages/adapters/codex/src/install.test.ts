/**
 * Codex installer tests: nested `{"hooks": {...}}` schema, idempotency,
 * byte-identical uninstall, `$CODEX_HOME` resolution, and the doctor warning
 * that only SessionStart has a live precedent on this surface.
 *
 * Every test writes under a fresh mkdtemp dir — never the real ~/.codex.
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
  PROVEN_EVENT,
  applyInstall,
  applyUninstall,
  desiredEntries,
  doctor,
  featuresFlagFinding,
  hookCommand,
  hooksFilePath,
  install,
  uninstall,
} from './install';
import type { AdapterOptions } from './install';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const FIXTURE = path.join(REPO_ROOT, 'test', 'fixtures', 'adapters', 'codex-hooks.with-unrelated-hooks.json');
const PLUGIN_ROOT = REPO_ROOT;

function tmp(): string {
  return mkdtempSync(path.join(os.tmpdir(), 'herdr-gsd-cx-inst-'));
}

function opts(dir: string, over: Partial<AdapterOptions> = {}): AdapterOptions {
  return {
    scope: 'global',
    pluginRoot: PLUGIN_ROOT,
    spoolDir: path.join(dir, 'spool'),
    env: { PATH: process.env.PATH ?? '', CODEX_HOME: path.join(dir, '.codex') },
    home: dir,
    ...over,
  };
}

function seed(dir: string, text = readFileSync(FIXTURE, 'utf8')): string {
  const file = path.join(dir, '.codex', 'hooks.json');
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
  return file;
}

interface HooksDoc {
  hooks?: Record<string, Array<{ matcher?: string; hooks: Array<{ type: string; command: string; timeout?: number; commandWindows?: string }> }>>;
  [k: string]: unknown;
}

test('path resolution: CODEX_HOME, ~/.codex, and --local', () => {
  assert.equal(hooksFilePath({ scope: 'global', pluginRoot: '/p', spoolDir: '/s', env: { CODEX_HOME: '/cx' }, home: '/h' }), path.join('/cx', 'hooks.json'));
  assert.equal(hooksFilePath({ scope: 'global', pluginRoot: '/p', spoolDir: '/s', env: {}, home: '/h' }), path.join('/h', '.codex', 'hooks.json'));
  assert.equal(hooksFilePath({ scope: 'local', dir: '/proj', pluginRoot: '/p', spoolDir: '/s', env: {} }), path.join('/proj', '.codex', 'hooks.json'));
  assert.throws(() => hooksFilePath({ scope: 'local', pluginRoot: '/p', spoolDir: '/s', env: {} }), /requires a project directory/);
});

test('the registered event set is the spiked one, with no matcher', () => {
  assert.deepEqual(
    EVENTS.map((e) => e.event),
    ['SessionStart', 'SubagentStart', 'Stop', 'PostToolUse'],
  );
  const entries = desiredEntries('/plug', '/spool');
  assert.equal(entries.length, 4);
  for (const e of entries) {
    assert.equal(e.matcher, undefined, 'Codex tool names are lowercase; a Claude-style matcher would never match');
    assert.equal(e.timeout, HOOK_TIMEOUT_SECONDS);
  }
  assert.equal(PROVEN_EVENT, 'SessionStart');
  assert.equal(hookCommand('/plug', 'session-start', '/spool'), `node "${path.join('/plug', OWNER_MARKER)}" session-start --spool "/spool"`);
});

test('install writes the NESTED {"hooks": {...}} schema Codex requires', () => {
  const dir = tmp();
  const file = seed(dir, '{}\n');
  const o = opts(dir);
  const res = install(o);
  assert.equal(res.changed, true);
  assert.equal(res.file, file);
  const doc = JSON.parse(readFileSync(file, 'utf8')) as HooksDoc;
  assert.deepEqual(Object.keys(doc), ['hooks'], 'no top-level event keys — Codex deny_unknown_fields rejects them');
  assert.deepEqual(Object.keys(doc.hooks ?? {}), ['SessionStart', 'SubagentStart', 'Stop', 'PostToolUse']);
  const group = doc.hooks?.SessionStart?.[0];
  assert.ok(group);
  assert.equal(group.matcher, undefined);
  assert.equal(group.hooks[0]?.type, 'command');
  assert.equal(group.hooks[0]?.timeout, 2);
  assert.ok(group.hooks[0]?.command.includes(OWNER_MARKER));
});

test('install warns that only SessionStart has a live precedent', () => {
  const dir = tmp();
  seed(dir, '{}\n');
  const res = install(opts(dir));
  assert.ok(res.warnings.some((w) => w.includes('only SessionStart has a live precedent')));
});

test('M2: install then uninstall is byte-identical alongside an unrelated GSD entry', () => {
  const dir = tmp();
  const file = seed(dir);
  const original = readFileSync(file, 'utf8');
  const o = opts(dir);
  install(o);
  const after = JSON.parse(readFileSync(file, 'utf8')) as HooksDoc;
  assert.equal(after.hooks?.SessionStart?.length, 2, 'the GSD entry and ours coexist');
  assert.ok(!(after.hooks?.SessionStart?.[0]?.hooks[0]?.command ?? '').includes(OWNER_MARKER), 'the GSD entry stays first');
  assert.ok((after.hooks?.SessionStart?.[1]?.hooks[0]?.command ?? '').includes(OWNER_MARKER), 'ours is appended');
  assert.equal(uninstall(o).removed, 4);
  assert.equal(readFileSync(file, 'utf8'), original, 'uninstall must restore the file byte-for-byte');
});

test('a foreign commandWindows field is preserved verbatim', () => {
  const dir = tmp();
  const file = seed(dir);
  install(opts(dir));
  const doc = JSON.parse(readFileSync(file, 'utf8')) as HooksDoc;
  const foreign = doc.hooks?.SessionStart?.[0]?.hooks[0] as Record<string, unknown> | undefined;
  assert.equal(foreign?.commandWindows, '"C:/Users/u/.codex/hooks/gsd-check-update.cmd"');
});

test('install is idempotent and never duplicates entries', () => {
  const dir = tmp();
  const file = seed(dir);
  const o = opts(dir);
  install(o);
  const first = readFileSync(file, 'utf8');
  assert.equal(install(o).changed, false);
  assert.equal(readFileSync(file, 'utf8'), first);
});

test('install creates ~/.codex/hooks.json when absent and uninstall empties it', () => {
  const dir = tmp();
  const o = opts(dir, { env: { PATH: process.env.PATH ?? '' } });
  const res = install(o);
  assert.equal(res.file, path.join(dir, '.codex', 'hooks.json'));
  assert.ok(existsSync(res.file));
  uninstall(o);
  assert.equal(readFileSync(res.file, 'utf8'), '{}\n');
});

test('a one-time .bak is taken on first install only', () => {
  const dir = tmp();
  const file = seed(dir);
  const original = readFileSync(file, 'utf8');
  const o = opts(dir);
  assert.equal(install(o).backup, `${file}.bak`);
  assert.equal(readFileSync(`${file}.bak`, 'utf8'), original);
  uninstall(o);
  assert.equal(install({ ...o, spoolDir: '/other' }).backup, undefined);
});

test('corrupt JSON is refused, never overwritten', () => {
  const dir = tmp();
  const broken = '{ "hooks": ohno }\n';
  const file = seed(dir, broken);
  assert.throws(() => install(opts(dir)), /not valid JSON/);
  assert.equal(readFileSync(file, 'utf8'), broken);
});

test('applyInstall / applyUninstall are pure and round-trip', () => {
  const original = readFileSync(FIXTURE, 'utf8');
  const installed = applyInstall(original, FIXTURE, '/plug', '/spool');
  assert.equal(applyInstall(installed, FIXTURE, '/plug', '/spool'), installed);
  const { text, removed } = applyUninstall(installed, FIXTURE);
  assert.equal(removed, 4);
  assert.equal(text, original);
});

test('doctor: missing file, then healthy, and it always carries the precedent warning', () => {
  const dir = tmp();
  const o = opts(dir);
  const missing = doctor(o);
  assert.equal(missing.ok, false);
  assert.ok(missing.findings.some((f) => f.level === 'error' && f.message.includes('hooks file not found')));
  assert.ok(missing.findings.some((f) => f.level === 'warn' && f.message.includes('only SessionStart has a live precedent')));

  seed(dir, '{}\n');
  install(o);
  const ok = doctor(o);
  assert.equal(ok.ok, true, JSON.stringify(ok.findings));
  assert.ok(ok.findings.some((f) => f.message.includes('4 hook entries installed')));
  assert.ok(ok.findings.some((f) => f.level === 'warn' && f.message.includes('only SessionStart has a live precedent')));
});

test('doctor flags a legacy top-level event key (Codex deny_unknown_fields)', () => {
  const dir = tmp();
  seed(dir, `${JSON.stringify({ SessionStart: [{ hooks: [{ type: 'command', command: '/bin/true' }] }] }, null, 2)}\n`);
  const res = doctor(opts(dir));
  assert.ok(res.findings.some((f) => f.level === 'warn' && f.message.includes('top-level event keys present')));
});

test('doctor reports the [features] hooks gate from config.toml', () => {
  const dir = tmp();
  seed(dir, '{}\n');
  const o = opts(dir);
  assert.equal(featuresFlagFinding(o).level, 'warn', 'no config.toml → warn');
  writeFileSync(path.join(dir, '.codex', 'config.toml'), '[features]\nhooks = false\n');
  assert.equal(featuresFlagFinding(o).level, 'warn');
  writeFileSync(path.join(dir, '.codex', 'config.toml'), '[features]\nhooks = true\n');
  assert.equal(featuresFlagFinding(o).level, 'ok');
  writeFileSync(path.join(dir, '.codex', 'config.toml'), '[features]\ncodex_hooks = true\n');
  assert.equal(featuresFlagFinding(o).level, 'ok', 'the legacy alias is accepted');
});

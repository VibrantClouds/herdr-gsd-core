import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as os from 'node:os';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { parseConfigToml, loadConfig, mergeConfig, DEFAULT_CONFIG, DEFAULT_CONFIG_TOML } from './config';

test('default TOML round-trips to defaults with no warnings', () => {
  const { config, warnings } = parseConfigToml(DEFAULT_CONFIG_TOML);
  assert.deepEqual(warnings, []);
  assert.deepEqual(config, DEFAULT_CONFIG);
});

test('empty file -> defaults', () => {
  assert.deepEqual(parseConfigToml('').config, DEFAULT_CONFIG);
});

test('overrides and custom harness tables', () => {
  const { config, warnings } = parseConfigToml(`
[notify]
sound = "request"
blocked = false
[views]
enabled = true
[harness.pi]
command = ["pi", "--yolo"]
[harness.claude-code]
command = ["claude", "--dangerously-skip-permissions"]
prompt_flag = ["-p"]
`);
  assert.deepEqual(warnings, []);
  assert.equal(config.notify.sound, 'request');
  assert.equal(config.notify.blocked, false);
  assert.equal(config.views.enabled, true);
  assert.deepEqual(config.harness.pi, { command: ['pi', '--yolo'], prompt_flag: [] });
  assert.deepEqual(config.harness['claude-code'], { command: ['claude', '--dangerously-skip-permissions'], prompt_flag: ['-p'] });
});

test('type mismatches and unknown keys warn but keep defaults', () => {
  const { config, warnings } = parseConfigToml(`
[notify]
sound = 7
blocked = "yes"
bogus = 1
[projects]
ignore = [1, 2]
[orchestration]
max_parallel = 0
isolation = "mars"
[log]
level = "loud"
[weird]
x = 1
[harness]
codex = "nope"
[harness.pi]
command = "pi"
`);
  assert.equal(config.notify.sound, 'done');
  assert.equal(config.notify.blocked, true);
  assert.deepEqual(config.projects.ignore, ['**/node_modules/**']);
  assert.equal(config.orchestration.max_parallel, 3);
  assert.equal(config.orchestration.isolation, 'worktree');
  assert.equal(config.log.level, 'info');
  const has = (s: string) => warnings.some((w) => w.includes(s));
  assert.ok(has('notify.sound'));
  assert.ok(has('notify.blocked'));
  assert.ok(has('unknown key notify.bogus'));
  assert.ok(has('projects.ignore'));
  assert.ok(has('max_parallel'));
  assert.ok(has('isolation'));
  assert.ok(has('log.level'));
  assert.ok(has('unknown key weird'));
  assert.ok(has('harness.codex should be a table'));
  assert.ok(has('harness.pi.command'));
});

test('parse error -> defaults + warning', () => {
  const { config, warnings } = parseConfigToml('[notify\nsound = ');
  assert.deepEqual(config, DEFAULT_CONFIG);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0]!, /parse error/);
});

test('mergeConfig rejects non-table document', () => {
  const { warnings } = mergeConfig(42);
  assert.match(warnings[0]!, /not a table/);
});

test('loadConfig missing file', async () => {
  const r = await loadConfig('/nope/config.toml');
  assert.equal(r.missing, true);
  assert.deepEqual(r.config, DEFAULT_CONFIG);
});

test('loadConfig existing file', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gsd-cfg-'));
  const f = path.join(dir, 'config.toml');
  await fs.writeFile(f, '[views]\nenabled = true\n');
  const r = await loadConfig(f);
  assert.equal(r.missing, false);
  assert.equal(r.config.views.enabled, true);
});

test('orchestration keys: nested autonomous table, dropped gsd-workspace isolation, harness must exist, numeric floors', () => {
  const { config, warnings } = parseConfigToml(`
[orchestration]
enabled = true
harness = "codex"
isolation = "gsd-workspace"
start_timeout_ms = 10
max_parallel = 0
split_direction = "left"
[orchestration.autonomous]
resume_on_exit = true
max_resumes = -1
`);
  assert.equal(config.orchestration.enabled, true);
  assert.equal(config.orchestration.harness, 'codex');
  assert.equal(config.orchestration.isolation, 'worktree');
  assert.equal(config.orchestration.start_timeout_ms, 60_000);
  assert.equal(config.orchestration.max_parallel, 3);
  assert.equal(config.orchestration.split_direction, 'right');
  assert.equal(config.orchestration.autonomous.resume_on_exit, true);
  assert.equal(config.orchestration.autonomous.max_resumes, 3);
  assert.ok(warnings.some((w) => w.includes('gsd-workspace')));
  assert.ok(warnings.some((w) => w.includes('start_timeout_ms')));
  assert.ok(warnings.some((w) => w.includes('max_parallel')));
  assert.ok(warnings.some((w) => w.includes('split_direction')));
  assert.ok(warnings.some((w) => w.includes('max_resumes')));
  const env = parseConfigToml('[harness.claude-code.env]\nCLAUDE_CONFIG_DIR = "/x"\n[harness.pi.env]\nA = 1\n');
  assert.deepEqual(env.config.harness['claude-code']!.env, { CLAUDE_CONFIG_DIR: '/x' });
  assert.equal(env.config.harness['pi']!.env, undefined);
  assert.ok(env.warnings.some((w) => w.includes('harness.pi.env')));
  const missing = parseConfigToml('[orchestration]\nharness = "nope"\n');
  assert.equal(missing.config.orchestration.harness, 'claude-code');
  assert.ok(missing.warnings.some((w) => w.includes('[harness.nope]')));
});

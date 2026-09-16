/**
 * OpenCode installer tests: plugin-dir resolution (`plugins/`, PLURAL), the
 * two-file copy, the sibling config, `plugins/package.json` classification, and
 * a clean uninstall.
 *
 * Every test writes under a fresh mkdtemp dir — never the real ~/.config/opencode.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  CONFIG_FILENAME,
  PLUGIN_DIRNAME,
  PLUGIN_FILENAME,
  bundlePath,
  classifyPluginDirMarker,
  configContents,
  doctor,
  install,
  installedConfigPath,
  installedPluginPath,
  markerFinding,
  opencodeRoot,
  pluginsDir,
  uninstall,
} from './install';
import type { AdapterOptions } from './install';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const PLUGIN_ROOT = REPO_ROOT;

function tmp(): string {
  return mkdtempSync(path.join(os.tmpdir(), 'herdr-gsd-oc-inst-'));
}

function opts(dir: string, over: Partial<AdapterOptions> = {}): AdapterOptions {
  return {
    scope: 'local',
    dir,
    pluginRoot: PLUGIN_ROOT,
    spoolDir: path.join(dir, 'spool'),
    env: { PATH: process.env.PATH ?? '' },
    home: dir,
    ...over,
  };
}

test('the plugin dir is `plugins`, plural (spike §3 correction)', () => {
  assert.equal(PLUGIN_DIRNAME, 'plugins');
  assert.equal(PLUGIN_FILENAME, 'herdr-gsd-core.js');
  assert.equal(CONFIG_FILENAME, 'herdr-gsd-core.config.json');
});

test('root resolution: OPENCODE_CONFIG_DIR, XDG_CONFIG_HOME, ~/.config/opencode, --local', () => {
  const base = { pluginRoot: '/p', spoolDir: '/s' };
  assert.equal(opencodeRoot({ ...base, scope: 'global', env: { OPENCODE_CONFIG_DIR: '/oc' }, home: '/h' }), '/oc');
  assert.equal(opencodeRoot({ ...base, scope: 'global', env: { XDG_CONFIG_HOME: '/xdg' }, home: '/h' }), path.join('/xdg', 'opencode'));
  assert.equal(opencodeRoot({ ...base, scope: 'global', env: {}, home: '/h' }), path.join('/h', '.config', 'opencode'));
  assert.equal(opencodeRoot({ ...base, scope: 'local', dir: '/proj', env: {} }), path.join('/proj', '.opencode'));
  assert.equal(pluginsDir({ ...base, scope: 'local', dir: '/proj', env: {} }), path.join('/proj', '.opencode', 'plugins'));
  assert.throws(() => opencodeRoot({ ...base, scope: 'local', env: {} }), /requires a project directory/);
});

test('install copies the bundle and writes the sibling config', () => {
  const dir = tmp();
  const o = opts(dir);
  const res = install(o);
  assert.equal(res.changed, true);
  assert.equal(res.entries, 2);
  assert.deepEqual(res.warnings, []);

  const plugin = installedPluginPath(o);
  const cfg = installedConfigPath(o);
  assert.equal(plugin, path.join(dir, '.opencode', 'plugins', PLUGIN_FILENAME));
  assert.equal(readFileSync(plugin, 'utf8'), readFileSync(bundlePath(PLUGIN_ROOT), 'utf8'), 'byte-identical copy of the built bundle');
  assert.equal(readFileSync(cfg, 'utf8'), `${JSON.stringify({ spoolDir: o.spoolDir }, null, 2)}\n`);
  assert.equal(configContents('/x'), '{\n  "spoolDir": "/x"\n}\n');
});

test('install is idempotent and re-writes only a changed spool dir', () => {
  const dir = tmp();
  const o = opts(dir);
  install(o);
  assert.equal(install(o).changed, false);
  const moved = { ...o, spoolDir: '/new/spool' };
  assert.equal(install(moved).changed, true);
  assert.equal(readFileSync(installedConfigPath(o), 'utf8'), configContents('/new/spool'));
});

test('uninstall removes exactly the two files and nothing else', () => {
  const dir = tmp();
  const o = opts(dir);
  install(o);
  const neighbour = path.join(pluginsDir(o), 'someone-elses-plugin.js');
  writeFileSync(neighbour, '// not ours\n');
  const res = uninstall(o);
  assert.equal(res.removed, 2);
  assert.equal(res.changed, true);
  assert.ok(!existsSync(installedPluginPath(o)));
  assert.ok(!existsSync(installedConfigPath(o)));
  assert.ok(existsSync(neighbour), 'a foreign plugin beside ours is untouched');
  assert.ok(existsSync(pluginsDir(o)), 'the shared plugins dir is never removed');

  const again = uninstall(o);
  assert.equal(again.removed, 0);
  assert.equal(again.changed, false);
  assert.ok(again.warnings.some((w) => w.includes('nothing to uninstall')));
});

test('plugins/package.json is classified, never written', () => {
  const dir = tmp();
  const o = opts(dir);
  const pdir = pluginsDir(o);
  mkdirSync(pdir, { recursive: true });
  const marker = path.join(pdir, 'package.json');

  assert.equal(classifyPluginDirMarker(pdir).cls, 'absent');
  install(o);
  assert.ok(!existsSync(marker), 'we never create the marker GSD owns');

  writeFileSync(marker, '{"type":"commonjs"}');
  assert.equal(classifyPluginDirMarker(pdir).cls, 'commonjs');
  assert.equal(markerFinding('commonjs', marker).level, 'ok');

  writeFileSync(marker, '{"name":"local-plugins"}');
  assert.equal(classifyPluginDirMarker(pdir).cls, 'foreign');
  assert.equal(markerFinding('foreign', marker).level, 'ok');

  writeFileSync(marker, 'nope');
  assert.equal(classifyPluginDirMarker(pdir).cls, 'unparseable');
  assert.equal(markerFinding('unparseable', marker).level, 'warn');

  writeFileSync(marker, '{"type":"module"}');
  assert.equal(classifyPluginDirMarker(pdir).cls, 'module');
  const finding = markerFinding('module', marker);
  assert.equal(finding.level, 'warn');
  assert.ok(finding.message.includes('Bun'), 'the warning explains why this is survivable');

  rmSync(installedPluginPath(o));
  const res = install(o);
  assert.ok(res.warnings.some((w) => w.includes('"type":"module"')), 'install warns but proceeds');
  assert.ok(existsSync(installedPluginPath(o)));
  assert.equal(readFileSync(marker, 'utf8'), '{"type":"module"}', 'the foreign marker is left untouched');
});

test('install refuses when the bundle has not been built', () => {
  assert.throws(() => install(opts(tmp(), { pluginRoot: '/nowhere' })), /plugin bundle not built/);
});

test('doctor: missing, then healthy, then drifted', () => {
  const dir = tmp();
  const o = opts(dir);
  const missing = doctor(o);
  assert.equal(missing.ok, false);
  assert.ok(missing.findings.some((f) => f.level === 'error' && f.message.includes('plugin dir not found')));
  assert.ok(missing.findings.some((f) => f.level === 'error' && f.message.includes('plugin not installed')));

  install(o);
  const ok = doctor(o);
  assert.equal(ok.ok, true, JSON.stringify(ok.findings));
  assert.ok(ok.findings.some((f) => f.message.startsWith('plugin installed')));
  assert.ok(ok.findings.some((f) => f.message.startsWith('plugin config')));
  assert.ok(ok.findings.some((f) => f.message.includes('spool dir writable')));
  assert.ok(ok.findings.some((f) => f.message.startsWith('node on PATH')));

  writeFileSync(installedPluginPath(o), '// stale\n');
  assert.ok(doctor(o).findings.some((f) => f.level === 'warn' && f.message.includes('differs from the built bundle')));

  writeFileSync(installedConfigPath(o), configContents('/elsewhere'));
  assert.ok(doctor(o).findings.some((f) => f.level === 'warn' && f.message.includes('spoolDir differs')));

  rmSync(installedConfigPath(o));
  assert.ok(doctor(o).findings.some((f) => f.level === 'error' && f.message.includes('plugin config missing')));
});

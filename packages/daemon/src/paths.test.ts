import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { daemonPaths, controlSocketPath, pluginEnv } from './paths';

test('daemonPaths keyed by socket hash', () => {
  const a = daemonPaths('/state', '/home/u/.config/herdr/herdr.sock');
  const b = daemonPaths('/state', '/home/u/.config/herdr/other.sock');
  assert.notEqual(a.socketHash, b.socketHash);
  assert.equal(a.dir, path.join('/state', a.socketHash));
  assert.equal(a.pidFile, path.join(a.dir, 'gsdd.pid'));
  assert.equal(a.controlSocket, path.join(a.dir, 'gsdd.sock'));
  assert.equal(a.logFile, path.join(a.dir, 'log', 'gsdd.log'));
  assert.equal(a.spoolDir, path.join(a.dir, 'spool'));
  assert.equal(daemonPaths('/state', 'relative.sock').socketHash, daemonPaths('/state', path.resolve('relative.sock')).socketHash);
});

test('controlSocketPath falls back to tmpdir for long paths', () => {
  const short = controlSocketPath('/s', 'abc');
  assert.equal(short, '/s/gsdd.sock');
  const long = controlSocketPath('/' + 'x'.repeat(120), 'abc');
  assert.ok(long.endsWith('herdr-gsd-abc.sock'));
  assert.ok(!long.includes('xxxx'));
});

test('pluginEnv uses Herdr env when present, XDG fallbacks otherwise', () => {
  const e = pluginEnv(
    {
      HERDR_PLUGIN_ID: 'p',
      HERDR_PLUGIN_ROOT: '/root',
      HERDR_PLUGIN_CONFIG_DIR: '/cfg',
      HERDR_PLUGIN_STATE_DIR: '/st',
      HERDR_SOCKET_PATH: '/sock',
      HERDR_BIN_PATH: '/bin/herdr',
      HERDR_WORKSPACE_ID: 'w1',
      HERDR_PANE_ID: 'w1:p1',
    },
    '/home/u',
  );
  assert.deepEqual(e, {
    pluginId: 'p',
    pluginRoot: '/root',
    configDir: '/cfg',
    stateDir: '/st',
    herdrSocket: '/sock',
    herdrBin: '/bin/herdr',
    workspaceId: 'w1',
    paneId: 'w1:p1',
  });
  const f = pluginEnv({}, '/home/u');
  assert.equal(f.pluginId, 'herdr-gsd-core');
  assert.equal(f.configDir, '/home/u/.config/herdr/plugins/config/herdr-gsd-core');
  assert.equal(f.stateDir, '/home/u/.local/state/herdr/plugins/herdr-gsd-core');
  assert.equal(f.herdrSocket, '/home/u/.config/herdr/herdr.sock');
  assert.equal(f.herdrBin, 'herdr');
  assert.ok(path.isAbsolute(f.pluginRoot));
  const g = pluginEnv({ XDG_STATE_HOME: '/xs', XDG_CONFIG_HOME: '/xc' }, '/home/u');
  assert.equal(g.stateDir, '/xs/herdr/plugins/herdr-gsd-core');
  assert.equal(g.configDir, '/xc/herdr/plugins/config/herdr-gsd-core');
  assert.equal(g.herdrSocket, '/xc/herdr/herdr.sock');
});

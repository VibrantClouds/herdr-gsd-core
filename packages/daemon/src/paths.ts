import * as path from 'node:path';
import * as os from 'node:os';
import { shortHash } from '@herdr-gsd/core';

/**
 * Daemon state layout (spec §3.5): `$HERDR_PLUGIN_STATE_DIR/<socket-hash>/…`.
 * One daemon per Herdr server socket; the socket path hash keys everything.
 */
export interface DaemonPaths {
  stateRoot: string;
  socketHash: string;
  dir: string;
  pidFile: string;
  controlSocket: string;
  disabledMarker: string;
  spoolDir: string;
  bindingsFile: string;
  seqFile: string;
  viewFile: string;
  logDir: string;
  logFile: string;
  orchestrationDir: string;
}

export function daemonPaths(stateRoot: string, herdrSocketPath: string): DaemonPaths {
  const socketHash = shortHash(path.resolve(herdrSocketPath));
  const dir = path.join(stateRoot, socketHash);
  return {
    stateRoot,
    socketHash,
    dir,
    pidFile: path.join(dir, 'gsdd.pid'),
    controlSocket: controlSocketPath(dir, socketHash),
    disabledMarker: path.join(dir, 'gsdd.disabled'),
    spoolDir: path.join(dir, 'spool'),
    bindingsFile: path.join(dir, 'bindings.json'),
    seqFile: path.join(dir, 'seq.json'),
    viewFile: path.join(dir, 'view.json'),
    logDir: path.join(dir, 'log'),
    logFile: path.join(dir, 'log', 'gsdd.log'),
    orchestrationDir: path.join(dir, 'orchestration'),
  };
}

/**
 * Unix socket paths are limited to ~104 bytes. If the state dir is deep, fall
 * back to a short path under the OS temp dir keyed by the socket hash.
 */
export function controlSocketPath(dir: string, socketHash: string): string {
  const preferred = path.join(dir, 'gsdd.sock');
  if (Buffer.byteLength(preferred) <= 100) return preferred;
  return path.join(os.tmpdir(), `herdr-gsd-${socketHash}.sock`);
}

/**
 * Resolve the plugin env Herdr injects. Outside a Herdr-launched process (the
 * `bin/herdr-gsd` launcher from a normal shell) the fallbacks are Herdr's own
 * per-plugin directories, so the CLI talks to the same config file and the same
 * daemon as the plugin actions do instead of spawning a second daemon elsewhere.
 */
export interface PluginEnv {
  pluginId: string;
  pluginRoot: string;
  configDir: string;
  stateDir: string;
  herdrSocket: string;
  herdrBin: string;
  workspaceId?: string;
  paneId?: string;
}

export function pluginEnv(env: NodeJS.ProcessEnv = process.env, home = os.homedir()): PluginEnv {
  const pluginId = env.HERDR_PLUGIN_ID ?? 'herdr-gsd-core';
  const xdgState = env.XDG_STATE_HOME ?? path.join(home, '.local', 'state');
  const xdgConfig = env.XDG_CONFIG_HOME ?? path.join(home, '.config');
  return {
    pluginId,
    pluginRoot: env.HERDR_PLUGIN_ROOT ?? path.resolve(__dirname, '..', '..', '..'),
    configDir: env.HERDR_PLUGIN_CONFIG_DIR ?? path.join(xdgConfig, 'herdr', 'plugins', 'config', pluginId),
    stateDir: env.HERDR_PLUGIN_STATE_DIR ?? path.join(xdgState, 'herdr', 'plugins', pluginId),
    herdrSocket: env.HERDR_SOCKET_PATH ?? path.join(xdgConfig, 'herdr', 'herdr.sock'),
    herdrBin: env.HERDR_BIN_PATH ?? 'herdr',
    workspaceId: env.HERDR_WORKSPACE_ID,
    paneId: env.HERDR_PANE_ID,
  };
}

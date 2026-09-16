/**
 * OpenCode adapter installer (spec §5.3, docs/spikes/M0-A-hooks.md §3, M0-G-gsd.md §6).
 *
 * OpenCode has no hook-config file: a plugin is a JS file dropped into the
 * plugin directory — `plugins/`, PLURAL (spike §3 correction).
 *
 *   --local <dir> → <dir>/.opencode
 *   --global      → $OPENCODE_CONFIG_DIR, else $XDG_CONFIG_HOME/opencode,
 *                   else ~/.config/opencode
 *
 * Installs exactly two files:
 *   <root>/plugins/herdr-gsd-core.js           (the compiled single-file bundle)
 *   <root>/plugins/herdr-gsd-core.config.json  ({"spoolDir": "..."})
 *
 * `plugins/package.json` is classified but NEVER written: GSD owns that marker
 * and a foreign `"type":"module"` there only warrants a warning, since OpenCode
 * runs on Bun, whose loader sniffs module format per file.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import * as path from 'node:path';
import { atomicWrite, doctorOk, homeOf, nodeOnPathFinding, readFileIfExists, spoolDirFinding } from './hookfile';
import type { AdapterOptions, DoctorFinding, DoctorResult, InstallResult, UninstallResult } from './hookfile';

export type { AdapterOptions, DoctorFinding, DoctorResult, InstallResult, UninstallResult } from './hookfile';

export const PLUGIN_FILENAME = 'herdr-gsd-core.js';
export const CONFIG_FILENAME = 'herdr-gsd-core.config.json';
/** `plugins`, plural — confirmed against the live install layout (spike §3). */
export const PLUGIN_DIRNAME = 'plugins';

/** Source of the compiled single-file bundle inside this repo. */
export function bundlePath(pluginRoot: string): string {
  return path.join(pluginRoot, 'packages', 'adapters', 'opencode', 'dist', PLUGIN_FILENAME);
}

/** `$OPENCODE_CONFIG_DIR` → `$XDG_CONFIG_HOME/opencode` → `~/.config/opencode`, or `<dir>/.opencode`. */
export function opencodeRoot(opts: AdapterOptions): string {
  if (opts.scope === 'local') {
    if (!opts.dir) throw new Error('opencode adapter: --local requires a project directory');
    return path.join(opts.dir, '.opencode');
  }
  const env = opts.env ?? process.env;
  if (env.OPENCODE_CONFIG_DIR && env.OPENCODE_CONFIG_DIR.length > 0) return env.OPENCODE_CONFIG_DIR;
  if (env.XDG_CONFIG_HOME && env.XDG_CONFIG_HOME.length > 0) return path.join(env.XDG_CONFIG_HOME, 'opencode');
  return path.join(homeOf(opts), '.config', 'opencode');
}

export function pluginsDir(opts: AdapterOptions): string {
  return path.join(opencodeRoot(opts), PLUGIN_DIRNAME);
}

export function installedPluginPath(opts: AdapterOptions): string {
  return path.join(pluginsDir(opts), PLUGIN_FILENAME);
}

export function installedConfigPath(opts: AdapterOptions): string {
  return path.join(pluginsDir(opts), CONFIG_FILENAME);
}

export type MarkerClass = 'absent' | 'commonjs' | 'module' | 'foreign' | 'unparseable';

/**
 * Classify `plugins/package.json` before writing anything beside it.
 * `module` means our CommonJS bundle would be loaded as ESM by a strict Node
 * resolver — Bun does not care, so this is a warning, not an error.
 */
export function classifyPluginDirMarker(pluginsDirPath: string): { cls: MarkerClass; file: string } {
  const file = path.join(pluginsDirPath, 'package.json');
  if (!existsSync(file)) return { cls: 'absent', file };
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return { cls: 'unparseable', file };
  }
  if (!parsed || typeof parsed !== 'object') return { cls: 'unparseable', file };
  const type = (parsed as Record<string, unknown>).type;
  if (type === 'commonjs') return { cls: 'commonjs', file };
  if (type === 'module') return { cls: 'module', file };
  return { cls: 'foreign', file };
}

export function markerFinding(cls: MarkerClass, file: string): DoctorFinding {
  switch (cls) {
    case 'commonjs':
      return { level: 'ok', message: `${file}: "type":"commonjs" — matches the CommonJS plugin bundle` };
    case 'module':
      return {
        level: 'warn',
        message: `${file}: "type":"module" — ${PLUGIN_FILENAME} is CommonJS. OpenCode runs on Bun, whose loader sniffs module format per file, so this should still load; not rewriting a marker owned by another installer.`,
      };
    case 'unparseable':
      return { level: 'warn', message: `${file}: not valid JSON — leaving it untouched` };
    case 'foreign':
      return { level: 'ok', message: `${file}: no "type" field — CommonJS by default` };
    default:
      return { level: 'ok', message: 'no plugins/package.json marker present' };
  }
}

export function configContents(spoolDir: string): string {
  return `${JSON.stringify({ spoolDir }, null, 2)}\n`;
}

export function install(opts: AdapterOptions): InstallResult {
  const dir = pluginsDir(opts);
  const dest = installedPluginPath(opts);
  const cfg = installedConfigPath(opts);
  const src = bundlePath(opts.pluginRoot);
  const warnings: string[] = [];

  if (!existsSync(src)) {
    throw new Error(`opencode adapter: plugin bundle not built: ${src} — run \`npm run build\``);
  }
  mkdirSync(dir, { recursive: true });
  const { cls, file } = classifyPluginDirMarker(dir);
  const marker = markerFinding(cls, file);
  if (marker.level !== 'ok') warnings.push(marker.message);

  const beforePlugin = readFileIfExists(dest);
  const beforeConfig = readFileIfExists(cfg);
  const afterConfig = configContents(opts.spoolDir);
  const nextPlugin = readFileSync(src, 'utf8');

  let changed = false;
  if (beforePlugin !== nextPlugin) {
    copyFileSync(src, dest);
    changed = true;
  }
  if (beforeConfig !== afterConfig) {
    atomicWrite(cfg, afterConfig);
    changed = true;
  }
  return { file: dest, changed, entries: 2, warnings };
}

export function uninstall(opts: AdapterOptions): UninstallResult {
  const dest = installedPluginPath(opts);
  const cfg = installedConfigPath(opts);
  const warnings: string[] = [];
  let removed = 0;
  for (const f of [dest, cfg]) {
    try {
      if (existsSync(f)) {
        unlinkSync(f);
        removed++;
      }
    } catch (err) {
      warnings.push(`could not remove ${f}: ${(err as Error).message}`);
    }
  }
  if (removed === 0) warnings.push(`${dest}: nothing to uninstall`);
  return { file: dest, changed: removed > 0, removed, warnings };
}

export function doctor(opts: AdapterOptions): DoctorResult {
  const dir = pluginsDir(opts);
  const dest = installedPluginPath(opts);
  const cfg = installedConfigPath(opts);
  const findings: DoctorFinding[] = [];

  if (!existsSync(dir)) findings.push({ level: 'error', message: `plugin dir not found: ${dir} — run \`adapter install opencode\`` });
  else findings.push({ level: 'ok', message: `plugin dir: ${dir}` });

  if (!existsSync(dest)) findings.push({ level: 'error', message: `plugin not installed: ${dest}` });
  else {
    let size = 0;
    try {
      size = statSync(dest).size;
    } catch {
      /* ignore */
    }
    findings.push({ level: 'ok', message: `plugin installed: ${dest} (${size} bytes)` });
    const src = bundlePath(opts.pluginRoot);
    if (existsSync(src) && readFileIfExists(src) !== readFileIfExists(dest)) {
      findings.push({ level: 'warn', message: `${dest} differs from the built bundle — re-run install` });
    }
  }

  const cfgText = readFileIfExists(cfg);
  if (cfgText === '') findings.push({ level: 'error', message: `plugin config missing: ${cfg}` });
  else if (cfgText !== configContents(opts.spoolDir)) findings.push({ level: 'warn', message: `${cfg}: spoolDir differs from ${opts.spoolDir} — re-run install` });
  else findings.push({ level: 'ok', message: `plugin config: ${cfg}` });

  const { cls, file } = classifyPluginDirMarker(dir);
  findings.push(markerFinding(cls, file));
  findings.push(spoolDirFinding(opts.spoolDir));
  findings.push(nodeOnPathFinding(opts.env ?? process.env));
  return { ok: doctorOk(findings), findings };
}

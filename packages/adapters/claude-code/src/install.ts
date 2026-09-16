/**
 * Claude Code adapter installer (spec §5.1, docs/spikes/M0-A-hooks.md §1.3/§1.4).
 *
 * Target file:
 *   --local <dir> → <dir>/.claude/settings.json
 *   --global      → $CLAUDE_CONFIG_DIR/settings.json, else ~/.claude/settings.json
 *
 * Guarantees: idempotent (re-install replaces only our entries), formatting
 * preserving (indent + trailing newline are detected and reproduced, so
 * install→uninstall on a settings.json with unrelated hooks is byte-identical),
 * atomic (tmp + rename), and it refuses to touch a file that does not parse.
 */
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import {
  addEntries,
  atomicWrite,
  backupOnce,
  detectFormat,
  doctorOk,
  hookScriptFinding,
  hookTableOf,
  homeOf,
  nodeOnPathFinding,
  ownedCommands,
  parseConfig,
  q,
  readFileIfExists,
  removeOwned,
  serializeJson,
  spoolDirFinding,
} from './hookfile';
import type { AdapterOptions, DesiredEntry, DoctorFinding, DoctorResult, InstallResult, UninstallResult } from './hookfile';

export type { AdapterOptions, DoctorFinding, DoctorResult, InstallResult, UninstallResult } from './hookfile';

/** Path segment that identifies a herdr-owned hook entry (spike §1.3 DECISION). */
export const OWNER_MARKER = path.join('packages', 'adapters', 'claude-code', 'dist', 'hook.js');

/** `timeout` is in SECONDS on this surface (spike §1.3). */
export const HOOK_TIMEOUT_SECONDS = 2;

export const PRE_TOOL_MATCHER = 'Bash|Edit|Write|MultiEdit|Agent|Task';
/** `Agent` is the real subagent tool; `Task` is kept as a legacy alias (spike §1.1). */
export const POST_TOOL_MATCHER = 'Agent|Task';

/** Claude Code event → hook-script argv kind. `SubagentStart` exists in 2.1.273. */
export const EVENTS: ReadonlyArray<{ event: string; kind: string; matcher?: string }> = [
  { event: 'SessionStart', kind: 'session-start' },
  { event: 'SubagentStart', kind: 'subagent-start' },
  { event: 'SubagentStop', kind: 'subagent-stop' },
  { event: 'PreToolUse', kind: 'tool-pre', matcher: PRE_TOOL_MATCHER },
  { event: 'PostToolUse', kind: 'tool-post', matcher: POST_TOOL_MATCHER },
  { event: 'Stop', kind: 'stop' },
  { event: 'PreCompact', kind: 'compact-pre' },
];

export function hookScriptPath(pluginRoot: string): string {
  return path.join(pluginRoot, OWNER_MARKER);
}

/**
 * Hook commands are argv strings parsed by a shell, not an env-prefixed shell
 * line, so the spool dir is baked in as a `--spool <dir>` flag rather than an
 * `HERDR_GSD_SPOOL_DIR=` assignment.
 */
export function hookCommand(pluginRoot: string, kind: string, spoolDir: string): string {
  return `node ${q(hookScriptPath(pluginRoot))} ${kind} --spool ${q(spoolDir)}`;
}

export function desiredEntries(pluginRoot: string, spoolDir: string): DesiredEntry[] {
  return EVENTS.map((e) => ({
    event: e.event,
    ...(e.matcher === undefined ? {} : { matcher: e.matcher }),
    command: hookCommand(pluginRoot, e.kind, spoolDir),
    timeout: HOOK_TIMEOUT_SECONDS,
  }));
}

/** `<dir>/.claude/settings.json` or `$CLAUDE_CONFIG_DIR/settings.json` or `~/.claude/settings.json`. */
export function settingsPath(opts: AdapterOptions): string {
  if (opts.scope === 'local') {
    if (!opts.dir) throw new Error('claude-code adapter: --local requires a project directory');
    return path.join(opts.dir, '.claude', 'settings.json');
  }
  const env = opts.env ?? process.env;
  const configDir = env.CLAUDE_CONFIG_DIR;
  if (configDir && configDir.length > 0) return path.join(configDir, 'settings.json');
  return path.join(homeOf(opts), '.claude', 'settings.json');
}

/** Pure: current file contents → contents with exactly our entries installed. */
export function applyInstall(text: string, file: string, pluginRoot: string, spoolDir: string): string {
  const fmt = detectFormat(text);
  const root = parseConfig(text, file);
  const table = hookTableOf(root);
  removeOwned(table, OWNER_MARKER);
  addEntries(table, desiredEntries(pluginRoot, spoolDir));
  root.hooks = table;
  return serializeJson(root, fmt);
}

/** Pure: current file contents → contents with all our entries removed. */
export function applyUninstall(text: string, file: string): { text: string; removed: number } {
  const fmt = detectFormat(text);
  const root = parseConfig(text, file);
  const table = hookTableOf(root);
  const removed = removeOwned(table, OWNER_MARKER);
  if (Object.keys(table).length === 0) delete root.hooks;
  else root.hooks = table;
  return { text: serializeJson(root, fmt), removed };
}

export function install(opts: AdapterOptions): InstallResult {
  const file = settingsPath(opts);
  const before = readFileIfExists(file);
  const after = applyInstall(before, file, opts.pluginRoot, opts.spoolDir);
  const warnings: string[] = [];
  if (!existsSync(hookScriptPath(opts.pluginRoot))) {
    warnings.push(`hook script not built yet: ${hookScriptPath(opts.pluginRoot)} — run \`npm run build\``);
  }
  if (before === after) return { file, changed: false, entries: EVENTS.length, warnings };
  const backup = backupOnce(file);
  atomicWrite(file, after);
  return { file, changed: true, ...(backup ? { backup } : {}), entries: EVENTS.length, warnings };
}

export function uninstall(opts: AdapterOptions): UninstallResult {
  const file = settingsPath(opts);
  const before = readFileIfExists(file);
  if (before === '') return { file, changed: false, removed: 0, warnings: [`${file}: nothing to uninstall`] };
  const { text, removed } = applyUninstall(before, file);
  if (text === before) return { file, changed: false, removed, warnings: [] };
  atomicWrite(file, text);
  return { file, changed: true, removed, warnings: [] };
}

export function doctor(opts: AdapterOptions): DoctorResult {
  const file = settingsPath(opts);
  const findings: DoctorFinding[] = [];
  const text = readFileIfExists(file);
  if (text === '') {
    findings.push({ level: 'error', message: `settings file not found: ${file} — run \`adapter install claude-code\`` });
  } else {
    findings.push({ level: 'ok', message: `settings file: ${file}` });
    let table;
    try {
      table = hookTableOf(parseConfig(text, file));
    } catch (err) {
      findings.push({ level: 'error', message: (err as Error).message });
    }
    if (table) {
      const owned = ownedCommands(table, OWNER_MARKER);
      if (owned.length === 0) findings.push({ level: 'error', message: 'no herdr-gsd-core hook entries installed' });
      else if (owned.length < EVENTS.length) {
        findings.push({ level: 'warn', message: `${owned.length}/${EVENTS.length} hook entries installed — re-run install` });
      } else findings.push({ level: 'ok', message: `${owned.length} hook entries installed` });
      const stale = owned.filter((c) => !c.includes(hookScriptPath(opts.pluginRoot)));
      if (stale.length > 0) {
        findings.push({ level: 'warn', message: `${stale.length} hook entries point at a different plugin root` });
      }
    }
  }
  findings.push(hookScriptFinding(hookScriptPath(opts.pluginRoot)));
  findings.push(spoolDirFinding(opts.spoolDir));
  findings.push(nodeOnPathFinding(opts.env ?? process.env));
  return { ok: doctorOk(findings), findings };
}

/**
 * Codex adapter installer (spec §5.2, docs/spikes/M0-A-hooks.md §2, M0-G-gsd.md §6).
 *
 * Target file:
 *   --local <dir> → <dir>/.codex/hooks.json
 *   --global      → $CODEX_HOME/hooks.json, else ~/.codex/hooks.json
 *
 * Schema is the NESTED form `{"hooks": {"<Event>": [{"hooks": [{...}]}]}}`.
 * Codex's hooks.json is `deny_unknown_fields`-strict and rejects the legacy
 * top-level `{"<Event>": [...]}` shape, so nothing extra is ever stamped onto an
 * entry — ownership is a command substring, as on the Claude Code surface.
 *
 * `matcher` is deliberately omitted: GSD omits it on this surface, and Codex
 * tool names are lowercase (`shell`), so a Claude-style matcher would silently
 * fail to match.
 *
 * WARNING: only `SessionStart` has a live production precedent here (GSD wires
 * that one event and unconditionally removes every other). `doctor` says so.
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

export const OWNER_MARKER = path.join('packages', 'adapters', 'codex', 'dist', 'hook.js');
export const HOOK_TIMEOUT_SECONDS = 2;

/** The only event with a live GSD precedent on this surface (spike §2). */
export const PROVEN_EVENT = 'SessionStart';

export const EVENTS: ReadonlyArray<{ event: string; kind: string }> = [
  { event: 'SessionStart', kind: 'session-start' },
  { event: 'SubagentStart', kind: 'subagent-start' },
  { event: 'Stop', kind: 'stop' },
  { event: 'PostToolUse', kind: 'tool-post' },
];

export function hookScriptPath(pluginRoot: string): string {
  return path.join(pluginRoot, OWNER_MARKER);
}

export function hookCommand(pluginRoot: string, kind: string, spoolDir: string): string {
  return `node ${q(hookScriptPath(pluginRoot))} ${kind} --spool ${q(spoolDir)}`;
}

export function desiredEntries(pluginRoot: string, spoolDir: string): DesiredEntry[] {
  return EVENTS.map((e) => ({ event: e.event, command: hookCommand(pluginRoot, e.kind, spoolDir), timeout: HOOK_TIMEOUT_SECONDS }));
}

export function hooksFilePath(opts: AdapterOptions): string {
  if (opts.scope === 'local') {
    if (!opts.dir) throw new Error('codex adapter: --local requires a project directory');
    return path.join(opts.dir, '.codex', 'hooks.json');
  }
  const env = opts.env ?? process.env;
  const codexHome = env.CODEX_HOME;
  if (codexHome && codexHome.length > 0) return path.join(codexHome, 'hooks.json');
  return path.join(homeOf(opts), '.codex', 'hooks.json');
}

export function applyInstall(text: string, file: string, pluginRoot: string, spoolDir: string): string {
  const fmt = detectFormat(text);
  const root = parseConfig(text, file);
  const table = hookTableOf(root);
  removeOwned(table, OWNER_MARKER);
  addEntries(table, desiredEntries(pluginRoot, spoolDir));
  root.hooks = table;
  return serializeJson(root, fmt);
}

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
  const file = hooksFilePath(opts);
  const before = readFileIfExists(file);
  const after = applyInstall(before, file, opts.pluginRoot, opts.spoolDir);
  const warnings: string[] = [
    `codex: only ${PROVEN_EVENT} has a live precedent on this surface; the other ${EVENTS.length - 1} events are speculative (docs/spikes/M0-A-hooks.md §2)`,
  ];
  if (!existsSync(hookScriptPath(opts.pluginRoot))) {
    warnings.push(`hook script not built yet: ${hookScriptPath(opts.pluginRoot)} — run \`npm run build\``);
  }
  if (before === after) return { file, changed: false, entries: EVENTS.length, warnings };
  const backup = backupOnce(file);
  atomicWrite(file, after);
  return { file, changed: true, ...(backup ? { backup } : {}), entries: EVENTS.length, warnings };
}

export function uninstall(opts: AdapterOptions): UninstallResult {
  const file = hooksFilePath(opts);
  const before = readFileIfExists(file);
  if (before === '') return { file, changed: false, removed: 0, warnings: [`${file}: nothing to uninstall`] };
  const { text, removed } = applyUninstall(before, file);
  if (text === before) return { file, changed: false, removed, warnings: [] };
  atomicWrite(file, text);
  return { file, changed: true, removed, warnings: [] };
}

export function doctor(opts: AdapterOptions): DoctorResult {
  const file = hooksFilePath(opts);
  const findings: DoctorFinding[] = [];
  const text = readFileIfExists(file);
  if (text === '') {
    findings.push({ level: 'error', message: `hooks file not found: ${file} — run \`adapter install codex\`` });
  } else {
    findings.push({ level: 'ok', message: `hooks file: ${file}` });
    let table;
    try {
      const root = parseConfig(text, file);
      table = hookTableOf(root);
      const strayEvents = Object.keys(root).filter((k) => k !== 'hooks' && Array.isArray(root[k]));
      if (strayEvents.length > 0) {
        findings.push({
          level: 'warn',
          message: `top-level event keys present (${strayEvents.join(', ')}) — Codex deny_unknown_fields rejects these; move them under "hooks"`,
        });
      }
    } catch (err) {
      findings.push({ level: 'error', message: (err as Error).message });
    }
    if (table) {
      const owned = ownedCommands(table, OWNER_MARKER);
      if (owned.length === 0) findings.push({ level: 'error', message: 'no herdr-gsd-core hook entries installed' });
      else if (owned.length < EVENTS.length) findings.push({ level: 'warn', message: `${owned.length}/${EVENTS.length} hook entries installed — re-run install` });
      else findings.push({ level: 'ok', message: `${owned.length} hook entries installed` });
    }
  }
  findings.push({
    level: 'warn',
    message: `codex: only ${PROVEN_EVENT} has a live precedent on the hooks.json surface; SubagentStart/Stop/PostToolUse are registered speculatively and unverified against a real Codex session (docs/spikes/M0-A-hooks.md §2)`,
  });
  findings.push(featuresFlagFinding(opts));
  findings.push(hookScriptFinding(hookScriptPath(opts.pluginRoot)));
  findings.push(spoolDirFinding(opts.spoolDir));
  findings.push(nodeOnPathFinding(opts.env ?? process.env));
  return { ok: doctorOk(findings), findings };
}

/** Codex gates hooks behind `[features] hooks = true` in config.toml (spike §2). */
export function featuresFlagFinding(opts: AdapterOptions): DoctorFinding {
  const dir = path.dirname(hooksFilePath(opts));
  const toml = path.join(dir, 'config.toml');
  const text = readFileIfExists(toml);
  if (text === '') return { level: 'warn', message: `${toml} not found — ensure \`[features] hooks = true\` is set for Codex` };
  if (/^\s*(hooks|codex_hooks)\s*=\s*true\s*$/m.test(text)) return { level: 'ok', message: `${toml}: hooks feature enabled` };
  return { level: 'warn', message: `${toml}: \`[features] hooks = true\` not found — Codex will not run hooks` };
}

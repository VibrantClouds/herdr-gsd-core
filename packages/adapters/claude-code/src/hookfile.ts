/**
 * Shared installer primitives for the JSON hook-config surfaces
 * (Claude Code `settings.json`, Codex `hooks.json` — structurally identical,
 * docs/spikes/M0-A-hooks.md §1.3 / §2).
 *
 * SOURCE OF TRUTH. Copied verbatim into the codex/opencode adapters by
 * `scripts/copy-shared.cjs`. Edit here, then run `node scripts/copy-shared.cjs`.
 *
 * Ownership model (spike §1.3 DECISION): herdr-owned entries carry NO marker
 * key — Codex's hooks.json is `deny_unknown_fields`-strict — and are identified
 * by a distinctive substring of the `command` string, exactly like GSD's
 * `isManagedHookCommand`.
 */
import { closeSync, constants, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync, writeSync } from 'node:fs';
import * as path from 'node:path';

export interface HookCommand {
  type: 'command';
  command: string;
  timeout?: number;
  [k: string]: unknown;
}

export interface HookGroup {
  matcher?: string;
  hooks: HookCommand[];
  [k: string]: unknown;
}

/** `{ "<Event>": [ { matcher?, hooks: [...] } ] }` */
export type HookTable = Record<string, HookGroup[]>;

export interface DesiredEntry {
  event: string;
  matcher?: string;
  command: string;
  timeout?: number;
}

export interface JsonFormat {
  indent: string;
  trailingNewline: boolean;
}

export interface DoctorFinding {
  level: 'ok' | 'warn' | 'error';
  message: string;
}

export interface DoctorResult {
  ok: boolean;
  findings: DoctorFinding[];
}

export interface AdapterOptions {
  scope: 'global' | 'local';
  /** project dir for `scope: 'local'` */
  dir?: string;
  /** repo root of this plugin; hook command paths are built from it */
  pluginRoot: string;
  spoolDir: string;
  env?: NodeJS.ProcessEnv;
  home?: string;
}

export interface InstallResult {
  file: string;
  changed: boolean;
  backup?: string;
  entries: number;
  warnings: string[];
}

export interface UninstallResult {
  file: string;
  changed: boolean;
  removed: number;
  warnings: string[];
}

/** Detect the indent unit of an existing JSON document (2/4 spaces or tab). */
export function detectIndent(text: string): string {
  const m = /\n([ \t]+)[^\s]/.exec(text);
  const ws = m?.[1];
  if (!ws) return '  ';
  return ws.charAt(0) === '\t' ? '\t' : ' '.repeat(ws.length);
}

export function detectFormat(text: string): JsonFormat {
  return { indent: detectIndent(text), trailingNewline: text.length === 0 || text.endsWith('\n') };
}

export function serializeJson(value: unknown, fmt: JsonFormat): string {
  return JSON.stringify(value, null, fmt.indent) + (fmt.trailingNewline ? '\n' : '');
}

/** Parse a hook-config document. Throws a clear error rather than clobbering. */
export function parseConfig(text: string, file: string): Record<string, unknown> {
  if (text.trim() === '') return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`${file}: refusing to modify — file is not valid JSON (${(err as Error).message}). Fix or remove it and retry.`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${file}: refusing to modify — top level is not a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

function asGroups(value: unknown): HookGroup[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((g): g is HookGroup => !!g && typeof g === 'object' && !Array.isArray(g)) as HookGroup[];
}

/** Every command string in the table, for doctor/ownership queries. */
export function ownedCommands(table: HookTable | undefined, marker: string): string[] {
  const out: string[] = [];
  if (!table) return out;
  for (const groups of Object.values(table)) {
    for (const g of groups ?? []) {
      for (const h of Array.isArray(g.hooks) ? g.hooks : []) {
        if (typeof h?.command === 'string' && h.command.includes(marker)) out.push(h.command);
      }
    }
  }
  return out;
}

/**
 * Remove every hook entry whose command contains `marker`, then drop any hook
 * array / matcher group / event array left empty by that removal.
 * Returns the number of entries removed.
 */
export function removeOwned(table: HookTable, marker: string): number {
  let removed = 0;
  for (const event of Object.keys(table)) {
    const groups = asGroups(table[event]);
    if (!groups) continue;
    const keptGroups: HookGroup[] = [];
    for (const g of groups) {
      const hooks = Array.isArray(g.hooks) ? g.hooks : [];
      const kept = hooks.filter((h) => {
        const owned = typeof h?.command === 'string' && h.command.includes(marker);
        if (owned) removed++;
        return !owned;
      });
      if (kept.length === 0 && hooks.length > 0) continue; // group existed only for us
      if (kept.length !== hooks.length) g.hooks = kept;
      keptGroups.push(g);
    }
    if (keptGroups.length === 0) delete table[event];
    else table[event] = keptGroups;
  }
  return removed;
}

/** Append our matcher groups. Callers must `removeOwned` first (idempotency). */
export function addEntries(table: HookTable, entries: readonly DesiredEntry[]): number {
  for (const e of entries) {
    const hook: HookCommand = { type: 'command', command: e.command };
    if (e.timeout !== undefined) hook.timeout = e.timeout;
    const group: HookGroup = e.matcher === undefined ? { hooks: [hook] } : { matcher: e.matcher, hooks: [hook] };
    const existing = asGroups(table[e.event]);
    table[e.event] = existing ? [...existing, group] : [group];
  }
  return entries.length;
}

/** Write `text` to `file` via tmp + rename, creating parent dirs. */
export function atomicWrite(file: string, text: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.herdr-gsd.${process.pid}.tmp`;
  try {
    const fd = openSync(tmp, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC, 0o600);
    try {
      writeSync(fd, text);
    } finally {
      closeSync(fd);
    }
    renameSync(tmp, file);
  } catch (err) {
    try {
      rmSync(tmp, { force: true });
    } catch {
      /* ignore */
    }
    throw err;
  }
}

/** One-time `.bak` beside the target, taken before our first modification. */
export function backupOnce(file: string): string | undefined {
  const bak = `${file}.bak`;
  if (!existsSync(file) || existsSync(bak)) return undefined;
  try {
    copyFileSync(file, bak);
    return bak;
  } catch {
    return undefined;
  }
}

export function readFileIfExists(file: string): string {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

export function homeOf(opts: { home?: string; env?: NodeJS.ProcessEnv }): string {
  if (opts.home) return opts.home;
  const env = opts.env ?? process.env;
  return env.HOME ?? env.USERPROFILE ?? '';
}

/** Probe `spoolDir` by creating it and writing a throwaway file. */
export function spoolDirFinding(spoolDir: string): DoctorFinding {
  const probe = path.join(spoolDir, `.herdr-gsd-doctor.${process.pid}`);
  try {
    mkdirSync(spoolDir, { recursive: true, mode: 0o700 });
    writeFileSync(probe, '');
    unlinkSync(probe);
    return { level: 'ok', message: `spool dir writable: ${spoolDir}` };
  } catch (err) {
    return { level: 'error', message: `spool dir not writable: ${spoolDir} (${(err as Error).message})` };
  }
}

/** Look for a `node` executable on PATH without spawning anything. */
export function nodeOnPathFinding(env: NodeJS.ProcessEnv = process.env): DoctorFinding {
  const raw = env.PATH ?? '';
  const names = process.platform === 'win32' ? ['node.exe', 'node.cmd', 'node'] : ['node'];
  for (const dir of raw.split(path.delimiter)) {
    if (!dir) continue;
    for (const n of names) {
      const p = path.join(dir, n);
      try {
        if (statSync(p).isFile()) return { level: 'ok', message: `node on PATH: ${p}` };
      } catch {
        /* next */
      }
    }
  }
  return { level: 'error', message: 'node not found on PATH — hook commands will fail' };
}

/** `existsSync` for the compiled hook script the installed command points at. */
export function hookScriptFinding(script: string): DoctorFinding {
  return existsSync(script)
    ? { level: 'ok', message: `hook script present: ${script}` }
    : { level: 'error', message: `hook script missing: ${script} — run \`npm run build\`` };
}

export function doctorOk(findings: readonly DoctorFinding[]): boolean {
  return !findings.some((f) => f.level === 'error');
}

/** Quote a path for a hook `command` string (hook commands are shell-parsed). */
export function q(p: string): string {
  return `"${p.replace(/"/g, '\\"')}"`;
}

export function hookTableOf(root: Record<string, unknown>): HookTable {
  const t = root.hooks;
  if (t && typeof t === 'object' && !Array.isArray(t)) return t as HookTable;
  return {};
}

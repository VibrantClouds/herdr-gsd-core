/**
 * Spool plumbing shared by every harness hook (spec §3.2, §12.5).
 *
 * SOURCE OF TRUTH. Copied verbatim into the codex/opencode adapters by
 * `scripts/copy-shared.cjs`. Node builtins only — a compiled hook must never
 * `require` another workspace package. The `ActivityEvent` shape here is a
 * deliberate structural duplicate of `packages/core/src/types.ts`; the emitted
 * JSON must stay byte-compatible with it.
 * Edit here, then run `node scripts/copy-shared.cjs`.
 */
import { createHash } from 'node:crypto';
import { closeSync, constants, mkdirSync, openSync, readSync, writeSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export type Harness = 'claude-code' | 'codex' | 'opencode' | 'other';

export type ActivityKind =
  | 'session.start'
  | 'session.stop'
  | 'subagent.start'
  | 'subagent.stop'
  | 'tool.pre'
  | 'tool.post'
  | 'compact.pre'
  | 'phase.boundary';

/** One JSONL line in the activity spool. Mirrors packages/core `ActivityEvent`. */
export interface ActivityEvent {
  v: 1;
  ts: number;
  harness: Harness;
  sessionId?: string;
  cwd: string;
  panePid?: number;
  paneId?: string;
  kind: ActivityKind;
  agent?: string;
  tool?: string;
  detail?: string;
}

/** Max bytes per spool line (spec §3.2); mirrors core `MAX_LINE_BYTES`. */
export const MAX_LINE_BYTES = 4096;

/** Fallback spool dir when neither `--spool` nor `HERDR_GSD_SPOOL_DIR` is set. */
export function defaultSpoolDir(home: string = os.homedir()): string {
  return path.join(home, '.local', 'state', 'herdr-gsd-core', 'spool');
}

/** First 12 hex of sha256 — must match `packages/core/src/hash.ts` `shortHash`. */
export function shortHash(input: string, len = 12): string {
  return createHash('sha256').update(input).digest('hex').slice(0, len);
}

/**
 * Spool dir precedence: `--spool <dir>` baked into the hook command by the
 * installer (hook commands are argv, not shells, so an env assignment prefix is
 * not available) → `HERDR_GSD_SPOOL_DIR` → `~/.local/state/herdr-gsd-core/spool`.
 */
export function resolveSpoolDir(argv: readonly string[], env: NodeJS.ProcessEnv = process.env, home?: string): string {
  for (let i = 0; i < argv.length - 1; i++) {
    if (argv[i] === '--spool') {
      const v = argv[i + 1];
      if (typeof v === 'string' && v.length > 0) return v;
    }
  }
  for (const a of argv) {
    if (typeof a === 'string' && a.startsWith('--spool=') && a.length > 8) return a.slice(8);
  }
  const fromEnv = env.HERDR_GSD_SPOOL_DIR;
  if (typeof fromEnv === 'string' && fromEnv.length > 0) return fromEnv;
  if (home !== undefined) return defaultSpoolDir(home);
  const h = env.HOME ?? env.USERPROFILE;
  return defaultSpoolDir(typeof h === 'string' && h.length > 0 ? h : os.homedir());
}

/** `<spoolDir>/<first 12 hex of sha256(cwd)>.jsonl`. */
export function spoolFileForCwd(spoolDir: string, cwd: string): string {
  return path.join(spoolDir, `${shortHash(cwd)}.jsonl`);
}

/** Build an `ActivityEvent` with the canonical field order. Never throws. */
export function makeEvent(
  harness: Harness,
  kind: ActivityKind,
  cwd: string,
  extra: { sessionId?: string; agent?: string; tool?: string; detail?: string } = {},
  env: NodeJS.ProcessEnv = process.env,
): ActivityEvent {
  const paneId = typeof env.HERDR_PANE_ID === 'string' && env.HERDR_PANE_ID.length > 0 ? env.HERDR_PANE_ID : undefined;
  const panePid = typeof process.ppid === 'number' && process.ppid > 0 ? process.ppid : undefined;
  return {
    v: 1,
    ts: Date.now(),
    harness,
    sessionId: extra.sessionId,
    cwd,
    panePid,
    paneId,
    kind,
    agent: extra.agent,
    tool: extra.tool,
    detail: extra.detail,
  };
}

/**
 * Append one event with a single `O_APPEND` `write(2)`, creating the spool dir
 * if missing. Never throws — hooks must exit 0 on every path.
 */
export function writeEventSync(spoolDir: string, ev: ActivityEvent): boolean {
  try {
    let line = JSON.stringify(ev);
    if (Buffer.byteLength(line) > MAX_LINE_BYTES) {
      line = JSON.stringify({ ...ev, detail: (ev.detail ?? '').slice(0, 100) });
      if (Buffer.byteLength(line) > MAX_LINE_BYTES) return false;
    }
    try {
      mkdirSync(spoolDir, { recursive: true, mode: 0o700 });
    } catch {
      /* already there, or unwritable — the open below decides */
    }
    const file = spoolFileForCwd(spoolDir, ev.cwd);
    const fd = openSync(file, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT, 0o600);
    try {
      writeSync(fd, `${line}\n`);
    } finally {
      closeSync(fd);
    }
    return true;
  } catch {
    return false;
  }
}

/** Read all of stdin synchronously. Returns '' on any error or when nothing is piped. */
export function readStdinSync(budgetMs = 1000): string {
  const started = Date.now();
  const chunks: Buffer[] = [];
  const buf = Buffer.alloc(65536);
  let total = 0;
  for (;;) {
    let n = 0;
    try {
      n = readSync(0, buf, 0, buf.length, null);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'EAGAIN' && Date.now() - started < budgetMs) continue;
      break;
    }
    if (n <= 0) break;
    chunks.push(Buffer.from(buf.subarray(0, n)));
    total += n;
    if (total > 4 * 1024 * 1024) break;
    if (Date.now() - started > budgetMs) break;
  }
  try {
    return Buffer.concat(chunks).toString('utf8');
  } catch {
    return '';
  }
}

/** Parse a hook payload. Malformed or non-object input yields undefined. */
export function parsePayload(text: string): Record<string, unknown> | undefined {
  const t = text.trim();
  if (!t) return undefined;
  try {
    const v: unknown = JSON.parse(t);
    if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
    return v as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/** Non-empty string field, else undefined. */
export function str(o: Record<string, unknown> | undefined, key: string): string | undefined {
  if (!o) return undefined;
  const v = o[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/** Object field, else undefined. */
export function obj(o: Record<string, unknown> | undefined, key: string): Record<string, unknown> | undefined {
  if (!o) return undefined;
  const v = o[key];
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

/** Arm the mandatory 2 s self-timeout (spec §12.5). */
export function armSelfTimeout(ms = 2000): void {
  try {
    setTimeout(() => process.exit(0), ms).unref();
  } catch {
    /* ignore */
  }
}

import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * GSD's statusline "context bridge" file (spike M0-G §4).
 *
 * `$P/hooks/gsd-statusline.js:808-827` writes `<os.tmpdir()>/claude-ctx-<session_id>.json`
 * on **every** statusline render with a bare `writeFileSync` — truncate-then-write,
 * no tmp+rename, no fsync — so a reader can catch a short/torn JSON. There is no
 * `version` field, no reaper, and nothing binds the file to a project; only to a
 * harness session id. Freshness is a consumer-side convention: GSD's own
 * `gsd-context-monitor.js:38` uses `STALE_SECONDS = 60`.
 *
 * Therefore this reader is strictly best-effort: every failure mode (missing,
 * short read, corrupt, stale, out-of-range) returns `undefined`.
 */
export interface ContextBridge {
  session_id: string;
  /** percent of the context window still available */
  remaining_percentage: number;
  /** raw `100 - remaining_percentage`, deliberately un-normalised (#2451) */
  used_pct: number;
  /** epoch **seconds**, not ms */
  timestamp: number;
}

export interface ContextReadOptions {
  /** override `os.tmpdir()` (tests) */
  tmpdir?: string;
  now?: () => number;
  /** GSD's own convention is 60 s */
  staleMs?: number;
  readFile?: (p: string) => Promise<string>;
}

/** GSD rejects session ids containing path separators or `..` before writing. */
export function isSafeSessionId(sessionId: string): boolean {
  return sessionId.length > 0 && !/[/\\]|\.\./.test(sessionId);
}

export function contextBridgePath(sessionId: string, dir = tmpdir()): string {
  return join(dir, `claude-ctx-${sessionId}.json`);
}

/** Read and validate the whole bridge record, or `undefined`. */
export async function readContextBridge(sessionId: string, opts: ContextReadOptions = {}): Promise<ContextBridge | undefined> {
  if (!isSafeSessionId(sessionId)) return undefined;
  const now = opts.now ?? Date.now;
  const staleMs = opts.staleMs ?? 60_000;
  const read = opts.readFile ?? ((p: string) => fs.readFile(p, 'utf8'));
  let text: string;
  try {
    text = await read(contextBridgePath(sessionId, opts.tmpdir ?? tmpdir()));
  } catch {
    return undefined; // missing / unreadable
  }
  let doc: unknown;
  try {
    doc = JSON.parse(text); // short read of a non-atomic write lands here
  } catch {
    return undefined;
  }
  if (typeof doc !== 'object' || doc === null) return undefined;
  const d = doc as Record<string, unknown>;
  const remaining = d['remaining_percentage'];
  const ts = d['timestamp'];
  if (typeof remaining !== 'number' || !Number.isFinite(remaining) || remaining < 0 || remaining > 100) return undefined;
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return undefined;
  if (now() - ts * 1000 > staleMs) return undefined;
  const used = d['used_pct'];
  return {
    session_id: typeof d['session_id'] === 'string' ? (d['session_id'] as string) : sessionId,
    remaining_percentage: remaining,
    used_pct: typeof used === 'number' && Number.isFinite(used) ? used : Math.round(100 - remaining),
    timestamp: ts,
  };
}

/**
 * Percent of context window **remaining** for a harness session, for the
 * `gsd_ctx` pane token (spec §3.3). `undefined` when missing, stale or corrupt.
 */
export async function readContextPercent(sessionId: string, opts: ContextReadOptions = {}): Promise<number | undefined> {
  const bridge = await readContextBridge(sessionId, opts);
  return bridge?.remaining_percentage;
}

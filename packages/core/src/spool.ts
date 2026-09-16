import { promises as fs, openSync, writeSync, closeSync, constants } from 'node:fs';
import { join } from 'node:path';
import type { ActivityEvent } from './types';

/** Max bytes per spool line (spec §3.2). */
export const MAX_LINE_BYTES = 4096;
/** Rotate at 5 MiB, keep 2 generations. */
export const ROTATE_BYTES = 5 * 1024 * 1024;
export const KEEP_GENERATIONS = 2;
/** Ignore events older than 24 h on cold start. */
export const COLD_START_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Append one event with a single O_APPEND write(2). Synchronous on purpose:
 * hook scripts call this and must exit within 200 ms; there is nothing to await.
 * Never throws (adapters must exit 0 on every path) — returns false on failure.
 */
export function appendEventSync(file: string, ev: ActivityEvent): boolean {
  try {
    let line = JSON.stringify(ev);
    if (Buffer.byteLength(line) > MAX_LINE_BYTES) {
      const trimmed = { ...ev, detail: (ev.detail ?? '').slice(0, 100) };
      line = JSON.stringify(trimmed);
      if (Buffer.byteLength(line) > MAX_LINE_BYTES) return false;
    }
    const fd = openSync(file, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT, 0o600);
    try {
      writeSync(fd, line + '\n');
    } finally {
      closeSync(fd);
    }
    return true;
  } catch {
    return false;
  }
}

export interface SpoolTailState {
  /** byte offset already consumed */
  offset: number;
  /** inode of the file the offset refers to (rotation detection) */
  ino?: number;
}

export interface TailResult {
  events: ActivityEvent[];
  state: SpoolTailState;
  /** lines that failed to parse (count only; never logged verbatim) */
  corrupt: number;
}

/**
 * Read new complete lines since `state.offset`. Handles rotation (inode change
 * or truncation → restart from 0). Partial trailing lines are left for next call.
 */
export async function tailSpool(file: string, state: SpoolTailState, now = Date.now()): Promise<TailResult> {
  let stat;
  try {
    stat = await fs.stat(file);
  } catch {
    return { events: [], state, corrupt: 0 };
  }
  let offset = state.offset;
  if (state.ino !== undefined && state.ino !== stat.ino) offset = 0;
  if (stat.size < offset) offset = 0;
  if (stat.size === offset) return { events: [], state: { offset, ino: stat.ino }, corrupt: 0 };

  const fh = await fs.open(file, 'r');
  let buf: Buffer;
  try {
    buf = Buffer.alloc(stat.size - offset);
    await fh.read(buf, 0, buf.length, offset);
  } finally {
    await fh.close();
  }
  const lastNl = buf.lastIndexOf(0x0a);
  if (lastNl < 0) return { events: [], state: { offset, ino: stat.ino }, corrupt: 0 };
  const text = buf.subarray(0, lastNl).toString('utf8');
  const events: ActivityEvent[] = [];
  let corrupt = 0;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const ev = parseEventLine(line);
    if (!ev) {
      corrupt++;
      continue;
    }
    if (state.offset === 0 && state.ino === undefined && now - ev.ts > COLD_START_MAX_AGE_MS) continue;
    events.push(ev);
  }
  return { events, state: { offset: offset + lastNl + 1, ino: stat.ino }, corrupt };
}

export function parseEventLine(line: string): ActivityEvent | undefined {
  try {
    const o = JSON.parse(line) as Partial<ActivityEvent>;
    if (!o || o.v !== 1 || typeof o.ts !== 'number' || typeof o.kind !== 'string' || typeof o.cwd !== 'string') return undefined;
    return o as ActivityEvent;
  } catch {
    return undefined;
  }
}

/** Rotate `file` → `file.1` → `file.2` when it exceeds ROTATE_BYTES. Returns true if rotated. */
export async function rotateIfNeeded(file: string): Promise<boolean> {
  let stat;
  try {
    stat = await fs.stat(file);
  } catch {
    return false;
  }
  if (stat.size < ROTATE_BYTES) return false;
  for (let g = KEEP_GENERATIONS; g >= 1; g--) {
    const from = g === 1 ? file : `${file}.${g - 1}`;
    const to = `${file}.${g}`;
    try {
      await fs.rename(from, to);
    } catch {
      /* missing generation is fine */
    }
  }
  return true;
}

/** Spool file path for a project root under a spool dir. */
export function spoolFileFor(spoolDir: string, projectHash: string): string {
  return join(spoolDir, `${projectHash}.jsonl`);
}

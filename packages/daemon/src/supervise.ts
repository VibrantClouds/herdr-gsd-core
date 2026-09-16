import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { controlCall } from './control';

/**
 * Daemon self-supervision (spec §2.2): pidfile + control-socket ping, stale
 * pidfile → restart, crash-loop guard (3 non-zero exits within 60 s →
 * `gsdd.disabled` with last stderr).
 */
export interface EnsureOptions {
  pidFile: string;
  controlSocket: string;
  disabledMarker: string;
  /** argv to spawn the daemon, e.g. [process.execPath, '/…/cli/dist/main.js', 'daemon', 'run'] */
  spawnArgv: string[];
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  /** how long to wait for the fresh daemon to answer ping */
  startTimeoutMs?: number;
  /** crash history file (defaults next to pidfile) */
  crashLogFile?: string;
  now?: () => number;
  isAlive?: (pid: number) => boolean;
  ping?: (socket: string) => Promise<boolean>;
  spawnFn?: (argv: string[], opts: { env?: NodeJS.ProcessEnv; cwd?: string; stderrFile: string }) => number | undefined;
  sleep?: (ms: number) => Promise<void>;
}

export type EnsureResult =
  | { status: 'running'; pid?: number; started: false }
  | { status: 'started'; pid: number; started: true }
  | { status: 'disabled'; reason: string; started: false }
  | { status: 'failed'; reason: string; started: false };

export function pidIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export async function pingControl(socket: string, timeoutMs = 1500): Promise<boolean> {
  try {
    const r = await controlCall<{ pong?: boolean }>(socket, 'ping', undefined, timeoutMs);
    return !!r && typeof r === 'object' && (r as { pong?: boolean }).pong === true;
  } catch {
    return false;
  }
}

export function readPid(pidFile: string): number | undefined {
  try {
    const n = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
    return Number.isInteger(n) && n > 0 ? n : undefined;
  } catch {
    return undefined;
  }
}

export function writePid(pidFile: string, pid: number): void {
  fs.mkdirSync(path.dirname(pidFile), { recursive: true });
  fs.writeFileSync(pidFile, `${pid}\n`);
}

interface CrashRecord {
  exits: number[];
}

function readCrashes(file: string): CrashRecord {
  try {
    const r = JSON.parse(fs.readFileSync(file, 'utf8')) as CrashRecord;
    return Array.isArray(r.exits) ? r : { exits: [] };
  } catch {
    return { exits: [] };
  }
}

/** Called by the daemon itself on abnormal exit paths (and by ensure when it observes a dead child). */
export function recordCrash(crashLogFile: string, now = Date.now()): number {
  const r = readCrashes(crashLogFile);
  r.exits = r.exits.filter((t) => now - t < 60_000);
  r.exits.push(now);
  fs.mkdirSync(path.dirname(crashLogFile), { recursive: true });
  fs.writeFileSync(crashLogFile, JSON.stringify(r));
  return r.exits.length;
}

export function clearCrashes(crashLogFile: string): void {
  try {
    fs.unlinkSync(crashLogFile);
  } catch {
    /* none */
  }
}

function defaultSpawn(argv: string[], opts: { env?: NodeJS.ProcessEnv; cwd?: string; stderrFile: string }): number | undefined {
  const [cmd, ...args] = argv;
  fs.mkdirSync(path.dirname(opts.stderrFile), { recursive: true });
  const err = fs.openSync(opts.stderrFile, 'a');
  try {
    const child = spawn(cmd!, args, { detached: true, stdio: ['ignore', 'ignore', err], env: opts.env, cwd: opts.cwd });
    child.unref();
    return child.pid;
  } finally {
    fs.closeSync(err);
  }
}

/**
 * Idempotently make sure a daemon is running for this socket. Safe to call
 * from every action/event command (spec §2.2).
 */
export async function ensureDaemon(opts: EnsureOptions): Promise<EnsureResult> {
  const now = opts.now ?? Date.now;
  const isAlive = opts.isAlive ?? pidIsAlive;
  const ping = opts.ping ?? pingControl;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const spawnFn = opts.spawnFn ?? defaultSpawn;
  const crashLog = opts.crashLogFile ?? path.join(path.dirname(opts.pidFile), 'gsdd.crashes.json');
  const stderrFile = path.join(path.dirname(opts.pidFile), 'gsdd.stderr.log');

  if (fs.existsSync(opts.disabledMarker)) {
    let reason = 'crash loop';
    try {
      reason = fs.readFileSync(opts.disabledMarker, 'utf8').split('\n')[0] || reason;
    } catch {
      /* keep */
    }
    return { status: 'disabled', reason, started: false };
  }

  const pid = readPid(opts.pidFile);
  if (pid !== undefined && isAlive(pid)) {
    if (await ping(opts.controlSocket)) return { status: 'running', pid, started: false };
    // alive but not answering: give it a moment (it may be starting), then treat as hung
    await sleep(500);
    if (await ping(opts.controlSocket)) return { status: 'running', pid, started: false };
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      /* gone */
    }
    await sleep(200);
    if (isAlive(pid)) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        /* gone */
      }
    }
  } else if (pid === undefined && (await ping(opts.controlSocket))) {
    // no pidfile but something answers: adopt it
    return { status: 'running', started: false };
  }

  // stale pidfile or dead daemon → (re)start, subject to the crash-loop guard
  const crashes = readCrashes(crashLog).exits.filter((t) => now() - t < 60_000);
  if (crashes.length >= 3) {
    let tail = '';
    try {
      const s = fs.readFileSync(stderrFile, 'utf8');
      tail = s.slice(-2000);
    } catch {
      /* none */
    }
    fs.mkdirSync(path.dirname(opts.disabledMarker), { recursive: true });
    fs.writeFileSync(opts.disabledMarker, `gsdd exited non-zero 3x within 60s; see herdr plugin log list\n${tail}`);
    return { status: 'disabled', reason: 'crash loop', started: false };
  }

  try {
    fs.unlinkSync(opts.pidFile);
  } catch {
    /* none */
  }
  const childPid = spawnFn(opts.spawnArgv, { env: opts.env, cwd: opts.cwd, stderrFile });
  if (!childPid) return { status: 'failed', reason: 'spawn failed', started: false };
  writePid(opts.pidFile, childPid);

  const deadline = now() + (opts.startTimeoutMs ?? 5000);
  while (now() < deadline) {
    if (await ping(opts.controlSocket)) return { status: 'started', pid: childPid, started: true };
    if (!isAlive(childPid)) {
      const n = recordCrash(crashLog, now());
      return { status: 'failed', reason: `daemon exited during startup (${n}/3 recent exits)`, started: false };
    }
    await sleep(100);
  }
  return { status: 'failed', reason: 'daemon did not answer ping in time', started: false };
}

/** Ask a running daemon to stop; falls back to signals. */
export async function stopDaemon(opts: Pick<EnsureOptions, 'pidFile' | 'controlSocket' | 'isAlive' | 'sleep'>): Promise<boolean> {
  const isAlive = opts.isAlive ?? pidIsAlive;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const pid = readPid(opts.pidFile);
  try {
    await controlCall(opts.controlSocket, 'shutdown', undefined, 1500);
  } catch {
    /* not listening */
  }
  if (pid === undefined) return true;
  for (let i = 0; i < 20 && isAlive(pid); i++) await sleep(100);
  if (isAlive(pid)) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      /* gone */
    }
    for (let i = 0; i < 10 && isAlive(pid); i++) await sleep(100);
  }
  if (isAlive(pid)) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      /* gone */
    }
  }
  try {
    fs.unlinkSync(opts.pidFile);
  } catch {
    /* none */
  }
  return !isAlive(pid);
}

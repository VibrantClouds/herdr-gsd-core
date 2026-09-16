import * as fs from 'node:fs';
import * as path from 'node:path';
import { EventEmitter } from 'node:events';

/**
 * Recursive watcher for one `.planning/` directory (spec §4.2).
 * - fs.watch({recursive:true}) on Linux (Node ≥ 20) and macOS.
 * - Falls back to 2 s mtime polling on EMFILE / ERR_FEATURE_UNAVAILABLE_ON_PLATFORM.
 * - Debounce 300 ms; ignores `*.lock`, `graphs/**`, `*.tmp`, `.git`.
 * Emits `change` with the set of relative paths seen in the batch (may be empty
 * when the platform gives no filename) and `mode` ('watch'|'poll') on start.
 */
export interface WatcherOptions {
  debounceMs?: number;
  pollMs?: number;
  /** force polling (tests / user config) */
  forcePoll?: boolean;
  ignore?: (rel: string) => boolean;
}

export const defaultIgnore = (rel: string): boolean => {
  const norm = rel.split(path.sep).join('/');
  if (norm.endsWith('.lock') || norm.endsWith('.tmp') || norm.endsWith('~')) return true;
  if (norm === 'graphs' || norm.startsWith('graphs/')) return true;
  if (norm === '.git' || norm.startsWith('.git/')) return true;
  if (norm.startsWith('.') && norm.includes('.swp')) return true;
  return false;
};

export class PlanningWatcher extends EventEmitter {
  private fsWatcher?: fs.FSWatcher;
  private pollTimer?: NodeJS.Timeout;
  private debounceTimer?: NodeJS.Timeout;
  private pending = new Set<string>();
  private lastPoll = new Map<string, number>();
  private readonly debounceMs: number;
  private readonly pollMs: number;
  private readonly ignore: (rel: string) => boolean;
  mode: 'watch' | 'poll' | 'stopped' = 'stopped';

  constructor(
    readonly dir: string,
    opts: WatcherOptions = {},
  ) {
    super();
    this.debounceMs = opts.debounceMs ?? 300;
    this.pollMs = opts.pollMs ?? 2000;
    this.ignore = opts.ignore ?? defaultIgnore;
    if (opts.forcePoll) this.mode = 'poll';
  }

  start(): void {
    if (this.mode === 'poll') {
      this.startPolling();
      return;
    }
    if (!fs.existsSync(this.dir)) {
      this.emit('watch-error', new Error(`watch target missing: ${this.dir}`));
      this.startPolling();
      return;
    }
    try {
      this.fsWatcher = fs.watch(this.dir, { recursive: true, persistent: false }, (_ev, filename) => {
        const rel = filename ? String(filename) : '';
        if (rel && this.ignore(rel)) return;
        this.queue(rel);
      });
      this.fsWatcher.on('error', (e) => {
        this.emit('watch-error', e);
        this.fsWatcher?.close();
        this.fsWatcher = undefined;
        this.startPolling();
      });
      this.mode = 'watch';
      this.emit('mode', 'watch');
    } catch (e) {
      this.emit('watch-error', e);
      this.startPolling();
    }
  }

  stop(): void {
    this.fsWatcher?.close();
    this.fsWatcher = undefined;
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = undefined;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = undefined;
    this.mode = 'stopped';
  }

  /** Trigger a change batch manually (used after resync). */
  poke(rel = ''): void {
    this.queue(rel);
  }

  private queue(rel: string): void {
    if (rel) this.pending.add(rel);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = undefined;
      const batch = [...this.pending];
      this.pending.clear();
      this.emit('change', batch);
    }, this.debounceMs);
    this.debounceTimer.unref?.();
  }

  private startPolling(): void {
    this.mode = 'poll';
    this.emit('mode', 'poll');
    void this.pollOnce(true);
    this.pollTimer = setInterval(() => void this.pollOnce(false), this.pollMs);
    this.pollTimer.unref?.();
  }

  private async pollOnce(initial: boolean): Promise<void> {
    const seen = new Map<string, number>();
    const walk = (dir: string, relBase: string, depth: number) => {
      if (depth > 6) return;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const rel = relBase ? `${relBase}/${e.name}` : e.name;
        if (this.ignore(rel)) continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full, rel, depth + 1);
        else {
          try {
            seen.set(rel, fs.statSync(full).mtimeMs);
          } catch {
            /* vanished */
          }
        }
      }
    };
    walk(this.dir, '', 0);
    if (!initial) {
      for (const [rel, m] of seen) if (this.lastPoll.get(rel) !== m) this.queue(rel);
      for (const rel of this.lastPoll.keys()) if (!seen.has(rel)) this.queue(rel);
    }
    this.lastPoll = seen;
  }
}

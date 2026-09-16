import { promises as fs } from 'node:fs';
import * as path from 'node:path';

/**
 * Monotonic per-resource sequence counters (spec §2.3.3). Persisted to
 * `seq.json` so a restarted daemon never re-uses a seq Herdr already saw.
 * Writes are debounced; `flush()` forces one.
 *
 * Herdr silently drops reports whose seq is <= its server-side high-water mark
 * for (resource, source), and never exposes that mark (spike M0-H §5). To
 * survive a lost/corrupt seq.json the counter is wall-clock derived:
 * next = max(prev + 1, now()). Restarts therefore always move forward.
 */
export class SeqStore {
  private counters = new Map<string, number>();
  private dirty = false;
  private timer?: NodeJS.Timeout;
  private writing: Promise<void> = Promise.resolve();

  constructor(
    private readonly file: string,
    private readonly flushDelayMs = 250,
    private readonly now: () => number = Date.now,
  ) {}

  async load(): Promise<void> {
    try {
      const raw = JSON.parse(await fs.readFile(this.file, 'utf8')) as Record<string, number>;
      for (const [k, v] of Object.entries(raw)) if (Number.isInteger(v) && v >= 0) this.counters.set(k, v);
    } catch {
      /* first run or corrupt: start at 0 */
    }
  }

  /** Next seq for a resource key such as `workspace:ws-1` or `pane:p-3`. */
  next(key: string): number {
    const n = Math.max((this.counters.get(key) ?? 0) + 1, this.now());
    this.counters.set(key, n);
    this.dirty = true;
    this.schedule();
    return n;
  }

  current(key: string): number {
    return this.counters.get(key) ?? 0;
  }

  keys(): string[] {
    return [...this.counters.keys()];
  }

  private schedule(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.flush();
    }, this.flushDelayMs);
    this.timer.unref?.();
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (!this.dirty) return this.writing;
    this.dirty = false;
    const snapshot = Object.fromEntries(this.counters);
    this.writing = this.writing.then(async () => {
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(snapshot));
      await fs.rename(tmp, this.file);
    });
    return this.writing;
  }
}

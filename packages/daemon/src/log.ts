import * as fs from 'node:fs';
import * as path from 'node:path';

export type Level = 'debug' | 'info' | 'warn' | 'error';
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface LoggerOptions {
  file?: string;
  level?: Level;
  /** rotate when the file exceeds this many bytes (spec: 5 MiB) */
  maxBytes?: number;
  /** generations to keep (spec: 3) */
  keep?: number;
  /** also mirror to stderr */
  stderr?: boolean;
  now?: () => Date;
}

/**
 * Minimal synchronous rotating file logger. Synchronous so log lines survive a
 * crash right after they are written; volume is tiny.
 */
export class Logger {
  private readonly file?: string;
  private readonly level: number;
  private readonly maxBytes: number;
  private readonly keep: number;
  private readonly stderr: boolean;
  private readonly now: () => Date;
  private size = 0;

  constructor(opts: LoggerOptions = {}) {
    this.file = opts.file;
    this.level = ORDER[opts.level ?? 'info'];
    this.maxBytes = opts.maxBytes ?? 5 * 1024 * 1024;
    this.keep = opts.keep ?? 3;
    this.stderr = opts.stderr ?? false;
    this.now = opts.now ?? (() => new Date());
    if (this.file) {
      try {
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        this.size = fs.statSync(this.file).size;
      } catch {
        this.size = 0;
      }
    }
  }

  child(prefix: string): Logger {
    const parent = this;
    const c = Object.create(this) as Logger;
    c.log = (level: Level, msg: string, data?: unknown) => parent.log(level, `[${prefix}] ${msg}`, data);
    return c;
  }

  debug(msg: string, data?: unknown): void {
    this.log('debug', msg, data);
  }
  info(msg: string, data?: unknown): void {
    this.log('info', msg, data);
  }
  warn(msg: string, data?: unknown): void {
    this.log('warn', msg, data);
  }
  error(msg: string, data?: unknown): void {
    this.log('error', msg, data);
  }

  log(level: Level, msg: string, data?: unknown): void {
    if (ORDER[level] < this.level) return;
    let extra = '';
    if (data !== undefined) {
      try {
        extra = ' ' + (data instanceof Error ? `${data.name}: ${data.message}` : JSON.stringify(data));
      } catch {
        extra = ' [unserializable]';
      }
    }
    const line = `${this.now().toISOString()} ${level.padEnd(5)} ${msg}${extra}\n`;
    if (this.stderr) process.stderr.write(line);
    if (!this.file) return;
    try {
      if (this.size + line.length > this.maxBytes) this.rotate();
      fs.appendFileSync(this.file, line);
      this.size += Buffer.byteLength(line);
    } catch {
      /* logging must never throw */
    }
  }

  private rotate(): void {
    if (!this.file) return;
    for (let g = this.keep - 1; g >= 1; g--) {
      const from = g === 1 ? this.file : `${this.file}.${g - 1}`;
      const to = `${this.file}.${g}`;
      try {
        fs.renameSync(from, to);
      } catch {
        /* ignore */
      }
    }
    this.size = 0;
  }
}

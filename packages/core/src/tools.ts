import { promises as fs } from 'node:fs';
import { join, delimiter } from 'node:path';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';

/**
 * Locate `gsd-tools` for a project. GSD-Core can be installed per-project or
 * globally, so the search order is (owner decision, PLANNING.md):
 *   1. HERDR_GSD_TOOLS (absolute path to gsd-tools.cjs) if set and present
 *   2. <root>/.claude/gsd-core/bin/gsd-tools.cjs          (project-local Claude install)
 *   3. <root>/.codex/gsd-core/bin, <root>/.opencode/gsd-core/bin (project-local other harnesses)
 *   4. <root>/node_modules/@opengsd/gsd-core/gsd-core/bin/gsd-tools.cjs
 *   5. config roots: $CLAUDE_CONFIG_DIR, ~/.claude, ~/.claude-gsd, $CODEX_HOME, ~/.codex, $XDG_CONFIG_HOME/opencode
 *   6. <root>/node_modules/.bin/gsd-tools
 *   7. PATH (`gsd-tools`)
 */
export interface ToolsLocation {
  /** argv prefix: e.g. ['node', '/x/gsd-tools.cjs'] or ['gsd-tools'] */
  argv: string[];
  /** where it was found (for diagnostics) */
  source: string;
}

export interface ResolveOptions {
  env?: NodeJS.ProcessEnv;
  home?: string;
  exists?: (p: string) => Promise<boolean>;
  nodeBin?: string;
}

async function defaultExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export function configRoots(env: NodeJS.ProcessEnv, home: string): string[] {
  const roots: string[] = [];
  if (env.CLAUDE_CONFIG_DIR) roots.push(env.CLAUDE_CONFIG_DIR);
  roots.push(join(home, '.claude'), join(home, '.claude-gsd'));
  if (env.CODEX_HOME) roots.push(env.CODEX_HOME);
  roots.push(join(home, '.codex'));
  const xdg = env.XDG_CONFIG_HOME ?? join(home, '.config');
  roots.push(join(xdg, 'opencode'));
  return [...new Set(roots)];
}

export async function resolveGsdTools(root: string, opts: ResolveOptions = {}): Promise<ToolsLocation | undefined> {
  const env = opts.env ?? process.env;
  const home = opts.home ?? homedir();
  const exists = opts.exists ?? defaultExists;
  const nodeBin = opts.nodeBin ?? process.execPath;

  if (env.HERDR_GSD_TOOLS && (await exists(env.HERDR_GSD_TOOLS))) {
    return { argv: [nodeBin, env.HERDR_GSD_TOOLS], source: 'HERDR_GSD_TOOLS' };
  }
  const cjsCandidates: Array<[string, string]> = [
    [join(root, '.claude', 'gsd-core', 'bin', 'gsd-tools.cjs'), 'project:.claude'],
    [join(root, '.codex', 'gsd-core', 'bin', 'gsd-tools.cjs'), 'project:.codex'],
    [join(root, '.opencode', 'gsd-core', 'bin', 'gsd-tools.cjs'), 'project:.opencode'],
    [join(root, 'node_modules', '@opengsd', 'gsd-core', 'gsd-core', 'bin', 'gsd-tools.cjs'), 'project:node_modules'],
  ];
  for (const r of configRoots(env, home)) {
    cjsCandidates.push([join(r, 'gsd-core', 'bin', 'gsd-tools.cjs'), `global:${r}`]);
  }
  for (const [p, source] of cjsCandidates) {
    if (await exists(p)) return { argv: [nodeBin, p], source };
  }
  const binShim = join(root, 'node_modules', '.bin', 'gsd-tools');
  if (await exists(binShim)) return { argv: [binShim], source: 'project:node_modules/.bin' };
  for (const dir of (env.PATH ?? '').split(delimiter)) {
    if (!dir) continue;
    const p = join(dir, 'gsd-tools');
    if (await exists(p)) return { argv: [p], source: 'PATH' };
  }
  return undefined;
}

export interface RunResult {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  /** parsed JSON stdout when it parses */
  json?: unknown;
}

export interface RunOptions {
  cwd: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}

/** Run gsd-tools once. 10 s timeout (spec §3.1). Never throws. */
export function runGsdTools(loc: ToolsLocation, args: string[], opts: RunOptions): Promise<RunResult> {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  return new Promise((resolve) => {
    const [cmd, ...pre] = loc.argv;
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let child;
    try {
      child = spawn(cmd!, [...pre, ...args], { cwd: opts.cwd, env: opts.env ?? process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      resolve({ ok: false, code: null, stdout: '', stderr: String(e), timedOut: false });
      return;
    }
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ ok: false, code: null, stdout, stderr: stderr + String(e), timedOut });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      let json: unknown;
      const t = stdout.trim();
      if (t.startsWith('{') || t.startsWith('[')) {
        try {
          json = JSON.parse(t);
        } catch {
          /* not json */
        }
      }
      resolve({ ok: code === 0 && !timedOut, code, stdout, stderr, timedOut, json });
    });
  });
}

/**
 * Per-project throttle: invocations >= `minGapMs` apart (spec: 2 s). Calls made
 * inside the gap are delayed, and identical concurrent calls are coalesced.
 */
export class ThrottledRunner {
  private lastAt = 0;
  private chain: Promise<unknown> = Promise.resolve();
  private inflight = new Map<string, Promise<RunResult>>();

  constructor(
    private readonly loc: ToolsLocation,
    private readonly cwd: string,
    private readonly minGapMs = 2000,
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
    private readonly runner: typeof runGsdTools = runGsdTools,
  ) {}

  run(args: string[], timeoutMs?: number): Promise<RunResult> {
    const key = args.join('\t');
    const existing = this.inflight.get(key);
    if (existing) return existing;
    const p = this.chain.then(async () => {
      const wait = this.lastAt + this.minGapMs - this.now();
      if (wait > 0) await this.sleep(wait);
      this.lastAt = this.now();
      return this.runner(this.loc, args, { cwd: this.cwd, timeoutMs });
    });
    this.chain = p.catch(() => undefined);
    this.inflight.set(key, p);
    void p.finally(() => this.inflight.delete(key)).catch(() => undefined);
    return p;
  }
}

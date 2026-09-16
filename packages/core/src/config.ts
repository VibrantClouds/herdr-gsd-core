import { promises as fs } from 'node:fs';
import { parse as parseToml } from 'smol-toml';

/** Plugin config, `$HERDR_PLUGIN_CONFIG_DIR/config.toml` (spec §3.4). */
export interface PluginConfig {
  projects: { autodiscover: boolean; ignore: string[] };
  notify: {
    phase_boundary: boolean;
    blocked: boolean;
    uat_ready: boolean;
    drift: boolean;
    quiet_when_focused: boolean;
    sound: 'none' | 'done' | 'request';
  };
  views: { enabled: boolean };
  /** `env` is applied to the pane an orchestrated (non-isolated) run splits; e.g. `CLAUDE_CONFIG_DIR` for a GSD-specific Claude config root */
  harness: Record<string, { command: string[]; prompt_flag: string[]; env?: Record<string, string> }>;
  orchestration: {
    enabled: boolean;
    /** harness name (a `[harness.<name>]` table) started for orchestrated runs */
    harness: string;
    worktree_branch_prefix: string;
    /** active runs across *different* repositories; one repository never runs more than one */
    max_parallel: number;
    confirm_prompt_to_foreign_pane: boolean;
    /** `gsd-workspace` was dropped (spike M4 G2): it creates a new, unrelated project */
    isolation: 'worktree' | 'none';
    /** how long a freshly started harness may take to reach idle before the run is marked waiting */
    start_timeout_ms: number;
    /** `pane.split` direction for non-isolated runs */
    split_direction: 'right' | 'down';
    autonomous: {
      /** re-launch a *dead* autonomous session with GSD's own resume command */
      resume_on_exit: boolean;
      max_resumes: number;
      max_wall_clock_min: number;
    };
  };
  /** log level for gsdd.log */
  log: { level: 'debug' | 'info' | 'warn' | 'error' };
}

export const DEFAULT_CONFIG: PluginConfig = {
  projects: { autodiscover: true, ignore: ['**/node_modules/**'] },
  notify: { phase_boundary: true, blocked: true, uat_ready: true, drift: false, quiet_when_focused: true, sound: 'done' },
  views: { enabled: false },
  harness: {
    'claude-code': { command: ['claude'], prompt_flag: [] },
    codex: { command: ['codex'], prompt_flag: [] },
    opencode: { command: ['opencode'], prompt_flag: [] },
  },
  orchestration: {
    enabled: false,
    harness: 'claude-code',
    worktree_branch_prefix: 'gsd/',
    max_parallel: 3,
    confirm_prompt_to_foreign_pane: true,
    isolation: 'worktree',
    start_timeout_ms: 60_000,
    split_direction: 'right',
    autonomous: { resume_on_exit: false, max_resumes: 3, max_wall_clock_min: 480 },
  },
  log: { level: 'info' },
};

export const DEFAULT_CONFIG_TOML = `# herdr-gsd-core plugin config (all keys optional; defaults shown)
[projects]
autodiscover = true              # scan workspace cwd (and parents up to git root) for .planning
ignore = ["**/node_modules/**"]

[notify]
phase_boundary = true            # phase status changed
blocked = true                   # GSD driver pane became blocked AND gsd_status != complete
uat_ready = true                 # a new *-UAT.md appeared
drift = false                    # state sync --verify reports drift
quiet_when_focused = true        # suppress when the pane is focused
sound = "done"                   # none|done|request

[views]
enabled = false                  # apply the "gsd" agent view (replaces your current view)

[harness.claude-code]
command = ["claude"]
# [harness.claude-code.env]
# CLAUDE_CONFIG_DIR = "/home/me/.claude-gsd"   # env for the pane a run splits (not applied to worktree panes)
[harness.codex]
command = ["codex"]
[harness.opencode]
command = ["opencode"]

[orchestration]
enabled = false                  # M4: orchestrate-phase / -phase-isolated / -autonomous actions
harness = "claude-code"          # which [harness.*] table to start for runs
worktree_branch_prefix = "gsd/"  # used when the project's git.branching_strategy is "none"
max_parallel = 3                 # active runs across different repositories (one per repository, always)
confirm_prompt_to_foreign_pane = true
isolation = "worktree"           # worktree|none  (gsd-workspace creates a new project; not supported)
start_timeout_ms = 60000         # harness must reach idle within this, else the run waits for you
split_direction = "right"        # right|down for non-isolated runs

[orchestration.autonomous]
resume_on_exit = false           # re-launch a dead /gsd-autonomous session with GSD's own resume command
max_resumes = 3
max_wall_clock_min = 480

[log]
level = "info"                   # debug|info|warn|error
`;

export interface LoadedConfig {
  config: PluginConfig;
  /** problems found while merging (unknown keys, wrong types); config still usable */
  warnings: string[];
  /** true when the file did not exist */
  missing: boolean;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/**
 * Deep-merge a parsed TOML document over defaults. Type mismatches keep the
 * default and add a warning. Unknown keys are warned about but ignored.
 * Exception: `[harness.<name>]` accepts arbitrary harness names.
 */
export function mergeConfig(doc: unknown, warnings: string[] = []): { config: PluginConfig; warnings: string[] } {
  const cfg = clone(DEFAULT_CONFIG);
  if (!isObj(doc)) return { config: cfg, warnings: [...warnings, 'config.toml: top level is not a table'] };
  const walk = (target: Record<string, unknown>, src: Record<string, unknown>, pathPrefix: string, allowNew: boolean) => {
    for (const [k, v] of Object.entries(src)) {
      const p = pathPrefix ? `${pathPrefix}.${k}` : k;
      if (/^harness\.[^.]+\.env$/.test(p)) {
        if (isObj(v) && Object.values(v).every((x) => typeof x === 'string')) target[k] = { ...v };
        else warnings.push(`config.toml: ${p} should be a table of strings`);
        continue;
      }
      if (!(k in target)) {
        if (allowNew && isObj(v)) {
          const fresh: Record<string, unknown> = { command: [k], prompt_flag: [] };
          target[k] = fresh;
          walk(fresh, v, p, false);
        } else warnings.push(`config.toml: unknown key ${p}`);
        continue;
      }
      const cur = target[k];
      if (isObj(cur)) {
        if (isObj(v)) walk(cur, v, p, p === 'harness');
        else warnings.push(`config.toml: ${p} should be a table`);
      } else if (Array.isArray(cur)) {
        if (Array.isArray(v) && v.every((x) => typeof x === 'string')) target[k] = v;
        else warnings.push(`config.toml: ${p} should be an array of strings`);
      } else if (typeof cur === typeof v) {
        target[k] = v;
      } else {
        warnings.push(`config.toml: ${p} should be ${typeof cur}`);
      }
    }
  };
  walk(cfg as unknown as Record<string, unknown>, doc, '', false);
  const enumCheck = <T extends string>(val: T, allowed: readonly T[], key: string, fallback: T): T => {
    if (!allowed.includes(val)) {
      warnings.push(`config.toml: ${key} must be one of ${allowed.join('|')}`);
      return fallback;
    }
    return val;
  };
  cfg.notify.sound = enumCheck(cfg.notify.sound, ['none', 'done', 'request'], 'notify.sound', 'done');
  if ((cfg.orchestration.isolation as string) === 'gsd-workspace') {
    warnings.push('config.toml: orchestration.isolation "gsd-workspace" is not supported (it creates a new, unrelated GSD project); using "worktree"');
    cfg.orchestration.isolation = 'worktree';
  }
  cfg.orchestration.isolation = enumCheck(cfg.orchestration.isolation, ['worktree', 'none'], 'orchestration.isolation', 'worktree');
  cfg.orchestration.split_direction = enumCheck(cfg.orchestration.split_direction, ['right', 'down'], 'orchestration.split_direction', 'right');
  if (!(cfg.orchestration.harness in cfg.harness)) {
    warnings.push(`config.toml: orchestration.harness "${cfg.orchestration.harness}" has no [harness.${cfg.orchestration.harness}] table; using claude-code`);
    cfg.orchestration.harness = 'claude-code';
  }
  for (const [key, min] of [['start_timeout_ms', 3001], ['max_parallel', 1]] as const) {
    const v = cfg.orchestration[key];
    if (!Number.isInteger(v) || v < min) {
      warnings.push(`config.toml: orchestration.${key} must be an integer ≥ ${min}`);
      cfg.orchestration[key] = DEFAULT_CONFIG.orchestration[key];
    }
  }
  for (const key of ['max_resumes', 'max_wall_clock_min'] as const) {
    const v = cfg.orchestration.autonomous[key];
    if (!Number.isInteger(v) || v < 0) {
      warnings.push(`config.toml: orchestration.autonomous.${key} must be a non-negative integer`);
      cfg.orchestration.autonomous[key] = DEFAULT_CONFIG.orchestration.autonomous[key];
    }
  }
  cfg.log.level = enumCheck(cfg.log.level, ['debug', 'info', 'warn', 'error'], 'log.level', 'info');
  return { config: cfg, warnings };
}

export function parseConfigToml(text: string): { config: PluginConfig; warnings: string[] } {
  let doc: unknown;
  try {
    doc = parseToml(text);
  } catch (e) {
    return { config: clone(DEFAULT_CONFIG), warnings: [`config.toml: parse error: ${(e as Error).message}`] };
  }
  return mergeConfig(doc);
}

/** Load config; if the file is missing, defaults apply and `missing = true` (caller may seed it). */
export async function loadConfig(file: string): Promise<LoadedConfig> {
  let text: string;
  try {
    text = await fs.readFile(file, 'utf8');
  } catch {
    return { config: clone(DEFAULT_CONFIG), warnings: [], missing: true };
  }
  return { ...parseConfigToml(text), missing: false };
}

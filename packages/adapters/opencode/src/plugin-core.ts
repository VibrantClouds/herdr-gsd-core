/**
 * OpenCode plugin core (spec §5.3, docs/spikes/M0-A-hooks.md §3).
 *
 * Split out of plugin.ts because that file uses `export =` (CommonJS default
 * export), which TypeScript forbids alongside named exports.
 */
import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { makeEvent, resolveSpoolDir, writeEventSync } from './emit';
import type { ActivityKind } from './emit';
import { agentFromToolInput, isAgentTool, redactDetail } from './redact';

/** Name of the sibling config file the installer writes next to this plugin. */
export const CONFIG_FILENAME = 'herdr-gsd-core.config.json';

export interface PluginContext {
  directory?: string;
  worktree?: string;
  client?: unknown;
  project?: { worktree?: string; directory?: string };
}

interface BusEvent {
  type?: string;
  properties?: Record<string, unknown>;
}

interface ToolInput {
  tool?: string;
  sessionID?: string;
  callID?: string;
  args?: Record<string, unknown>;
}

interface ToolOutput {
  args?: Record<string, unknown>;
  output?: unknown;
  metadata?: unknown;
  title?: string;
}

export interface PluginHooks {
  event: (e?: { event?: BusEvent }) => Promise<void>;
  'tool.execute.before': (input?: ToolInput, output?: ToolOutput) => Promise<void>;
  'tool.execute.after': (input?: ToolInput, output?: ToolOutput) => Promise<void>;
}

/** `HERDR_GSD_SPOOL_DIR` → sibling config file `spoolDir` → default. */
export function readSpoolDir(dir: string, env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.HERDR_GSD_SPOOL_DIR;
  if (typeof fromEnv === 'string' && fromEnv.length > 0) return fromEnv;
  try {
    const f = path.join(dir, CONFIG_FILENAME);
    if (existsSync(f)) {
      const parsed: unknown = JSON.parse(readFileSync(f, 'utf8'));
      if (parsed && typeof parsed === 'object') {
        const v = (parsed as Record<string, unknown>).spoolDir;
        if (typeof v === 'string' && v.length > 0) return v;
      }
    }
  } catch {
    /* fall through to the default */
  }
  return resolveSpoolDir([], env);
}

function sessionIdOf(props: Record<string, unknown> | undefined): string | undefined {
  if (!props) return undefined;
  const direct = props.sessionID;
  if (typeof direct === 'string' && direct.length > 0) return direct;
  const info = props.info;
  if (info && typeof info === 'object') {
    const id = (info as Record<string, unknown>).id;
    if (typeof id === 'string' && id.length > 0) return id;
  }
  return undefined;
}

function directoryOf(props: Record<string, unknown> | undefined): string | undefined {
  const info = props?.info;
  if (info && typeof info === 'object') {
    const d = (info as Record<string, unknown>).directory;
    if (typeof d === 'string' && d.length > 0) return d;
  }
  return undefined;
}

/**
 * Build the hook handlers. Exported for tests; `configDir` is where the sibling
 * config file lives (`__dirname` at runtime).
 */
export function createHooks(ctx: PluginContext, configDir: string, env: NodeJS.ProcessEnv = process.env): PluginHooks {
  let cwd = ctx.directory ?? ctx.worktree ?? ctx.project?.directory ?? ctx.project?.worktree ?? process.cwd();
  let spoolDir: string | undefined;
  let session: string | undefined;

  const emit = (kind: ActivityKind, extra: { sessionId?: string; agent?: string; tool?: string; detail?: string }): void => {
    try {
      if (spoolDir === undefined) spoolDir = readSpoolDir(configDir, env);
      writeEventSync(spoolDir, makeEvent('opencode', kind, cwd, { sessionId: extra.sessionId ?? session, ...extra }, env));
    } catch {
      /* never throw out of a plugin handler */
    }
  };

  const toolCall = (kind: 'tool.pre' | 'tool.post', input?: ToolInput, output?: ToolOutput): void => {
    try {
      const tool = typeof input?.tool === 'string' ? input.tool : undefined;
      // Spike §3: args live on `output.args` in `.before` and `input.args` in `.after`.
      const args = (kind === 'tool.pre' ? output?.args ?? input?.args : input?.args ?? output?.args) ?? {};
      const detail = redactDetail(tool, args, cwd);
      const agent = isAgentTool(tool) ? agentFromToolInput(args) : undefined;
      const sessionId = typeof input?.sessionID === 'string' ? input.sessionID : undefined;
      emit(kind, { sessionId, tool, detail, agent });
      if (isAgentTool(tool)) emit(kind === 'tool.pre' ? 'subagent.start' : 'subagent.stop', { sessionId, tool, agent, detail });
    } catch {
      /* never throw out of a plugin handler */
    }
  };

  return {
    event: async ({ event }: { event?: BusEvent } = {}): Promise<void> => {
      try {
        const type = event?.type;
        const props = event?.properties;
        if (type === 'session.created') {
          const dir = directoryOf(props);
          if (dir) cwd = dir;
          session = sessionIdOf(props) ?? session;
          emit('session.start', { sessionId: session });
          return;
        }
        if (type === 'session.idle') {
          emit('session.stop', { sessionId: sessionIdOf(props) ?? session });
          return;
        }
        if (type === 'session.compacted' || type === 'experimental.session.compacting') {
          emit('compact.pre', { sessionId: sessionIdOf(props) ?? session });
          return;
        }
        // tool.execute.* also appear on the bus; they are handled by the
        // dedicated two-argument handlers below, so ignore them here.
      } catch {
        /* never throw out of a plugin handler */
      }
    },
    'tool.execute.before': async (input?: ToolInput, output?: ToolOutput): Promise<void> => {
      toolCall('tool.pre', input, output);
    },
    'tool.execute.after': async (input?: ToolInput, output?: ToolOutput): Promise<void> => {
      toolCall('tool.post', input, output);
    },
  };
}

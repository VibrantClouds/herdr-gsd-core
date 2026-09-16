/**
 * Claude Code hook script (spec §5.1, §12.5).
 *
 * Invoked as:
 *   node <PLUGIN_ROOT>/packages/adapters/claude-code/dist/hook.js <kind> --spool <dir>
 *
 * Contract: Node builtins only, reads the hook payload from stdin, appends at
 * most two spool lines, exits 0 on EVERY path, hard 2 s self-timeout, no
 * decision object is ever printed (the hook must never block the harness).
 *
 * Payload fields used (docs/spikes/M0-A-hooks.md §1.2): `session_id`, `cwd`,
 * `hook_event_name`, `tool_name`, `tool_input`, `agent_id`, `agent_type`.
 */
import { armSelfTimeout, makeEvent, parsePayload, readStdinSync, resolveSpoolDir, str, obj, writeEventSync } from './emit';
import type { ActivityKind } from './emit';
import { agentFromToolInput, isAgentTool, redactDetail } from './redact';

/** argv[2] values the installer writes, one per registered Claude Code event. */
export type HookKind =
  | 'session-start'
  | 'subagent-start'
  | 'subagent-stop'
  | 'tool-pre'
  | 'tool-post'
  | 'stop'
  | 'compact-pre';

const KIND_MAP: Readonly<Record<string, ActivityKind>> = {
  'session-start': 'session.start',
  'subagent-start': 'subagent.start',
  'subagent-stop': 'subagent.stop',
  'tool-pre': 'tool.pre',
  'tool-post': 'tool.post',
  stop: 'session.stop',
  'compact-pre': 'compact.pre',
};

/** Fall back to the payload's own `hook_event_name` if argv[2] is missing/unknown. */
const EVENT_MAP: Readonly<Record<string, ActivityKind>> = {
  SessionStart: 'session.start',
  SubagentStart: 'subagent.start',
  SubagentStop: 'subagent.stop',
  PreToolUse: 'tool.pre',
  PostToolUse: 'tool.post',
  Stop: 'session.stop',
  PreCompact: 'compact.pre',
};

export function run(argv: readonly string[], env: NodeJS.ProcessEnv, stdin: string): number {
  const payload = parsePayload(stdin);
  if (!payload) return 0;

  const arg = typeof argv[2] === 'string' ? argv[2] : '';
  const kind = KIND_MAP[arg] ?? EVENT_MAP[str(payload, 'hook_event_name') ?? ''];
  if (!kind) return 0;

  const cwd = str(payload, 'cwd') ?? process.cwd();
  const sessionId = str(payload, 'session_id');
  const spoolDir = resolveSpoolDir(argv, env);
  const toolName = str(payload, 'tool_name');
  const toolInput = obj(payload, 'tool_input');
  const agentType = str(payload, 'agent_type');

  let written = 0;
  const emit = (k: ActivityKind, extra: { agent?: string; tool?: string; detail?: string }): void => {
    if (writeEventSync(spoolDir, makeEvent('claude-code', k, cwd, { sessionId, ...extra }, env))) written++;
  };

  if (kind === 'tool.pre' || kind === 'tool.post') {
    const detail = redactDetail(toolName, toolInput, cwd);
    const agent = isAgentTool(toolName) ? agentFromToolInput(toolInput) ?? agentType : undefined;
    emit(kind, { tool: toolName, detail, agent });
    // Spike §1.1: the subagent tool is `Agent` (`Task` kept as a legacy alias).
    // SubagentStart exists in Claude Code 2.1.273 and is registered too, so the
    // daemon de-duplicates; this inferred span is the fallback for older builds.
    if (kind === 'tool.pre' && isAgentTool(toolName)) {
      emit('subagent.start', { tool: toolName, agent, detail });
    }
  } else if (kind === 'subagent.start' || kind === 'subagent.stop') {
    emit(kind, { agent: agentType ?? agentFromToolInput(toolInput) });
  } else {
    emit(kind, {});
  }
  return written;
}

/* istanbul ignore next — process wiring */
if (require.main === module) {
  armSelfTimeout(2000);
  try {
    run(process.argv, process.env, readStdinSync());
  } catch {
    /* never fail the harness */
  }
  process.exit(0);
}

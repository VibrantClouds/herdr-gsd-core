/**
 * Codex hook script (spec §5.2, docs/spikes/M0-A-hooks.md §2, M0-G-gsd.md §6).
 *
 * Invoked as:
 *   node <PLUGIN_ROOT>/packages/adapters/codex/dist/hook.js <kind> --spool <dir>
 *
 * Same contract as the Claude Code hook: Node builtins only, stdin payload,
 * exit 0 on EVERY path, hard 2 s self-timeout, never blocks the harness.
 *
 * CAUTION: only `SessionStart` has a live GSD precedent on the Codex hooks.json
 * surface; every other event and every payload field below is speculative
 * (Claude-schema-by-analogy, per the spike) and is therefore read defensively —
 * a missing field is omitted from the event rather than guessed at.
 */
import { armSelfTimeout, makeEvent, obj, parsePayload, readStdinSync, resolveSpoolDir, str, writeEventSync } from './emit';
import type { ActivityKind } from './emit';
import { agentFromToolInput, isAgentTool, redactDetail } from './redact';

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

  // Speculative field names get a defensive alias list; missing → omitted.
  const cwd = str(payload, 'cwd') ?? str(payload, 'workspace_root') ?? process.cwd();
  const sessionId = str(payload, 'session_id') ?? str(payload, 'sessionId') ?? str(payload, 'conversation_id');
  const spoolDir = resolveSpoolDir(argv, env);
  const toolName = str(payload, 'tool_name') ?? str(payload, 'tool');
  const toolInput = obj(payload, 'tool_input') ?? obj(payload, 'arguments') ?? obj(payload, 'args');
  const agentType = str(payload, 'agent_type') ?? str(payload, 'agent') ?? str(payload, 'subagent_type');

  let written = 0;
  const emit = (k: ActivityKind, extra: { agent?: string; tool?: string; detail?: string }): void => {
    if (writeEventSync(spoolDir, makeEvent('codex', k, cwd, { sessionId, ...extra }, env))) written++;
  };

  if (kind === 'tool.pre' || kind === 'tool.post') {
    const detail = redactDetail(toolName, toolInput, cwd);
    const agent = isAgentTool(toolName) ? agentFromToolInput(toolInput) ?? agentType : undefined;
    emit(kind, { tool: toolName, detail, agent });
    if (kind === 'tool.pre' && isAgentTool(toolName)) emit('subagent.start', { tool: toolName, agent, detail });
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

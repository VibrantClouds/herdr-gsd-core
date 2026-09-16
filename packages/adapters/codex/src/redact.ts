// GENERATED FILE — do not edit.
// Source: packages/adapters/claude-code/src/redact.ts
// Regenerate: node scripts/copy-shared.cjs
/**
 * Detail redaction for harness adapters (spec §5.4, tightened by docs/spikes/M0-A-hooks.md §4).
 *
 * SOURCE OF TRUTH. Copied verbatim into the codex/opencode adapters by
 * `scripts/copy-shared.cjs` so every compiled hook stays dependency-free
 * (spec §12.5: Node builtins only, no cross-package `require`).
 * Edit here, then run `node scripts/copy-shared.cjs`.
 */
import * as path from 'node:path';

/** Hard cap on `ActivityEvent.detail` (spec §3.2). */
export const MAX_DETAIL = 200;
/** Cap on the Agent/Task description carried as `detail`. */
export const MAX_AGENT_DETAIL = 60;
/** Number of argv tokens of a shell command that may be spooled (spec §5.4). */
export const BASH_TOKENS = 3;

const SENSITIVE_NAME_RE = /(key|token|secret|password|passwd|bearer|api[_-]?key|credential|auth)/i;

/** Tokens that look like a credential regardless of any surrounding name. */
const CREDENTIAL_RES: readonly RegExp[] = [
  /^sk-[A-Za-z0-9_-]{4,}$/,
  /^gh[posur]_[A-Za-z0-9]{8,}$/,
  /^xox[abprs]-[A-Za-z0-9-]{4,}$/,
  /^eyJ[A-Za-z0-9_-]{10,}$/,
  /^[A-Fa-f0-9]{32,}$/,
  /^[A-Za-z0-9+/]{32,}={0,2}$/,
];

/** Last-resort scrub applied to every `detail` before it leaves the process. */
const RESIDUE_RE = /(sk-[A-Za-z0-9_-]{4,}|gh[posur]_[A-Za-z0-9]{8,}|xox[abprs]-[A-Za-z0-9-]{4,}|eyJ[A-Za-z0-9_-]{10,}|\b[A-Fa-f0-9]{32,}\b)/g;

export function looksLikeCredential(tok: string): boolean {
  for (const re of CREDENTIAL_RES) if (re.test(tok)) return true;
  return false;
}

/**
 * Split a command line on whitespace honouring simple single/double quotes and
 * backslash escapes. Quote characters are consumed; the quoted run stays one token.
 */
export function shellSplit(cmd: string): string[] {
  const out: string[] = [];
  let cur = '';
  let has = false;
  let quote: string | undefined;
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd.charAt(i);
    if (quote !== undefined) {
      if (c === quote) quote = undefined;
      else {
        cur += c;
        has = true;
      }
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      has = true;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      if (has) {
        out.push(cur);
        cur = '';
        has = false;
      }
      continue;
    }
    if (c === '\\' && i + 1 < cmd.length) {
      cur += cmd.charAt(i + 1);
      i++;
      has = true;
      continue;
    }
    cur += c;
    has = true;
  }
  if (has) out.push(cur);
  return out;
}

/** First 3 argv tokens with anything credential-shaped replaced by `***`. */
export function redactBash(command: string): string {
  const toks = shellSplit(command).slice(0, BASH_TOKENS);
  const out: string[] = [];
  let redactNext = false;
  for (const t of toks) {
    if (redactNext) {
      out.push('***');
      redactNext = false;
      continue;
    }
    if (/^bearer$/i.test(t)) {
      out.push('***');
      redactNext = true;
      continue;
    }
    const eq = t.indexOf('=');
    if (eq > 0 && /^[A-Za-z_][A-Za-z0-9_]*$/.test(t.slice(0, eq))) {
      const name = t.slice(0, eq);
      const value = t.slice(eq + 1);
      if (SENSITIVE_NAME_RE.test(name) || looksLikeCredential(value)) {
        out.push(`${name}=***`);
        continue;
      }
      out.push(t);
      continue;
    }
    if (SENSITIVE_NAME_RE.test(t)) {
      // A flag that NAMES a credential (`--token`, `-H 'X-Api-Key: …'`) hides
      // its value in the following token, so redact that too.
      out.push('***');
      redactNext = true;
      continue;
    }
    if (looksLikeCredential(t)) {
      out.push('***');
      continue;
    }
    out.push(t);
  }
  return out.join(' ');
}

/** Project-relative path; never absolute, never leaks a path outside `cwd`. */
export function relativePath(p: string, cwd: string): string {
  if (!p) return '';
  try {
    const abs = path.isAbsolute(p) ? p : path.resolve(cwd, p);
    const rel = path.relative(cwd, abs);
    if (!rel || rel === '.' || rel.startsWith('..') || path.isAbsolute(rel)) return path.basename(abs);
    return rel;
  } catch {
    return path.basename(p);
  }
}

const BASH_TOOLS = new Set(['bash', 'shell', 'run', 'terminal', 'local_shell', 'exec_command']);
const FILE_TOOLS = new Set(['edit', 'write', 'multiedit', 'read', 'notebookedit', 'notebook_edit', 'apply_patch', 'patch']);
const AGENT_TOOLS = new Set(['agent', 'task']);

function pick(o: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v.length > 0) return v;
    if (Array.isArray(v) && v.length > 0) return v.filter((x) => typeof x === 'string').join(' ');
  }
  return undefined;
}

/** True for the tool names that open a subagent span (spike §1.1: `Agent`, legacy `Task`). */
export function isAgentTool(tool: string | undefined): boolean {
  return AGENT_TOOLS.has((tool ?? '').toLowerCase());
}

/** Agent name for a subagent-spawning tool call, if the payload carries one. */
export function agentFromToolInput(input: unknown): string | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const o = input as Record<string, unknown>;
  const v = pick(o, ['subagent_type', 'subagentType', 'agent_type', 'agentType']);
  return v === undefined ? undefined : v.slice(0, MAX_AGENT_DETAIL);
}

/**
 * Allow-listed `detail` for a tool call. Never returns tool stdin/stdout.
 * `tool` may be any harness spelling (Claude `Bash`, OpenCode `bash`, Codex `shell`).
 */
export function redactDetail(tool: string | undefined, input: unknown, cwd: string): string | undefined {
  const name = tool ?? '';
  const t = name.toLowerCase();
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  let detail: string;
  if (BASH_TOOLS.has(t)) {
    const cmd = pick(o, ['command', 'cmd', 'script']) ?? '';
    detail = cmd ? redactBash(cmd) : name;
  } else if (FILE_TOOLS.has(t)) {
    const p = pick(o, ['file_path', 'filePath', 'path', 'notebook_path', 'notebookPath']);
    detail = p ? relativePath(p, cwd) : name;
  } else if (AGENT_TOOLS.has(t)) {
    const d = pick(o, ['subagent_type', 'subagentType', 'description', 'agent_type']);
    detail = (d ?? name).slice(0, MAX_AGENT_DETAIL);
  } else {
    detail = name;
  }
  return finalizeDetail(detail);
}

/** Apply the residue scrub and the 200-char cap. */
export function finalizeDetail(detail: string | undefined): string | undefined {
  if (detail === undefined) return undefined;
  const scrubbed = detail.replace(RESIDUE_RE, '***');
  if (!scrubbed) return undefined;
  return scrubbed.length > MAX_DETAIL ? scrubbed.slice(0, MAX_DETAIL) : scrubbed;
}

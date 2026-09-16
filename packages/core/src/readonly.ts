/**
 * The pinned read-only `gsd-tools` surface (spike M0-G §2.6).
 *
 * Verified on GSD-Core 1.14.0: every command in this list touches no file on
 * disk. Everything else is assumed to be a write — notably `state planned-phase`,
 * which *looks* like a read and rewrote a real project's `STATE.md` during the
 * M0-G spike. `packages/core` routes every single invocation through
 * `assertReadOnly()` so that incident cannot recur.
 */
export const GSD_TOOLS_READONLY = [
  'state get',
  'state load',
  'state json',
  'state-snapshot',
  'phases list',
  'progress',
  'history-digest',
  'phase-plan-index',
  'roadmap get-phase',
  'stats',
  'smart-entry --json',
  'runtime-identity',
  'config-path',
  'config-get',
  'state',
  'find-phase',
] as const;

export type ReadOnlyCommand = (typeof GSD_TOOLS_READONLY)[number];

/**
 * Entries that legitimately take trailing positional arguments
 * (`phase-plan-index 3`, `roadmap get-phase 3`, `state get "Current Position"`,
 * `config-get workflow.verifier`, `find-phase auth`). For every other entry the
 * positional token count must match exactly, so that a *sub*command such as
 * `state planned-phase` can never be mistaken for the bare `state` read.
 */
const ARG_TAKING = new Set<string>(['state get', 'phase-plan-index', 'roadmap get-phase', 'config-get', 'find-phase']);

/** Global flags that carry a separate value token (spike §2.2). */
const VALUE_FLAGS = new Set<string>(['--pick', '--cwd', '--project-dir', '--ws']);
/** Global flags that stand alone. */
const BARE_FLAGS = new Set<string>(['--raw', '--json-errors']);

export class ReadOnlyViolationError extends Error {
  constructor(public readonly args: readonly string[]) {
    super(`refusing to run non-read-only gsd-tools invocation: ${args.join(' ')}`);
    this.name = 'ReadOnlyViolationError';
  }
}

/**
 * Throw unless `args` is one of the pinned read-only invocations.
 * Returns the matched entry so callers can log it.
 */
export function assertReadOnly(args: readonly string[]): ReadOnlyCommand {
  const positional: string[] = [];
  let sawJson = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string;
    if (a === '--json') {
      sawJson = true;
      continue;
    }
    if (BARE_FLAGS.has(a) || a.startsWith('--exit-contract=')) continue;
    if (VALUE_FLAGS.has(a)) {
      i++; // skip its value
      continue;
    }
    if (a.startsWith('-')) throw new ReadOnlyViolationError(args);
    positional.push(a);
  }
  if (positional.length === 0) throw new ReadOnlyViolationError(args);
  if (positional[0] === 'smart-entry') {
    if (!sawJson || positional.length !== 1) throw new ReadOnlyViolationError(args);
    return 'smart-entry --json';
  }
  for (let k = Math.min(2, positional.length); k >= 1; k--) {
    const key = positional.slice(0, k).join(' ');
    if (!(GSD_TOOLS_READONLY as readonly string[]).includes(key)) continue;
    if (ARG_TAKING.has(key) || positional.length === k) return key as ReadOnlyCommand;
    // a longer positional tail on a no-arg entry means an unknown subcommand
    throw new ReadOnlyViolationError(args);
  }
  throw new ReadOnlyViolationError(args);
}

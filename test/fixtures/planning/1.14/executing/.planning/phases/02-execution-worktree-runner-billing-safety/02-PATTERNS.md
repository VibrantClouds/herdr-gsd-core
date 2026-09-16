# Phase 2: Execution — Worktree, Runner & Billing Safety - Pattern Map

**Mapped:** 2026-07-23
**Files analyzed:** 15 (new/modified)
**Analogs found:** 13 / 15 (2 have no strong analog — noted below, use RESEARCH.md code examples instead)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/runner/env.ts` | utility | transform (env-object construction) | `src/spikes/spawn-claude.ts` | exact (promotion source) |
| `src/runner/env.test.ts` | test | shape-assertion | `src/spikes/spawn-claude.test.ts` | exact (promotion source) |
| `src/runner/worktree-manager.ts` | service | event-driven / file-I/O (git mutation) | `src/registry/git-inspect.ts` (git invocation convention) + `src/registry/fleet-yaml.ts` (total-function, no-throw convention) | role-match (git ops) |
| `src/runner/worktree-manager.test.ts` | test | integration (real scratch git repo) | `src/registry/registry.test.ts` (scratch-repo git fixture pattern) | role-match |
| `src/runner/runner.interface.ts` | model/interface | — | none in-tree (new seam) | no analog — build from RESEARCH.md D-17/Architectural Responsibility Map |
| `src/runner/worktree-runner.ts` | service | event-driven (spawn + stream parse) | `src/spikes/spawn-claude.ts` (spawn shape) + `src/spikes/rate-limit-classifier.ts` (stream classification) | role-match |
| `src/runner/worktree-runner.test.ts` | test | unit, fixture-driven | `src/spikes/spawn-claude.test.ts` | role-match |
| `src/runner/worktree-runner.integration.test.ts` | test | integration, fixture-process | `src/cli/parity.test.ts` (Fastify-inject/live-server test-harness shape) | role-match (harness style only; no fixture-process analog exists) |
| `src/runner/rate-limit.ts` | service/utility | transform (pure classification) | `src/spikes/rate-limit-classifier.ts` | exact (promotion/relocation source) |
| `src/runner/evidence-trap.ts` | utility | file-I/O | `src/spikes/evidence-trap.ts` | exact (promotion/relocation source) |
| `src/scheduler/queue.ts` | service | event-driven (queue wrapper) | none in-tree | no analog — new capability, wraps `p-queue`; use RESEARCH.md Don't-Hand-Roll table for API surface |
| `src/scheduler/queue.test.ts` | test | unit | none in-tree | no analog |
| `src/api/http/routes/tasks.ts` | route/controller | CRUD + request-response | `src/api/http/routes/projects.ts` | exact |
| `src/api/http/routes/tasks.test.ts` | test | request-response (Fastify inject) | `src/cli/parity.test.ts`'s live-server sub-describe (uses `buildApp`/`openDatabase`/`runMigrations`) | strong |
| `src/cli/` task commands (extend `index.ts`) | CLI command | request-response (HTTP client) | `src/cli/index.ts`'s `project` command block + `PROJECT_ROUTE_MAP` | exact |
| `src/cli/parity.test.ts` | test | request-response | itself — EXTEND, do not duplicate | exact (extend in place) |
| `src/core/state-machine/transitions.ts` | state-machine table | pure transform | itself — MODIFY (add `RATE_LIMITED` row to `running`) | exact (same file) |
| `src/core/event-store/record-event.ts` | service (single write path) | CRUD + transform (redaction) | itself — MODIFY (add D-08 redaction before persistence) | exact (same file) |
| `src/spikes/fixtures/fake-claude-cli/` | test fixture | event-driven (NDJSON emission) | `src/spikes/fixtures/stream-events.ts` (existing NDJSON fixture data to reuse) | role-match (data reuse; new binary itself has no analog) |
| `vitest.config.ts` | config | — | itself — MODIFY only if include/exclude needs adjustment | exact (same file) |

## Pattern Assignments

### `src/runner/env.ts` (utility, transform) — promotion, not rewrite

**Analog:** `src/spikes/spawn-claude.ts` (lines 1-42)

**Exact current shape to promote verbatim, then extend:**
```typescript
export const CLAUDE_ENV_ALLOWLIST: readonly string[] = [
  'HOME', 'PATH', 'USER', 'LANG', 'LC_ALL', 'TERM', 'TMPDIR', 'SHELL', 'XDG_CONFIG_HOME',
];

export function buildAllowlistedEnv(source: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of CLAUDE_ENV_ALLOWLIST) {
    const value = source[key];
    if (typeof value === 'string') {
      env[key] = value;
    }
  }
  return env;
}
```

**D-04 extension required (not present in source — net-new in the promoted module):** add git-credential-starvation constants (`GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_NOSYSTEM=1`, `GIT_TERMINAL_PROMPT=0`, `GIT_ASKPASS=/bin/false`, `SSH_ASKPASS=/bin/false`) as forced values (not merely allowlisted-if-present — these must always be set to the neutralizing constant, since a worker with no git credentials at all must still get e.g. `GIT_CONFIG_NOSYSTEM=1` to prevent falling back to something not covered by any env var). Also inject `GIT_AUTHOR_NAME`/`GIT_AUTHOR_EMAIL`/`GIT_COMMITTER_NAME`/`GIT_COMMITTER_EMAIL` from Fleet's own configured identity (task/project-scoped, not from `process.env`). Name the extended function `buildWorkerEnv(task)` per D-06/RESEARCH.md's Code Examples — keep `buildAllowlistedEnv` as the underlying primitive `buildWorkerEnv` composes, don't inline-rewrite it.

**Header-comment convention to preserve:** the file's opening doc-comment names the failure mode (`T-1-ENVLEAK`) and explains *why* allowlist-forward, not denylist. Keep this convention — every promoted/new runner module in this phase should open with a comment naming the requirement ID(s) and threat/property it defends, matching this file's and `git-inspect.ts`'s style.

---

### `src/runner/env.test.ts` (test, shape-assertion) — promotion, not rewrite

**Analog:** `src/spikes/spawn-claude.test.ts` (whole file, 68 lines)

**Exact test shape to promote and extend (D-06):**
```typescript
describe('buildAllowlistedEnv (T-1-ENVLEAK)', () => {
  const DIRTY_KEYS = [ /* ANTHROPIC_*, AWS_*, GOOGLE_*, GCLOUD_* ... */ ];
  afterEach(() => { for (const key of DIRTY_KEYS) delete process.env[key]; });

  it('contains no key outside CLAUDE_ENV_ALLOWLIST even when credential-bearing vars are present', () => { ... });
  it('copies only allowlisted keys that are actually present in the source, from a fresh object', () => { ... });
  it('CLAUDE_ENV_ALLOWLIST does not contain any Anthropic/AWS/GCP/Foundry credential or routing variable name', () => { ... });
});
```

**D-06 companion assertions to add (new, not in the source test):**
- `buildWorkerEnv()` output shape-checked against the extended allowlist (git-starvation vars included as forced values, never absent).
- Spawn-argv assertions belong in `worktree-runner.test.ts`, not here: `--bare` never present, `--setting-sources` always present (empty-string value per Pattern 2 resolution), `--disallowedTools` always includes `Bash(git push*)`.

---

### `src/runner/worktree-manager.ts` (service, file-I/O / event-driven git mutation)

**Analog 1 — git invocation convention:** `src/registry/git-inspect.ts` (lines 1-16, 74-98)

**Imports + error-class pattern to copy** (lines 1-16):
```typescript
import { execFileSync } from 'node:child_process';
import { basename, resolve } from 'node:path';
import { existsSync, realpathSync } from 'node:fs';

export type GitInspectErrorCode = 'path_unresolvable' | 'not_a_git_repo';

export class GitInspectError extends Error {
  readonly code: GitInspectErrorCode;
  constructor(code: GitInspectErrorCode, message: string) {
    super(message);
    this.name = 'GitInspectError';
    this.code = code;
  }
}
```
Define an analogous `WorktreeError` (or reuse `RegistryError`'s shape — see `src/registry/projects.ts` line 14) with codes like `worktree_locked`, `worktree_dirty_capture_failed`, `setup_command_failed`.

**Git-invocation convention** (lines 79-98, doc comment + call shape) — every git call uses `execFileSync('git', [argv...], { cwd: repoPath, stdio: 'pipe' })`, never a shell string, never string-interpolated into a command:
```typescript
try {
  execFileSync('git', ['rev-parse', '--git-dir'], { cwd: repoPath, stdio: 'pipe' });
} catch {
  throw new GitInspectError('not_a_git_repo', `Not a git repository: ${repoPath}`);
}
```
Apply this exact shape to every RESEARCH.md-verified `git worktree` subcommand (`prune -v`, `list --porcelain`, `add [-b] <branch> <path> [<baseref>]`, `lock --reason`, `unlock`, `remove [--force]`, `status --porcelain`).

**Analog 2 — total/no-throw function convention:** `src/registry/fleet-yaml.ts` (lines 60-105) — `readFleetYml` never throws; every failure mode returns a structured result. `ensureWorktree()` should follow the same discipline where D-19's algorithm expects a specific git failure (e.g., "branch already exists" is not exceptional, it's the D-19 step-3 retry signal) — catch and branch on it, don't let it propagate as an unhandled throw.

**Zod-boundary-validation convention** (CONTEXT.md hint) — not directly applicable inside `worktree-manager.ts` itself (no external input crosses this module's boundary beyond already-validated task/project rows), but `src/registry/fleet-yaml.ts`'s `.strict()` zod schema (lines 34-41) is the pattern WT-05's `.fleet.yml` setup-command consumption already benefits from — `worktree-manager.ts` calls `readFleetYml(repoPath)` (existing function, do not re-parse) and iterates `config.setup`.

**Test analog:** `src/registry/registry.test.ts` and `src/registry/cwd-boundary.test.ts` both build real scratch git repos via `execFileSync('git', args, { cwd })` helper functions — reuse this exact `git()` test-helper shape for `worktree-manager.test.ts`'s scratch-repo fixtures (bare "remote" + clone, per RESEARCH.md Pattern 3's verified sequence).

---

### `src/runner/runner.interface.ts` (interface/model) — no analog

No existing file defines a pluggable service interface in this codebase (Phase 1 had no equivalent seam). Build directly from RESEARCH.md's Architectural Responsibility Map and D-17: a `Runner` interface with `provision(task)`, `spawn(task)`, `kill(task)`, `status(task)` methods, with `WorktreeRunner` as the sole Phase 2 implementation. No code to copy — this is genuinely new, but keep it a plain TypeScript `interface`, matching the project's existing lightweight-interface style seen in `SpawnClaudeOptions`/`SpawnClaudeResult` (`src/spikes/spawn-claude.ts` lines 44-57) and `Runner`-adjacent option/result interfaces elsewhere (`InspectRepoResult`, `ReadFleetYmlResult`) — small, flat, no class hierarchy.

---

### `src/runner/worktree-runner.ts` (service, event-driven spawn)

**Analog:** `src/spikes/spawn-claude.ts` for the spawn shape (lines 65-88), extended per RESEARCH.md's Code Examples section (verified this session, authoritative for the actual argv/spawn options this file must use — prefer these over re-deriving from the spike, since D-13 deliberately diverges from `spawnSync`'s use in the spike toward async `spawn` with `detached: true`):

```typescript
// RESEARCH.md "Spawn Invocation" — the authoritative shape for this file
const argv = [
  '-p', task.prompt,
  '--output-format', 'stream-json',
  '--verbose',
  '--permission-mode', 'acceptEdits',
  '--allowedTools', 'Read,Edit,Write,Glob,Grep,Bash,TodoWrite,Task,WebSearch,WebFetch',
  '--disallowedTools', 'Bash(git push*),Bash(git remote*),Bash(sudo*)',
  '--max-turns', String(resolvedMaxTurns),
  '--setting-sources', '',
  '--settings', JSON.stringify(inlineSettings),
];
const child = spawn('claude', argv, {
  cwd: worktreePath,
  env: buildWorkerEnv(task),
  detached: true,
  shell: false,
  stdio: ['ignore', 'pipe', 'pipe'],
});
```

**Timeout + process-group kill** — copy verbatim from RESEARCH.md's "Wall-clock timeout + process-group kill" code example (this is the authoritative, session-verified pattern; there is no in-tree analog for process-group teardown):
```typescript
function killTree(pid: number, grace = 8000): void {
  process.kill(-pid, 'SIGTERM');
  const escalate = setTimeout(() => {
    try { process.kill(-pid, 'SIGKILL'); } catch { /* already dead */ }
  }, grace);
  child.once('exit', () => clearTimeout(escalate));
}
```

**`apiKeySource` runtime assertion (D-02)** — copy verbatim from RESEARCH.md:
```typescript
if (parsed.type === 'system' && parsed.subtype === 'init') {
  if (parsed.apiKeySource !== 'none') {
    killTree(child.pid);
    recordEvent(db, task.id, { type: 'CRASH', reason: `apiKeySource=${parsed.apiKeySource}` }, 'system');
    return;
  }
}
```

**stdout line classification** — call into `src/runner/rate-limit.ts`'s `classifyStreamEvent`/`readApiRetryFields` per line (see that file's pattern below); readline over `child.stdout`, one `JSON.parse` per line in try/catch, unknown types are no-ops (D-14) — this exact defensive-parse discipline is already implemented in `src/spikes/rate-limit-classifier.ts`'s `parseLine()` (lines 39-52) and should be reused/imported rather than reimplemented in `worktree-runner.ts`.

**Error handling convention:** follow `record-event.ts`'s discipline of "the write always happens, acceptance is a separate concern" — `worktree-runner.ts` should call `recordEvent()` for every lifecycle-significant transition and let `recordEvent`/`applyEvent` decide acceptance; it must never mutate `tasks.status` directly (see Shared Patterns below).

---

### `src/runner/worktree-runner.test.ts` / `.integration.test.ts` (test, fixture-driven)

**Analog for harness shape:** `src/cli/parity.test.ts`'s "against a live daemon" `describe` block (lines 148-195) — `mkdtempSync`/`openDatabase`/`runMigrations`/`buildApp`/`afterEach` cleanup with `rmSync(..., { recursive: true, force: true })`. Reuse this exact temp-dir-lifecycle pattern for spinning up a scratch worktree root and a scratch DB per test.

**No in-tree analog for the fake-process fixture itself** — build per RESEARCH.md Pattern 6 (verified mechanically this session): point the constructed env's `PATH` at a fixture directory containing an executable named `claude`; do not use `vi.stubEnv` or mutate the real `process.env.PATH`.

---

### `src/runner/rate-limit.ts` (service/utility, pure transform) — relocation, not rewrite

**Analog:** `src/spikes/rate-limit-classifier.ts` (whole file, 229 lines) — move as-is per D-28. Key exports to preserve exactly: `LimitSignal`, `readApiRetryFields`, `classifyStreamEvent`, `classifyRun`, `ClassifyRunInput`/`ClassifyRunResult`/`FiredSignal`. The defensive `parseLine()` helper (lines 39-52) — never throws, treats non-object/unparseable input as `null` — is the canonical "never throw on malformed stdout" pattern for this whole phase; reference it from `worktree-runner.ts` rather than reimplementing.

**Test relocation:** `src/spikes/rate-limit-classifier.test.ts` moves alongside it into `src/runner/rate-limit.test.ts`, joining the default `unit` Vitest project (it is already a plain `.test.ts`, not `.spike.test.ts`, so `vitest.config.ts`'s existing exclude pattern already covers it correctly post-move — confirm at implementation time per RESEARCH.md's Wave-0-Gaps note).

---

### `src/runner/evidence-trap.ts` (utility, file-I/O) — relocation, not rewrite

**Analog:** `src/spikes/evidence-trap.ts` (whole file, 57 lines) — move as-is per D-28. Preserve the plain-text, section-delimited (not JSON-envelope) file format exactly (lines 41-53) — this is explicitly load-bearing ("do not redact or truncate... a JSON string would escape quotes/newlines and defeat the trap's fidelity requirement"). Preserve `resolveFleetHome()` import from `../config.js` (this import path stays the same after the move, since both `src/spikes/` and `src/runner/` are one level under `src/`).

---

### `src/scheduler/queue.ts` (service, event-driven queue wrapper) — no analog

No existing in-tree queue/scheduler code. Build directly from RESEARCH.md's Don't-Hand-Roll table and Standard Stack section: wrap `p-queue@^9.3.3` (note: CLAUDE.md's stack table says `8.x` — this is stale, use `9.3.3`), using its documented `.pause()`, `.start()`, `.concurrency` setter, `.clear()`, `.pending`, `.size`, `.isPaused` API surface. Durable truth is the `tasks` table (D-25) — reconstruct the queue from `queued` rows on boot; never persist the queue's own structure. `settings` table (already in schema, `key`/`value` JSON) is where the runtime-changeable concurrency cap lives.

**Closest structural analog for "a service module with no HTTP/CLI surface of its own, consumed by routes":** `src/registry/projects.ts` (referenced via `RegistryError`) — follow its convention of throwing a typed error class (`RegistryError`) that the route layer's `errors.ts`/`registerErrorHandler` already knows how to render; do the same for any `SchedulerError` this module introduces, adding its code(s) to `CODE_TO_STATUS` in `src/api/http/errors.ts`.

---

### `src/api/http/routes/tasks.ts` (route/controller, CRUD + request-response)

**Analog:** `src/api/http/routes/projects.ts` (whole file, 134 lines) — strong, direct analog.

**Route registration + zod schema shape to copy** (lines 1-30, 60-72):
```typescript
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { FleetDatabase } from '../../../db/index.js';

const createTaskBody = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1),
  prompt: z.string().min(1),
  model: z.string().optional(),
  maxTurns: z.number().int().positive().optional(),
  wallClockCapMs: z.number().int().positive().optional(),
}); // mirror createProjectBody's structure: required fields first, optional overrides after

export function registerTaskRoutes(app: FastifyInstance, db: FleetDatabase): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post('/tasks', { schema: { body: createTaskBody } }, async (request, reply) => {
    const task = createTask(db, request.body); // enqueues per D-30 — auto-dispatch, no separate start
    reply.status(201);
    return { task };
  });
  // GET /tasks, GET /tasks/:id, POST /tasks/:id/cancel, POST /kill-switch follow the same
  // typed.get/typed.post shape as projects.ts's list/show/patch/delete block (lines 74-132)
}
```

**Params/idOrSlug-equivalent pattern** — `projects.ts`'s `idOrSlugParams` (lines 39-41) is the direct template for a `taskIdParams` schema; tasks are addressed by UUID only (no slug equivalent), so simplify to `z.object({ id: z.string() })`.

**Strict-body convention for PATCH-like endpoints** — `updateProjectBody`'s `.strict()` (lines 44-51) — apply the same `.strict()` discipline to `POST /tasks/:id/cancel`'s body (likely empty/no body) and any task-update surface, so an unrecognized key fails validation rather than being silently ignored.

**Error handling** — none of `projects.ts`'s handlers use try/catch directly; thrown `RegistryError`/`GitInspectError` propagate to Fastify's registered error handler (`src/api/http/errors.ts`). Follow the identical pattern for `tasks.ts`: define/throw a typed error class from the task-service layer (e.g. from wherever `createTask`/`cancelTask` live), add its codes to `CODE_TO_STATUS` in `errors.ts` (e.g. `task_not_found: 404`, `queue_paused: 409`), and let the existing `registerErrorHandler` render it — do not add a second error-rendering path.

---

### `src/api/http/routes/tasks.test.ts` (test, request-response)

**Analog:** `src/cli/parity.test.ts`'s "against a live daemon" `describe` block (lines 148-195) for the harness (`mkdtempSync` DB, `openDatabase`/`runMigrations`, `buildApp`, `afterEach` teardown) — reuse verbatim. For route-level assertions specifically (not CLI-level), also look at how `parity.test.ts`'s `app.hasRoute({ method, url })` check (line 35) verifies route registration — a `tasks.test.ts` equivalent should assert `POST /tasks`, `GET /tasks`, `GET /tasks/:id`, `POST /tasks/:id/cancel` are all registered, mirroring PROJECT_ROUTE_MAP's assertion style.

---

### `src/cli/` task commands (extend `index.ts`)

**Analog:** `src/cli/index.ts`'s entire `project` command block (lines 101-266) plus `PROJECT_ROUTE_MAP` (lines 69-75) and its structural-parity doc comment (lines 60-68).

**Route-map table pattern to replicate exactly** (lines 69-75):
```typescript
export const TASK_ROUTE_MAP: TaskRouteMapEntry[] = [
  { command: 'task create', method: 'POST', path: '/tasks' },
  { command: 'task list', method: 'GET', path: '/tasks' },
  { command: 'task show', method: 'GET', p

<!-- FIXTURE TRUNCATED at 20 KiB by M0-G capture; original size 32389 bytes -->

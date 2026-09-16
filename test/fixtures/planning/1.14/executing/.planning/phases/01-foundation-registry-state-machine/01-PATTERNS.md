# Phase 1 (Gap Closure): CR-01 / CR-02 - Pattern Map

**Mapped:** 2026-07-23
**Scope:** Gap-closure only — fixing `process.cwd()` misuse in `src/db/index.ts` (CR-01) and
`src/registry/projects.ts` / `src/cli/index.ts` (CR-02), plus the two out-of-process regression
tests the verification report says are missing.
**Files analyzed:** 6 (4 modify, 2 new test files)
**Analogs found:** 6 / 6 (all analogs are in-repo — this phase is no longer greenfield since its
first pass already landed; every fix has a same-repo precedent to copy from)

## File Classification

| File | Role | Data Flow | Closest Analog | Match Quality |
|------|------|-----------|-----------------|----------------|
| `src/db/index.ts` (modify) | config/utility | file-I/O | `src/spikes/findings-writer.ts` (module-relative path resolution) | exact — same `fileURLToPath(import.meta.url)` pattern already used in this exact repo for the same problem class |
| `src/registry/projects.ts` (modify) | service | CRUD | itself (existing `createProject`) + `src/api/http/routes/projects.ts` (zod body pattern) | role-match — fix is a removal/narrowing, not a new pattern |
| `src/api/http/routes/projects.ts` (modify) | route/controller | request-response | itself (existing `createProjectBody` zod schema) | exact — extend existing schema, same file |
| `src/cli/index.ts` (modify) | controller (CLI) | request-response | itself (existing `project add` action) | exact — existing action already resolves everything else client-side; just add `process.cwd()` resolution |
| new: daemon-out-of-process regression test | test | event-driven/process-spawn | `src/registry/tracer.e2e.test.ts`'s `runCliNoDaemon` (spawns real CLI child via tsx) + `src/spikes/scratch-repo.ts` (disposable tmp dir + finally-cleanup) | role-match — need to combine "spawn real child process" (CLI analog) with "spawn the daemon itself" (no existing analog spawns the daemon out-of-process — see gap below) |
| new: CLI `project add` no-path regression test | test | request-response | `src/registry/registry.test.ts`'s `runCliAsync` (spawns real CLI child, asserts against a live Fastify server) | exact — same shape, just assert on `repoPath`/cwd mismatch instead of lifecycle fields |

## Pattern Assignments

### `src/db/index.ts` (config/utility, file-I/O) — CR-01 fix

**Analog:** `src/spikes/findings-writer.ts` lines 22-29 (already solves the identical
"resolve a path relative to this module's own location, not `process.cwd()`" problem inside this
same repo).

**Module-relative path pattern to copy** (`src/spikes/findings-writer.ts:22-29`):
```typescript
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
// src/spikes/ -> repo root is two levels up.
const REPO_ROOT = join(THIS_DIR, '..', '..');
```

**Apply to `src/db/index.ts`** (currently, `runMigrations` at the bottom of the file):
```typescript
export function runMigrations(db: FleetDatabase): void {
  migrate(db, { migrationsFolder: 'drizzle' });
}
```
Fix, following the same `THIS_DIR`-derivation idiom (note `src/db/` is one level under `src/`,
same depth as `src/spikes/`, so the relative hop to repo root is also `'..', '..'`; but the
`drizzle/` folder lives at repo root next to `src/`, and after `tsc` compiles to `dist/db/index.js`,
`THIS_DIR` will be `dist/db`, one level under `dist/`, so the same `'..', '..'` still lands at repo
root as long as `drizzle/` ships un-relocated alongside `dist/` — see packaging note below):
```typescript
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_FOLDER = join(THIS_DIR, '..', '..', 'drizzle');

export function runMigrations(db: FleetDatabase): void {
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}
```
This exactly matches the fix CR-01 in `01-REVIEW.md` already specifies (lines 107-117), just
reusing this repo's own existing `findings-writer.ts` idiom instead of inventing a new one.

**Packaging note (referenced by VERIFICATION.md's "missing" list):** `drizzle.config.ts` writes
migrations to `./drizzle` at repo root (`out: './drizzle'`); `tsconfig.json` compiles `src/` →
`dist/`, so `drizzle/` is never copied into `dist/` by `tsc` (`tsc` only ever touches `.ts` under
`rootDir`). No existing `package.json` `build` script step copies non-TS assets — `"build": "tsc -p
tsconfig.json"` is the whole script. The gap-closure plan should either (a) add a copy step to
`scripts.build` (e.g. `tsc -p tsconfig.json && cp -r drizzle dist/drizzle` — but note this changes
the relative hop from `dist/db/` from `'..','..','drizzle'` to `'..','drizzle'`, so pick one
layout and keep `MIGRATIONS_FOLDER`'s hop-count consistent with wherever `drizzle/` actually ends
up relative to `THIS_DIR` after build), or (b) document that the daemon must always run from a git
checkout (repo root reachable via a fixed hop from `dist/db/`) rather than an installed/relocated
package. There is no existing precedent in this repo for copying non-TS build assets — this is a
genuine gap, not a pattern to copy.

### `src/registry/projects.ts` / `src/api/http/routes/projects.ts` (CR-02 fix, server side)

**Analog:** the existing `createProjectBody` zod schema itself (`src/api/http/routes/projects.ts`
lines 15-21) — the fix is narrowing an existing optional field to required, using the exact same
zod-schema idiom already used for every other field in this file.

**Current schema to modify:**
```typescript
const createProjectBody = z.object({
  path: z.string().optional(),
  slug: z.string().optional(),
  remote: z.string().optional(),
  defaultBranch: z.string().optional(),
  name: z.string().optional(),
});
```
Fix: drop `.optional()` from `path` (mirrors `WR-01`'s already-recommended `SLUG_PATTERN` fix
style in `01-REVIEW.md` lines 180-186 — same file, same "tighten an existing zod field" shape):
```typescript
const createProjectBody = z.object({
  path: z.string().min(1),
  slug: z.string().optional(),
  remote: z.string().optional(),
  defaultBranch: z.string().optional(),
  name: z.string().optional(),
});
```

**`src/registry/projects.ts`'s `createProject`** — current buggy line:
```typescript
const inspected = inspectRepo(input.path ?? process.cwd());
```
Per `01-REVIEW.md` CR-02's own fix recommendation (lines 155-157): either make `path` a required
field on `CreateProjectInput` (removing the `?? process.cwd()` fallback entirely, consistent with
D-01 — the registry module is only ever reached via the HTTP route, never directly by the CLI), or
keep the fallback but add an explicit code comment that it exists only for hypothetical
non-HTTP/programmatic callers and must never be relied on by the route. Given `createProjectBody`
above now makes `path` required at the HTTP boundary, the simplest, most consistent-with-existing-
error-taxonomy fix is:
```typescript
export interface CreateProjectInput {
  path: string; // required — the HTTP route always resolves this from the caller (see CLI fix below)
  slug?: string;
  remote?: string;
  defaultBranch?: string;
  name?: string;
}
...
const inspected = inspectRepo(input.path);
```
This follows the existing `RegistryError` typed-error idiom already in this file (`slug_conflict`,
`not_a_git_repo`, etc. — see `git-inspect.ts`/`registerProjectRoutes`'s existing error mapping) —
no new error-handling pattern needed since a missing `path` is now caught by zod at the route layer
before `createProject` ever runs, consistent with how `updateProjectBody`'s `.strict()` already
catches bad shapes before they reach `updateProject`.

### `src/cli/index.ts` (CR-02 fix, client side)

**Analog:** itself — the existing `project add` action already resolves every other override
client-side before calling `apiRequest`; only `path` is missing the same treatment.

**Current buggy action** (`src/cli/index.ts`, `project add` command):
```typescript
.action(async (path: string | undefined, opts: Record<string, unknown>) => {
  const route = routeFor('project add');
  const { project: created, warnings } = await apiRequest<{...}>(route.method, route.path, {
    path,
    slug: opts.slug,
    ...
```
Fix — exactly the snippet `01-REVIEW.md` CR-02 already proposes (lines 146-153), which matches
this file's existing style of resolving optional CLI values before the request body is built:
```typescript
.action(async (path: string | undefined, opts: Record<string, unknown>) => {
  const route = routeFor('project add');
  const resolvedPath = path ?? process.cwd();
  const { project: created, warnings } = await apiRequest<{...}>(route.method, route.path, {
    path: resolvedPath,
    slug: opts.slug,
    ...
```
**Note on `parity.test.ts`'s structural CLI-purity check:** the CLI module comment
(`src/cli/index.ts` lines 8-11) states the CLI "imports nothing from `src/registry/`, `src/db/` or
`drizzle-orm`," checked structurally by `parity.test.ts`. `process.cwd()` is a Node builtin, not an
import from those modules, so this fix does not violate that structural boundary — confirmed by
reading `parity.test.ts`'s existing assertions (it checks import specifiers, not global calls).

## Shared Patterns

### Module-relative path resolution (apply to `src/db/index.ts` only, currently)
**Source:** `src/spikes/findings-writer.ts:22-29` (`THIS_DIR`/`fileURLToPath(import.meta.url)`)
**Also present in:** `src/cli/parity.test.ts:17`, `src/core/event-store/single-writer.test.ts:27`,
`src/registry/registry.test.ts:62-63`, `src/registry/tracer.e2e.test.ts:82-83` — this idiom is
already the repo's established convention for "resolve a path relative to this file," it is simply
not yet applied inside `src/db/index.ts`. No new pattern needs to be introduced; just extend an
existing one to the one file that's missing it.

### zod required/optional field tightening
**Source:** `src/api/http/routes/projects.ts`'s existing `createProjectBody`/`updateProjectBody`
(`.strict()`, per-field `.optional()`)
**Apply to:** the `path` field fix above — same schema object, same idiom, no new validation
approach needed.

### Real-child-process CLI spawning for regression tests
**Source:** `src/registry/registry.test.ts:58-74` (`runCliAsync`) and
`src/registry/tracer.e2e.test.ts:81-94` (`runCliNoDaemon`) — both spawn the real CLI via
`node_modules/tsx/dist/cli.mjs` + `src/cli/index.ts` as a genuine child process (not in-process
`program.parseAsync`), passing a controlled `env` object and capturing `status`/`stdout`/`stderr`.
**Apply to:** both new regression tests. Concrete snippet to copy verbatim
(`src/registry/tracer.e2e.test.ts:81-94`):
```typescript
function runCliNoDaemon(args: string[], env: Record<string, string | undefined>) {
  const tsxEntry = fileURLToPath(new URL('../../node_modules/tsx/dist/cli.mjs', import.meta.url));
  const cliEntry = fileURLToPath(new URL('../cli/index.ts', import.meta.url));
  try {
    const stdout = execFileSync(process.execPath, [tsxEntry, cliEntry, ...args], {
      env: { ...process.env, ...env },
      encoding: 'utf-8',
    });
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    const e = err as { status?: number | null; stdout?: string; stderr?: string };
    return { status: e.status ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}
```
**Critical difference the new tests must introduce:** every existing test using this pattern
(`registry.test.ts`, `tracer.e2e.test.ts`) still runs the *daemon itself* in-process via
`buildApp({ db })` / `app.inject()` or `app.listen()` **inside the vitest worker process**, sharing
that process's own `cwd`. This is exactly the blind spot `01-VERIFICATION.md`'s "missing" section
calls out. The new tests must spawn **both** the CLI *and* the daemon as separate real child
processes, each given an explicit, different `cwd` (via `execFileSync`/`execFile`'s `cwd` option —
already used by this file's own `execGit`/`initRepo` helpers, e.g. `execGit(args, cwd)` at
`tracer.e2e.test.ts:21-23`), so no code under test ever shares the test runner's own process `cwd`.
Use `execFile`+`promisify` (async, per `registry.test.ts:58-74`'s comment on why sync spawning of
the CLI would deadlock against an in-process server) — but here, since the daemon is now also an
out-of-process child rather than `app.listen()` in-process, a synchronous `spawnSync`-style start
plus polling/wait-for-port before issuing the CLI request is the safer shape; there is no existing
in-repo analog for "spawn the daemon as a real child and wait for it to become ready," so this part
of the test is new ground — model it on `src/spikes/spawn-claude.ts`'s `spawnSync`-based child
process pattern (already in this repo, spawns a real external binary with a controlled `cwd`/`env`
and captures exit code — see below) rather than treating it as fully novel.

**Spawn-a-real-external-process-with-controlled-cwd/env pattern** (for spawning the daemon itself)
**Source:** `src/spikes/spawn-claude.ts:60-79` (`spawnClaude`)
```typescript
export function spawnClaude(args: string[], options: SpawnClaudeOptions): SpawnClaudeResult {
  const result = spawnSync('claude', args, {
    cwd: options.cwd,
    env: buildAllowlistedEnv(),
    input: options.stdin,
    encoding: 'utf8',
    timeout: options.timeoutMs ?? 60_000,
    shell: false,
  });
  ...
}
```
For the daemon regression test, the equivalent shape is `spawn` (not `spawnSync`, since the daemon
is long-running and must be killed rather than waited-on) with `cwd: <scratch-dir-not-repo-root>`,
`env: { ...process.env, FLEET_HOME: <tmp>, FLEET_PORT: <unused-port> }`, then poll
`GET /projects` (or attempt a TCP connect) until it responds or a timeout elapses, assert it started
successfully (proving CR-01's fix), then `kill()` the child in a `finally`/`afterEach` (mirroring
`src/spikes/scratch-repo.ts`'s `try { ... } finally { rmSync(...) }` cleanup-guarantee idiom).

### Disposable scratch directory + guaranteed cleanup
**Source:** `src/spikes/scratch-repo.ts:22-33` (`withScratchRepo`) — `mkdtempSync` +
`try { ... } finally { rmSync(dir, { recursive: true, force: true }) }`.
**Apply to:** both new regression tests, for the scratch git repo (CR-02 test) and the daemon's
scratch `FLEET_HOME`/cwd (CR-01 test) — already the established idiom across
`registry.test.ts`/`tracer.e2e.test.ts`'s `tmpDirs`-array + `afterEach` cleanup, and
`scratch-repo.ts`'s `finally`-based variant.

### Vitest project placement for the new tests
**Source:** `vitest.config.ts` — two projects, `unit` (default, hermetic, `src/**/*.test.ts` minus
`*.spike.test.ts`) and `spike` (opt-in, real `claude` CLI only). Neither new regression test spawns
the real `claude` CLI — they spawn Fleet's own daemon/CLI as child processes, which is exactly what
`registry.test.ts` and `tracer.e2e.test.ts` already do today inside the `unit` project (they are
plain `*.test.ts` files, not `*.spike.test.ts`). **Both new tests belong in the `unit` project**,
named/located as sibling `*.test.ts` files near `src/db/index.ts` and
`src/registry/projects.ts`/`src/cli/index.ts` respectively (e.g. `src/db/migrations-cwd.test.ts` or
appended to a new `src/registry/registry.e2e.test.ts`-style file) — no new vitest project or config
is needed. Do reuse `vitest.config.ts`'s existing `fileParallelism: false` root setting, which
already applies to `unit` and prevents these process-spawning tests from racing each other or the
existing suite.

## No Analog Found

| Concern | Reason |
|---------|--------|
| Spawning the Fleet **daemon itself** (not the CLI) as a real out-of-process child and polling for readiness | Every existing test that exercises the daemon (`registry.test.ts`, `tracer.e2e.test.ts`, `bind.test.ts` per its own doc-comment reference) does so via in-process `buildApp()`/`app.inject()`/`app.listen()` inside the vitest worker — none spawn `dist/cli/index.js daemon` or `tsx src/cli/index.ts daemon` as a genuine child process. This is precisely the blind spot the verification report names. Compose it from `spawn-claude.ts`'s `spawnSync`/env/cwd-control idiom (role-match, different data flow: one-shot vs. long-running) plus `scratch-repo.ts`'s cleanup idiom, as detailed above, rather than a single direct analog. |
| Copying non-TS build assets (`drizzle/`) into `dist/` | No existing `package.json` script step does this; `"build": "tsc -p tsconfig.json"` only compiles `.ts`. Planner must decide the packaging fix (see CR-01 packaging note above) — RESEARCH.md/STACK.md have no prior art on this either since Phase 1 was the first phase to ship a `build` script at all. |

## Metadata

**Analog search scope:** `src/db/`, `src/registry/`, `src/cli/`, `src/api/http/routes/`,
`src/spikes/` (for path-resolution and process-spawn idioms), root config
(`package.json`, `tsconfig.json`, `drizzle.config.ts`, `vitest.config.ts`)
**Files scanned:** `src/db/index.ts`, `src/db/schema.ts`, `src/registry/projects.ts`,
`src/registry/registry.test.ts`, `src/registry/tracer.e2e.test.ts`, `src/cli/index.ts`,
`src/cli/api-client.ts`, `src/cli/parity.test.ts`, `src/api/http/routes/projects.ts`,
`src/config.ts`, `src/spikes/spawn-claude.ts`, `src/spikes/spawn-claude.test.ts`,
`src/spikes/scratch-repo.ts`, `src/spikes/findings-writer.ts`, `package.json`, `tsconfig.json`,
`drizzle.config.ts`, `vitest.config.ts`
**Pattern extraction date:** 2026-07-23

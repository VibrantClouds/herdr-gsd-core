---
phase: 01-foundation-registry-state-machine
plan: 01
subsystem: database
tags: [fastify, drizzle-orm, better-sqlite3, zod, vitest, commander, sqlite, wal]

# Dependency graph
requires: []
provides:
  - "Node 22 toolchain scaffold: TypeScript strict, Vitest (unit/spike projects), Drizzle Kit, ESLint flat config"
  - "src/config.ts: shared FLEET_HOME/FLEET_PORT resolution (D-02, D-03)"
  - "src/cli/exit-codes.ts: EXIT_OK/FAILED/USAGE/DAEMON_UNREACHABLE (D-19)"
  - "src/db/schema.ts: Drizzle schema for all four tables (projects/tasks/events/settings)"
  - "src/db/index.ts: openDatabase()/runMigrations() with WAL + busy_timeout + foreign_keys pragmas"
  - "drizzle/: committed, versioned initial migration"
  - "src/registry/git-inspect.ts + projects.ts: repo validation, slug/remote/branch inference, createProject/listProjects"
  - "src/api/http/: Fastify daemon with zod-validated POST/GET /projects, loopback-only bind, D-19 error shape"
  - "src/cli/: fleet daemon | project add | project list — pure HTTP client, D-18/D-19 compliant"
affects: [02-execution, 03-status]

# Tech tracking
tech-stack:
  added: [fastify@5.10, better-sqlite3@13.0.1, drizzle-orm@0.45.2, drizzle-kit@0.31.10, zod@4.4.3, fastify-type-provider-zod@7, pino@10.3.1, commander@15, vitest@4.1.10, tsx@4.23, typescript@5.9.3, eslint@10]
  patterns:
    - "Single write path via better-sqlite3's parameterized query builder — no string-interpolated SQL anywhere in src/registry/"
    - "CLI is a pure HTTP client (D-01) — no module under src/cli/ imports the db layer, enforced by grep in acceptance criteria"
    - "Explicit loopback bind (host: '127.0.0.1' passed literally, never Fastify's implicit default) — OPS-04"
    - "drizzle-kit generate + embedded migrate(), never drizzle-kit push — versioned migration trail is a source artifact"

key-files:
  created:
    - src/config.ts
    - src/cli/exit-codes.ts
    - src/db/schema.ts
    - src/db/index.ts
    - src/registry/git-inspect.ts
    - src/registry/projects.ts
    - src/api/http/app.ts
    - src/api/http/errors.ts
    - src/api/http/routes/projects.ts
    - src/cli/api-client.ts
    - src/cli/render.ts
    - src/cli/index.ts
    - src/types/better-sqlite3.d.ts
    - drizzle/0000_fat_callisto.sql
  modified: []

key-decisions:
  - "better-sqlite3 13.0.1 as actually installed ships no bundled types (no `types` field, no .d.ts files) — 01-RESEARCH.md's claim was wrong. Vendored a scoped local ambient declaration instead of the stale @types/better-sqlite3 package, honoring the plan's underlying intent."
  - "drizzle/ migration was generated during Task 2 (transiently, uncommitted) so the tracer e2e tests could run against a real migrated schema, then formally committed in Task 3 per the plan's file ownership — Task 3's 'first' db:generate run was already a no-op confirming zero drift."
  - "bind.test.ts asserts OPS-04 via real bound-socket behavior (app.server.address()) rather than mocking Fastify's listen() call — a stronger runtime proof of the loopback-only constraint."

patterns-established:
  - "Pattern: every git shell-out uses execFileSync with an argv array + cwd, stdio explicitly piped — never a shell string, never stderr noise leaking into test output"
  - "Pattern: typed registry/HTTP errors (GitInspectError, RegistryError) carry a `code` that a single errors.ts map translates to both HTTP status and the D-19 response shape"

requirements-completed: [PROJ-01, PROJ-02, PROJ-06, STATE-01, STATE-02, OPS-04, QUAL-01, QUAL-04]

coverage:
  - id: D1
    description: "fleet project add registers a repo over HTTP and returns slug/repo_path/remote_url/default_branch"
    requirement: "PROJ-01"
    verification:
      - kind: e2e
        ref: "src/registry/tracer.e2e.test.ts#registers a repo with an origin remote"
        status: pass
      - kind: manual_procedural
        ref: "npm run dev + fleet project add against a real scratch repo — verified slug/repo/branch in JSON and table output"
        status: pass
    human_judgment: false
  - id: D2
    description: "fleet project list --json / table returns registered projects"
    requirement: "PROJ-02"
    verification:
      - kind: e2e
        ref: "src/registry/tracer.e2e.test.ts#GET /projects on an empty database, #GET /projects orders by created_at"
        status: pass
      - kind: manual_procedural
        ref: "fleet project list and fleet project list --json against a live daemon"
        status: pass
    human_judgment: false
  - id: D3
    description: "Registered project data survives a daemon restart against the same FLEET_HOME"
    requirement: "STATE-01"
    verification:
      - kind: e2e
        ref: "src/registry/tracer.e2e.test.ts#a project registered before closing the daemon is still returned after reopening"
        status: pass
      - kind: unit
        ref: "src/db/migrate.test.ts#a row written before closing the handle is readable after reopening the same path"
        status: pass
    human_judgment: false
  - id: D4
    description: "fleet project add against a non-git directory exits 1 and prints an error naming the path; no row created"
    requirement: "PROJ-01"
    verification:
      - kind: e2e
        ref: "src/registry/tracer.e2e.test.ts#rejects a non-git directory with 400 not_a_git_repo and inserts no row"
        status: pass
    human_judgment: true
    rationale: "The HTTP-layer 400/not_a_git_repo behavior is fully covered by an automated test. The CLI's mapping of that response to exit code 1 with the path named in the message is implemented (ApiRequestError -> EXIT_FAILED, message passed through) but not exercised by an automated CLI-spawn test in this plan — only the no-daemon CLI exit-3 path was spawned as a real process. A human should confirm `fleet project add <non-git-dir>` exits 1 with the path in the message."
  - id: D5
    description: "Slug collision on a second project returns 409 slug_conflict and creates no second row"
    requirement: "PROJ-01"
    verification:
      - kind: e2e
        ref: "src/registry/tracer.e2e.test.ts#rejects a slug collision with a second project with 409 slug_conflict"
        status: pass
    human_judgment: false
  - id: D6
    description: "With no daemon running, fleet project commands exit 3 and name the base URL"
    requirement: "PROJ-06"
    verification:
      - kind: e2e
        ref: "src/registry/tracer.e2e.test.ts#exits 3 and prints a message naming the base URL (real CLI process spawn)"
        status: pass
    human_judgment: false
  - id: D7
    description: "Daemon binds only to 127.0.0.1; a second daemon on the same port fails loudly with EADDRINUSE rather than picking another port"
    requirement: "OPS-04"
    verification:
      - kind: integration
        ref: "src/api/http/bind.test.ts#binds only to 127.0.0.1, #a second daemon on an already-bound port rejects with EADDRINUSE"
        status: pass
    human_judgment: false
  - id: D8
    description: "A freshly migrated fleet.db has WAL journal mode and a positive busy_timeout"
    requirement: "STATE-01"
    verification:
      - kind: unit
        ref: "src/db/migrate.test.ts#establishes WAL mode, a positive busy_timeout, and foreign_keys=ON"
        status: pass
    human_judgment: false
  - id: D9
    description: "A freshly migrated fleet.db contains exactly the four tables: projects, tasks, events, settings"
    requirement: "STATE-02"
    verification:
      - kind: unit
        ref: "src/db/migrate.test.ts#brings a fresh database to exactly the four user tables"
        status: pass
    human_judgment: false
  - id: D10
    description: "TypeScript strict mode compiles the whole tree with zero errors"
    requirement: "QUAL-01"
    verification:
      - kind: other
        ref: "npx tsc --noEmit (manual run) — exit 0"
        status: pass
    human_judgment: false
  - id: D11
    description: "npm test / vitest --project unit is green and fully hermetic (no daemon, no real claude process)"
    requirement: "QUAL-04"
    verification:
      - kind: unit
        ref: "vitest run --project unit — 24/24 tests passed across config.test.ts, tracer.e2e.test.ts, bind.test.ts, migrate.test.ts"
        status: pass
    human_judgment: false
  - id: D12
    description: "A repo with no origin remote still registers, with remote_url null, local-HEAD-branch fallback, and a non-empty warnings array"
    requirement: "PROJ-01"
    verification:
      - kind: e2e
        ref: "src/registry/tracer.e2e.test.ts#registers a repo with no origin remote"
        status: pass
    human_judgment: false
  - id: D13
    description: "A remote URL carrying userinfo is stored and returned with the userinfo stripped"
    requirement: "PROJ-01"
    verification:
      - kind: e2e
        ref: "src/registry/tracer.e2e.test.ts#strips userinfo from a remote URL before storing or returning it"
        status: pass
    human_judgment: false
  - id: D14
    description: "The committed migration matches schema.ts exactly — a second db:generate run reports no pending changes"
    requirement: "STATE-01"
    verification:
      - kind: other
        ref: "npm run db:generate (manual run, twice) — second run: 'No schema changes, nothing to migrate'"
        status: pass
    human_judgment: false

duration: 21min
completed: 2026-07-22
status: complete
---

# Phase 1 Plan 1: Foundation Toolchain and Walking Skeleton Summary

**Fastify + Drizzle + better-sqlite3 (WAL) daemon with a loopback-only `POST/GET /projects` API, a pure-HTTP `fleet` CLI, and a committed versioned migration — proving the whole stack on one real end-to-end registration path before any expansion.**

## Performance

- **Duration:** 21 min
- **Started:** 2026-07-22T22:49:34-04:00
- **Completed:** 2026-07-22T23:09:50-04:00
- **Tasks:** 3
- **Files modified:** 29 created, 0 modified

## Accomplishments
- Node 22 monorepo scaffold: TypeScript strict, Vitest 4 with hermetic `unit` + opt-in `spike` projects, ESLint flat config, Drizzle Kit config
- Shared `src/config.ts` (FLEET_HOME/FLEET_PORT resolution) and `src/cli/exit-codes.ts` primitives imported by both the daemon and the CLI
- Full four-table Drizzle schema (`projects`/`tasks`/`events`/`settings`) translated 1:1 from ARCHITECTURE.md §8, plus the deliberate nullable `projects.name` extension
- A real, production-quality vertical slice: `fleet project add` → loopback HTTP → registry validation/inference → parameterized SQLite write → `fleet project list` → loopback HTTP → SQLite read, with every documented failure mode (not-a-git-repo, slug conflict, no-origin-remote, userinfo-in-remote, no-daemon) distinguishable by status code / exit code
- Committed, versioned initial migration (`drizzle/0000_fat_callisto.sql`) establishing WAL mode, a busy timeout, and `foreign_keys=ON` before any table exists to contend over
- 24 passing unit tests across 4 files, fully hermetic (no daemon, no real `claude` process) — `npm test` runs in ~1.1s

## Task Commits

Each task was committed atomically:

1. **Task 1: Toolchain, Wave-0 test harness, and the config + exit-code primitives** - `da94f0a` (feat)
2. **Task 2: End-to-end "register a git repo and list it back"** - `79eb610` (feat, tracer/tdd)
3. **Task 3: [BLOCKING] Generate and apply the initial migration** - `985eac3` (feat)

**Plan metadata:** _pending — this commit_

## Files Created/Modified

**Task 1 (toolchain + primitives):**
- `package.json`, `package-lock.json`, `.nvmrc`, `.gitignore` - Node 22 pin, dependency manifest
- `tsconfig.json` - strict TypeScript, ES2023/NodeNext
- `vitest.config.ts` - `unit`/`spike` named projects (Vitest 4 API)
- `drizzle.config.ts`, `eslint.config.js`, `.prettierrc.json` - tooling config
- `src/config.ts`, `src/config.test.ts` - FLEET_HOME/FLEET_PORT resolution, 9 tests
- `src/cli/exit-codes.ts` - D-19 exit code constants

**Task 2 (tracer — full vertical slice):**
- `src/db/schema.ts` - Drizzle definitions for all four tables
- `src/db/index.ts` - `openDatabase`/`runMigrations`, WAL + busy_timeout + FK pragmas
- `src/types/better-sqlite3.d.ts` - local ambient declaration (see Deviations)
- `src/registry/git-inspect.ts` - `inspectRepo`/`deriveSlug`/`inferDefaultBranch`
- `src/registry/projects.ts` - `createProject`/`listProjects`
- `src/api/http/app.ts` - `buildApp`/`startDaemon`, explicit loopback bind
- `src/api/http/errors.ts` - D-19 structured error shape + Fastify error handler
- `src/api/http/routes/projects.ts` - `POST/GET /projects`
- `src/api/http/bind.test.ts` - OPS-04, 2 tests
- `src/cli/api-client.ts`, `src/cli/render.ts`, `src/cli/index.ts` - pure-HTTP CLI
- `src/registry/tracer.e2e.test.ts` - full `<behavior>` coverage, 9 tests

**Task 3 (migration, blocking):**
- `drizzle/0000_fat_callisto.sql`, `drizzle/meta/0000_snapshot.json`, `drizzle/meta/_journal.json` - committed migration
- `src/db/migrate.test.ts` - STATE-01/STATE-02, 4 tests

## Decisions Made
- Ran `npm run db:generate` once during Task 2 (uncommitted) so the tracer e2e tests could exercise a real migrated schema; committed it formally in Task 3 per the plan's file ownership, and confirmed Task 3's own `db:generate` run reported zero drift.
- `bind.test.ts` proves OPS-04 against a real bound socket (`app.server.address()`) rather than mocking `listen()`'s call arguments — a stronger runtime guarantee that the daemon actually binds loopback-only.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug in research premise] Vendored a local better-sqlite3 ambient type declaration**
- **Found during:** Task 2 (writing `src/db/index.ts`)
- **Issue:** 01-RESEARCH.md's Standard Stack table claims "better-sqlite3 13.x ships its own bundled TS types" and the plan's Task 1 action explicitly forbids installing `@types/better-sqlite3` on that basis. As actually installed, `better-sqlite3@13.0.1`'s `package.json` has no `types` field and the package ships zero `.d.ts` files — `npx tsc --noEmit` failed with `TS7016` on `import Database from 'better-sqlite3'`.
- **Fix:** Added `src/types/better-sqlite3.d.ts`, a repo-owned ambient declaration scoped to exactly the synchronous API surface Fleet uses (constructor, `pragma`, `prepare`/`Statement.run|get|all`, `transaction`, `close`), matching the shape drizzle-orm's own driver typings expect (`Database`, `Options`, `RunResult` exports). This honors the plan's underlying instruction — don't depend on the stale `@types/better-sqlite3` (last published against the 7.x API) — while fixing the factually incorrect premise about 13.x shipping types itself.
- **Files modified:** `src/types/better-sqlite3.d.ts` (new)
- **Verification:** `npx tsc --noEmit` exits 0; `package.json` has no `@types/better-sqlite3` entry (grep-verified per Task 1's own acceptance criteria)
- **Committed in:** `79eb610` (Task 2 commit)

**2. [Rule 1 - Bug] Suppressed git's expected stderr noise in `inferDefaultBranch`'s fallback attempts**
- **Found during:** Task 2 (running the tracer e2e tests for the first time)
- **Issue:** `git symbolic-ref refs/remotes/origin/HEAD` and `git rev-parse --abbrev-ref HEAD` printed `fatal: ...` directly into test output on their expected failure path (no explicit `stdio` option meant the default let stderr leak through), even though the failure is caught and handled — pure noise, not a real problem, but it obscured genuine failures.
- **Fix:** Added `stdio: ['ignore', 'pipe', 'pipe']` to both `execFileSync` calls, consistent with the other git shell-outs in the same file.
- **Files modified:** `src/registry/git-inspect.ts`
- **Verification:** Re-ran the full unit suite — 0 stray `fatal:` lines in output, all 24 tests still pass.
- **Committed in:** `79eb610` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — bug fixes; one corrected a factually wrong plan premise about a third-party package, the other removed test-output noise). No scope creep, no architectural changes.

## Issues Encountered
- The execution environment's default `node`/`npm` on `PATH` resolve to Node 20.19.4 (a shell function additionally makes bare `node` invocations recurse infinitely in this zsh setup). Every toolchain invocation (`npm install`, `tsc`, `vitest`, `drizzle-kit`) was run via the absolute Node 22.21.1 binary path to guarantee `better-sqlite3`'s native addon was built against the correct ABI. This is an environment quirk, not a code issue — no source files reference a specific Node path.
- `git rev-parse --abbrev-ref HEAD` fails (exit 128, "ambiguous argument 'HEAD'") on a git repo with zero commits (an unborn-HEAD repo). This surfaced during manual smoke testing with an uncommitted scratch repo and is expected, correct git behavior — the automated test suite's `makeRepoWithoutOrigin` fixture always commits a file first, so this edge case is exercised as the documented "could not determine default branch" warning path, not a bug.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The full stack (Node 22 → TS strict → Drizzle schema → migration runner → better-sqlite3 WAL → registry → Fastify+zod → loopback bind → HTTP CLI client) is proven end-to-end on one real path.
- `src/db/schema.ts` already defines `tasks` and `events` (unused by this plan) so Plan 02+ in this phase can build the state machine and event store against the committed schema without a further migration.
- No blockers for Plan 02 (state machine) or Plan 03/04 of this phase, which depend on this plan's toolchain and schema per the phase's wave structure.

## Self-Check: PASSED

- FOUND: src/config.ts
- FOUND: src/db/schema.ts
- FOUND: src/registry/git-inspect.ts
- FOUND: drizzle/0000_fat_callisto.sql
- FOUND: .planning/phases/01-foundation-registry-state-machine/01-01-SUMMARY.md
- FOUND commit: da94f0a (Task 1)
- FOUND commit: 79eb610 (Task 2)
- FOUND commit: 985eac3 (Task 3)
- FOUND commit: bf4777d (this SUMMARY.md commit)

---
*Phase: 01-foundation-registry-state-machine*
*Completed: 2026-07-22*

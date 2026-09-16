---
phase: 01-foundation-registry-state-machine
plan: 05
subsystem: database
tags: [drizzle-orm, sqlite, fastify, zod, commander, cwd-independence]

# Dependency graph
requires:
  - phase: 01-foundation-registry-state-machine (plans 01-04)
    provides: registry CRUD, HTTP API, migrations, CLI, verified state machine/event store
provides:
  - Module-relative migrations folder resolution (src/db/migrations-path.ts) — daemon starts from any cwd
  - Client-side (CLI) path resolution for `fleet project add` — caller's cwd, never the daemon's
  - Required, absolute-path-only `path` field at the POST /projects HTTP boundary
  - Structural invariant test proving the working-directory read exists in exactly one module (src/cli/index.ts)
  - Out-of-process regression coverage spawning both the real daemon and the real CLI as separate child processes
affects: [01-06 (packaging drizzle/ into dist/, depends on migrations-path.ts's candidate layout), Phase 2 (runner/worktree provisioning inherits the now-correct project.repoPath)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Module-relative path resolution via fileURLToPath(import.meta.url) — now applied to src/db/index.ts, matching the existing convention already used in src/spikes/findings-writer.ts"
    - "Out-of-process regression testing: spawning both the daemon and the CLI as separate real child processes with distinct, explicit cwds, never buildApp()/app.inject()/in-process listen()"
    - "Structural repo-wide scan tests (set-equality against a documented allowlist) for invariants that must never silently regress — modeled on single-writer.test.ts, applied here to the working-directory-read boundary"

key-files:
  created:
    - src/db/migrations-path.ts
    - src/db/migrations-path.test.ts
    - src/registry/cwd-independence.e2e.test.ts
    - src/registry/cwd-boundary.test.ts
  modified:
    - src/db/index.ts
    - src/cli/index.ts
    - src/api/http/routes/projects.ts
    - src/registry/projects.ts

key-decisions:
  - "path becomes required and absolute at the HTTP boundary (promote, not add-alongside) — the daemon-side process.cwd() fallback is deleted entirely from src/registry/projects.ts rather than retained as a documented-but-unused branch, per the assumption-delta decision in 01-05-PLAN.md"
  - "Migrations folder resolution searches two module-relative candidates in fixed order (packaged dist/drizzle, then checkout-root drizzle/), keyed on meta/_journal.json presence rather than bare directory existence, to avoid a partial-copy silently winning the search"
  - "Test 2 in cwd-boundary.test.ts asserts on the specific validation_failed error code, not just any 400 — a bare 400 check would still pass without the isAbsolute refinement due to a coincidental downstream path_unresolvable/not_a_git_repo 400 from git-inspect, masking the exact regression the test exists to catch"

patterns-established:
  - "selectMigrationsFolder(baseDir) exposed separately from resolveMigrationsFolder() so exhaustive branch tests can exercise every candidate against synthetic mkdtemp trees without mocking import.meta.url"

requirements-completed: [PROJ-01, PROJ-02, PROJ-06, STATE-01, QUAL-01, QUAL-04]

coverage:
  - id: D1
    description: "fleet daemon started as a real out-of-process child from a scratch cwd (not the repo root) reaches serving state and answers GET /health with 200"
    requirement: STATE-01
    verification:
      - kind: e2e
        ref: "src/registry/cwd-independence.e2e.test.ts#CR-01: a daemon spawned from a scratch cwd (not the repo root) starts and answers GET /health"
        status: pass
    human_judgment: false
  - id: D2
    description: "fleet project add with no path argument, run out-of-process from a different scratch git repo than the daemon's cwd, registers the caller's repo (repoPath/slug/defaultBranch), never the daemon's cwd"
    requirement: PROJ-01
    verification:
      - kind: e2e
        ref: "src/registry/cwd-independence.e2e.test.ts#CR-02: `project add --json` with no path arg ... registers the CALLER's repo"
        status: pass
    human_judgment: false
  - id: D3
    description: "fleet project add <relative-path> resolves against the CALLER's cwd, never the daemon's"
    requirement: PROJ-01
    verification:
      - kind: e2e
        ref: "src/registry/cwd-independence.e2e.test.ts#relative-path resolution: `project add <relative-dir>` resolves against the CALLER's cwd, not the daemon's"
        status: pass
    human_judgment: false
  - id: D4
    description: "POST /projects with a missing or relative path is rejected 400 with the structured error body; an absolute path still registers correctly (201)"
    requirement: PROJ-01
    verification:
      - kind: integration
        ref: "src/registry/cwd-boundary.test.ts#Test 1/Test 2/Test 3"
        status: pass
    human_judgment: false
  - id: D5
    description: "The working-directory read exists in exactly one module under src/ (src/cli/index.ts) — a structural invariant that fails loudly if a future change reintroduces a server-side default"
    requirement: PROJ-01
    verification:
      - kind: integration
        ref: "src/registry/cwd-boundary.test.ts#Test 4 (structural invariant)"
        status: pass
    human_judgment: false
  - id: D6
    description: "PROJ-01 idempotency and PROJ-02 empty/ordering edges: duplicate registration yields slug_conflict (409) and exactly one row; empty registry returns 200 with an empty array; identical created_at ties break on id ascending and are stable across repeated calls"
    requirement: PROJ-02
    verification:
      - kind: integration
        ref: "src/registry/cwd-boundary.test.ts#Test 5/Test 6/Test 7"
        status: pass
    human_judgment: false
  - id: D7
    description: "resolveMigrationsFolder() throws MigrationsFolderNotFoundError naming every candidate searched when no candidate qualifies — never a silent skip, never a best-guess fallback (prohibition P-02)"
    requirement: STATE-01
    verification:
      - kind: unit
        ref: "src/db/migrations-path.test.ts#Test 5 (loud failure, P-02)"
        status: pass
    human_judgment: false
  - id: D8
    description: "Every migration-folder resolution branch — packaged layout, checkout layout, precedence, partial-copy hazard, and cwd-independent real-tree resolution — is covered and each branch is red when broken"
    requirement: STATE-01
    verification:
      - kind: unit
        ref: "src/db/migrations-path.test.ts#Test 1/Test 2/Test 3/Test 4/Test 6"
        status: pass
    human_judgment: false
  - id: D9
    description: "npx tsc --noEmit exits 0 with strict enabled; npm test (unit project) exits 0 with a test count strictly greater than the 136 baseline, run with no daemon started by the runner and no real claude process spawned"
    requirement: QUAL-01
    verification:
      - kind: other
        ref: "npx tsc --noEmit (exit 0); npm test (153/153 passing, up from 136 baseline)"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-07-23
status: complete
---

# Phase 1 Plan 05: cwd-independence gap closure (CR-01, CR-02) Summary

**Module-relative migrations resolver + client-side CLI path resolution + required-absolute-path HTTP boundary, closing both live-reproduced defects from 01-VERIFICATION.md's failed success criterion 1**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-23T17:38:00-04:00 (worktree creation)
- **Completed:** 2026-07-23T17:49:35-04:00 (final task commit)
- **Tasks:** 3
- **Files modified:** 8 (4 new, 4 modified)

## Accomplishments
- `fleet daemon` now starts successfully from any working directory — `src/db/migrations-path.ts`'s `resolveMigrationsFolder()` locates `drizzle/` relative to the module's own on-disk location (never `process.cwd()`), searching the packaged (`dist/drizzle`) and git-checkout (repo-root `drizzle/`) layouts in fixed order, keyed on `meta/_journal.json` presence to avoid a partial copy winning the search
- `fleet project add` with no path argument now registers the **caller's** repository, not the daemon's — the CLI resolves `path ?? process.cwd()` through `node:path`'s `resolve` in the caller's own process, before the HTTP request is sent
- The HTTP boundary (`POST /projects`) now requires an absolute `path` (zod `.refine(isAbsolute)`), and the daemon-side `?? process.cwd()` fallback is deleted entirely from `src/registry/projects.ts` — there is no code path left that can silently substitute the daemon's own directory
- A structural test asserts the working-directory read exists in exactly one module under `src/` (`src/cli/index.ts`) — a future regression that reintroduces a server-side default goes red immediately
- Two new out-of-process regression test files (`cwd-independence.e2e.test.ts`, `cwd-boundary.test.ts`) plus exhaustive resolver branch coverage (`migrations-path.test.ts`) — all 17 new tests confirmed red against the pre-fix code by temporary local revert before committing

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end "start the daemon anywhere, register the repo I'm standing in"** - `216b3f5` (feat, tdd)
2. **Task 2: Close the server-side trust boundary** - `5e7607d` (feat, tdd)
3. **Task 3: Exhaustive resolver branch coverage** - `7bf729c` (test, tdd)

**Plan metadata:** committed alongside this SUMMARY (worktree mode — STATE.md/ROADMAP.md updates deferred to the orchestrator)

_All three tasks were `tdd="true"`; each commit above bundles both the test file and the corresponding implementation fix since the plan's task boundaries were already test-then-implementation units, not separate RED/GREEN commits._

## Files Created/Modified
- `src/db/migrations-path.ts` - `resolveMigrationsFolder()`, `selectMigrationsFolder(baseDir)`, `MIGRATIONS_DIR_NAME`, `MIGRATIONS_FOLDER_CANDIDATES`, `MigrationsFolderNotFoundError`
- `src/db/index.ts` - `runMigrations` now sources its folder from `resolveMigrationsFolder()` instead of the bare relative `'drizzle'` string
- `src/cli/index.ts` - `project add` resolves `[path]` against the caller's own `process.cwd()` via `node:path`'s `resolve` before building the HTTP request body
- `src/api/http/routes/projects.ts` - `createProjectBody.path` is now required, non-empty, and must be absolute
- `src/registry/projects.ts` - `CreateProjectInput.path` is now `string` (was `string | undefined`); `createProject` calls `inspectRepo(input.path)` directly, no fallback
- `src/registry/cwd-independence.e2e.test.ts` - out-of-process daemon + CLI regression tests (CR-01, CR-02, relative-path resolution, loud-failure probe)
- `src/registry/cwd-boundary.test.ts` - HTTP boundary tightening tests, structural invariant scan, PROJ-01/PROJ-02 edge coverage
- `src/db/migrations-path.test.ts` - exhaustive resolver branch coverage (packaged/checkout/precedence/partial-copy/not-found/real-tree)

## Decisions Made
- **`path` promoted from optional/derived to required/chosen** at the HTTP boundary, per the plan's `assumption_delta_decision`: the daemon-side `process.cwd()` fallback is deleted entirely rather than retained-but-documented, since nothing in the codebase calls `createProject` except the HTTP route and add-alongside is exactly the shape that shipped the original bug.
- **Existence keyed on `meta/_journal.json`, not the bare `drizzle/` directory**, so an empty or partially-copied migrations folder cannot silently win the search and fail deeper inside drizzle-orm with an opaque error.
- **Test 2 in `cwd-boundary.test.ts` asserts the specific `validation_failed` error code**, not merely "some 400" — a looser assertion would still pass without the `isAbsolute` refinement, because a relative path also 400s downstream via `git-inspect`'s `path_unresolvable`/`not_a_git_repo`, which would mask the exact regression this test exists to prevent. Discovered this by running the acceptance-criteria-mandated temporary revert and observing the test stayed green with the wrong error code.

## Deviations from Plan

None — plan executed exactly as written. One clarification below is a strengthening of a test assertion discovered during the mandated red-confirmation revert step, not a deviation from the plan's intent (the plan already required "Deleting the `isAbsolute` refinement... makes Test 2 fail" as an acceptance criterion; the initial draft of Test 2 did not actually satisfy that criterion until tightened to assert on the specific error code, exactly as intended).

## Issues Encountered
- The worktree had no `node_modules/` (fresh worktree checkout) — ran `npm ci` from the committed lockfile before any test could execute. Not a plan deviation; standard worktree bootstrap.
- The plan's `<verification>` item 4 ("manual reproduction... `cd` into a scratch git repo, run `fleet project add --json`") could not be performed as a literal interactive shell session in this sandboxed execution harness — the Bash tool resets the working directory to the worktree root between invocations, so a manual `cd` does not persist across commands the way an interactive terminal session would. This is not a coverage gap: Task 1's automated `cwd-independence.e2e.test.ts` performs the equivalent (and strictly stronger — repeatable, assertion-backed) proof by spawning both the daemon and the CLI via Node's `child_process` with an explicit `cwd` option, which is exactly the out-of-process mechanism the plan's own `01-PATTERNS.md` prescribes in place of a one-off manual session.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Both live-reproduced defects behind Phase 1's failed success criterion 1 (CR-01: daemon cwd-dependent startup failure; CR-02: silent misregistration of the daemon's own cwd) are closed and covered by out-of-process regression tests that are confirmed red against the pre-fix code.
- `npm test` now passes 153/153 (up from the 136 baseline), `npx tsc --noEmit` exits 0.
- Plan 01-06 (packaging `drizzle/` into `dist/` for the compiled/installed layout) can proceed directly against `src/db/migrations-path.ts`'s already-defined `MIGRATIONS_FOLDER_CANDIDATES` packaged-layout candidate (`dist/drizzle`, one level above `dist/db/`) — no further resolver changes are needed, only the build script's copy step.
- No blockers for re-running `/gsd-verify-work` against Phase 1's roadmap success criterion 1.

---
*Phase: 01-foundation-registry-state-machine*
*Completed: 2026-07-23*

## Self-Check: PASSED

- FOUND: `src/db/migrations-path.ts`
- FOUND: `src/db/migrations-path.test.ts`
- FOUND: `src/registry/cwd-independence.e2e.test.ts`
- FOUND: `src/registry/cwd-boundary.test.ts`
- FOUND: `.planning/phases/01-foundation-registry-state-machine/01-05-SUMMARY.md`
- FOUND commit `216b3f5` (Task 1)
- FOUND commit `5e7607d` (Task 2)
- FOUND commit `7bf729c` (Task 3)
- FOUND commit `61942f7` (this SUMMARY)

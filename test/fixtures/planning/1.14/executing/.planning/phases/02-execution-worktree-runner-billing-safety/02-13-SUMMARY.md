---
phase: 02-execution-worktree-runner-billing-safety
plan: 13
subsystem: runner
tags: [wall-clock-cap, precedence, billing-safety, event-store, drizzle, vitest]

# Dependency graph
requires:
  - phase: 02-execution-worktree-runner-billing-safety
    provides: "tasks.wall_clock_cap_ms resolved and persisted on every row by tasks/service.ts's createTask() (task > .fleet.yml > Fleet config > default order, D-11); WorktreeRunner.spawn()'s resolveCaps/CapsSource/CAPS_LAYER_ORDER shape and the wall-clock setTimeout it feeds (plan 02-06); the WorktreeRunnerOptions.db/recordIfDbPresent()/recordEvent() wiring point left unconnected at app.ts by earlier plans; single-writer.test.ts's EXPECTED_TASK_WRITERS invariant (STATE-05)"
provides:
  - "RunnerTask.wallClockCapMs — a required number field carrying the ALREADY-RESOLVED per-task wall-clock cap from the task row, populated by Scheduler.dispatch() from taskRow.wallClockCapMs"
  - "MAX_WALL_CLOCK_CAP_MS (2147483647) — a resolution ceiling in worktree-runner.ts's resolveOneCap, applied only to wallClockCapMs, that rejects a cap above the largest delay a Node setTimeout can represent instead of silently firing on the next tick"
  - "WorktreeRunner.spawn()'s cap resolution: the task row is now the highest-priority TASK layer, WorktreeRunnerOptions.caps demoted to the CONFIG layer — a per-task value genuinely wins over an instance-wide fallback"
  - "buildApp()'s default WorktreeRunner construction passes deps.db alongside the existing onRateLimit callback, so the wall-clock TIMEOUT and apiKeySource CRASH are recorded by their specific kind rather than only the Scheduler's generic post-spawn CRASH"
affects: [dashboard, cli]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A resolution ceiling applied to exactly one field of a shared multi-field resolver (resolveOneCap's optional maxValue parameter), rather than a parallel validation function — the zero/negative/fractional rule stays identical across maxTurns/wallClockCapMs/setupTimeoutMs, only the upper bound differs and only for the one field with a timer behind it."
    - "A unit-level assertion of a resolver's output (resolveCaps's own return value, called with the exact input shape spawn() constructs) as proof that a cap reaches the timer that fires it, rather than waiting out a real timer — the boundary/precision cases are pinned this way, and the wait-based proof is reserved for the one integration scenario that specifically needs a real child process reaped."
    - "Prepending a fixture bin dir onto process.env.PATH (not a wholesale replacement) when a test needs the DAEMON's own default-constructed runner — not an explicitly test-injected one — to resolve a fake claude binary, because a wholesale PATH replacement also breaks the daemon's own git-shelling-out calls (ensureWorktree/archiveWorktree), which run under the daemon's inherited environment, not the worker's allowlisted one."

key-files:
  created: []
  modified:
    - src/runner/runner.interface.ts
    - src/runner/worktree-runner.ts
    - src/runner/worktree-runner.test.ts
    - src/runner/worktree-runner.integration.test.ts
    - src/runner/rate-limit.test.ts
    - src/scheduler/queue.ts
    - src/tasks/service.ts
    - src/api/http/app.ts

key-decisions:
  - "MAX_WALL_CLOCK_CAP_MS is set to 2147483647 (2^31 - 1), the largest delay node:timers' setTimeout represents before its internal 32-bit signed integer overflows and the delay silently clamps to fire on the next tick — confirmed against the constant's own documented Node behavior, not merely asserted in prose. The ceiling is applied to wallClockCapMs only inside resolveOneCap (via an optional maxValue parameter), never to maxTurns or setupTimeoutMs, since neither has a timer behind it."
  - "WorktreeRunnerOptions.caps is demoted from the wiring point it was in prior plans to a lower-priority instance-wide fallback: WorktreeRunner.spawn() now resolves caps with the task row's own wallClockCapMs/maxTurns as the TASK layer and this.options.caps as the CONFIG layer. This is the entire point of the plan — a per-task value must win over a runner-construction-time override, or nothing closes."
  - "queue.ts imports DEFAULT_WALL_CLOCK_CAP_MS from worktree-runner.ts rather than declaring a third local copy of the constant (queue.ts already has its own local DEFAULT_MAX_TURNS duplicating tasks/service.ts's — the plan's own instruction was not to add a second instance of that same duplication for the wall-clock default)."
  - "tasks/service.ts's cancelTask() populates wallClockCapMs on the RunnerTask it builds using the file's own local DEFAULT_WALL_CLOCK_CAP_MS constant (already present, same 1_800_000 value as the runner's), matching the existing pattern for maxTurns in that same construction rather than importing a cross-module default for a value that is irrelevant to a kill()-only call."
  - "The new default-runner integration test mutates process.env.PATH directly (prepended, not replaced) rather than injecting workerEnv on a test-constructed runner, because the whole point of that scenario is to exercise buildApp()'s DEFAULT construction (no workerEnv override exists on that path) — a wholesale PATH replacement was tried first and broke the daemon's own git calls (ENOENT), so the fix prepends the fixture dir instead of replacing PATH outright."
  - "rate-limit.test.ts and tasks/service.ts's cancelTask (neither named in this plan's files_modified) needed a wallClockCapMs value added to satisfy the new required RunnerTask field — Rule 3 (blocking compile error), not scope creep: RunnerTask.wallClockCapMs being required is exactly what Task 1's must-haves call for."

requirements-completed: [RUN-03]

coverage:
  - id: D1
    description: "A task's persisted wall_clock_cap_ms is the value that arms the timer that kills it — the task row is the highest-priority layer in WorktreeRunner.spawn()'s cap resolution, ahead of any runner-construction-time override"
    requirement: "RUN-03"
    verification:
      - kind: unit
        ref: "src/runner/worktree-runner.test.ts#resolveCaps (RUN-03 precision, D-11) — a RunnerTask-shaped task-layer cap wins over a lower-priority options.caps config-layer cap"
        status: pass
      - kind: integration
        ref: "src/runner/worktree-runner.integration.test.ts#kills a hung session at its wall-clock cap ... (taREDACTED_SECRET cap via POST /tasks payload, not a runner-construction-time override)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Zero, negative, and fractional wallClockCapMs values are rejected loudly at resolution rather than silently coerced or treated as inherit; exactly 1ms is accepted"
    requirement: "RUN-03"
    verification:
      - kind: unit
        ref: "src/runner/worktree-runner.test.ts#resolveCaps (RUN-03 precision, D-11) — rejects a task-layer wallClockCapMs of zero/negative/fractional; accepts exactly 1ms"
        status: pass
    human_judgment: false
  - id: D3
    description: "A wallClockCapMs above the largest Node timer delay (2147483647) is rejected loudly rather than handed to setTimeout, where it would silently fire on the next tick and invert the safety backstop into an instant kill; exactly the ceiling is accepted"
    requirement: "RUN-03"
    verification:
      - kind: unit
        ref: "src/runner/worktree-runner.test.ts#resolveCaps (RUN-03 precision, D-11) — rejects a wallClockCapMs one millisecond above MAX_WALL_CLOCK_CAP_MS, and accepts exactly the ceiling"
        status: pass
    human_judgment: false
  - id: D4
    description: "A task whose cap is absent on the row still gets the built-in default (1,800,000ms) rather than no timer at all"
    requirement: "RUN-03"
    verification:
      - kind: unit
        ref: "src/runner/worktree-runner.test.ts#resolveCaps (RUN-03 precision, D-11) — a RunnerTask carrying the built-in default wallClockCapMs still resolves to that default with no config-layer override present"
        status: pass
    human_judgment: false
  - id: D5
    description: "The production WorktreeRunner constructed in buildApp() is given the database handle, so the wall-clock TIMEOUT and apiKeySource CRASH are recorded by their specific kind rather than flattened into the Scheduler's generic post-spawn CRASH"
    requirement: "RUN-03"
    verification:
      - kind: integration
        ref: "src/runner/worktree-runner.integration.test.ts#the DEFAULT runner buildApp() constructs (no injected scheduler) also receives the database handle: a hung session records a TIMEOUT-typed row readable from SQLite, not merely a generic CRASH"
        status: pass
    human_judgment: false
  - id: D6
    description: "Passing the database handle to the runner does not add a second writer against the tasks table — the repository-wide single-writer scan resolves to exactly the same permitted-writer set it did before this plan"
    requirement: "RUN-03"
    verification:
      - kind: unit
        ref: "src/core/event-store/single-writer.test.ts#only the enumerated modules write against the tasks table"
        status: pass
    human_judgment: false
  - id: D7
    description: "A hung session is still reaped at its cap with no orphaned children after the cap became per-task — the real spawned child-and-grandchild teardown proof is re-run against a taREDACTED_SECRET cap"
    requirement: "RUN-04"
    verification:
      - kind: integration
        ref: "src/runner/worktree-runner.integration.test.ts#kills a hung session at its wall-clock cap, records a TIMEOUT event, reaps the child AND its grandchild, and archives the worktree"
        status: pass
      - kind: unit
        ref: "src/runner/worktree-runner.test.ts#WorktreeRunner wall-clock cap and teardown (RUN-03, RUN-04) — a hung session is killed at its 500ms wall-clock cap, its grandchild is reaped too"
        status: pass
    human_judgment: false

duration: ~19min
completed: 2026-07-26
status: complete
---

# Phase 2 Plan 13: Per-Task Wall-Clock Cap Threading and Production DB Handle Wiring Summary

**RunnerTask now carries the task row's already-resolved wall-clock cap as a required field, arming the real setTimeout ahead of any runner-construction-time override; a MAX_WALL_CLOCK_CAP_MS ceiling stops an over-large cap from silently inverting into an instant kill; and buildApp()'s default runner now receives the database handle so its own TIMEOUT/apiKeySource terminations record their specific kind.**

## Performance

- **Duration:** ~19 min
- **Started:** 2026-07-26T18:04:00Z (approx, base commit `02da0a5`)
- **Completed:** 2026-07-26T18:22:45Z
- **Tasks:** 2 of 2
- **Files modified:** 8 (across both task commits; no files created)

## Accomplishments

- `RunnerTask.wallClockCapMs` — a required `number` field carrying the task row's already-resolved wall-clock cap, so "the runner was handed no cap" is unrepresentable at the type level rather than a re-defaulting case at spawn time.
- `WorktreeRunner.spawn()`'s cap resolution now takes the task row as the TASK layer (highest priority) and demotes `WorktreeRunnerOptions.caps` to the CONFIG layer — closing the actual break this plan targeted: production previously killed every task at the hardcoded 30-minute default regardless of what its row said.
- `Scheduler.dispatch()` populates `wallClockCapMs` on the `RunnerTask` it assembles from `taskRow.wallClockCapMs`, mirroring the existing `maxTurns` line and importing the shared default rather than declaring a third copy of the constant.
- `MAX_WALL_CLOCK_CAP_MS` (`2_147_483_647`, the largest delay a Node `setTimeout` represents) enforced in `resolveOneCap`, applied only to `wallClockCapMs` — a value above it now throws instead of silently converting the safety backstop into an instant kill on the next tick.
- `buildApp()`'s default `WorktreeRunner` construction now passes `deps.db` alongside the existing `onRateLimit` callback, scoped to the default runner exactly like that callback — a caller supplying its own `deps.scheduler` still owns its own wiring.
- `worktree-runner.integration.test.ts`'s hang-and-kill scenario now sources its cap from the task row (via the `POST /tasks` payload) instead of the now-demoted runner-construction-time override, proving the production chain end to end; a new scenario drives `buildApp({ db })` with NO injected scheduler specifically to exercise the default-construction wiring this task adds, and reads a `TIMEOUT`-typed row back from SQLite.
- `single-writer.test.ts`'s `EXPECTED_TASK_WRITERS` set is unchanged — confirmed by that test still passing verbatim, with no new entry added to accommodate the runner's newly-present handle.

## Task Commits

Each completed task was committed atomically:

1. **Task 1: Thread the persisted per-task wall-clock cap into the timer that actually fires** - `273d74f` (feat)
2. **Task 2: Give the production runner its database handle, without adding a second writer** - `c7c5752` (feat)

**Plan metadata:** committed alongside this SUMMARY (worktree mode — STATE.md/ROADMAP.md excluded; orchestrator updates those centrally after the wave merges).

## Files Created/Modified

- `src/runner/runner.interface.ts` - `RunnerTask.wallClockCapMs` required field, doc comment in `agentProfileName`'s voice
- `src/runner/worktree-runner.ts` - `MAX_WALL_CLOCK_CAP_MS` constant, `resolveOneCap`'s optional ceiling parameter, `spawn()`'s taREDACTED_SECRET cap resolution, `WorktreeRunnerOptions.caps`/`.db` doc comment revisions
- `src/scheduler/queue.ts` - `dispatch()`'s `RunnerTask` assembly populates `wallClockCapMs` from the task row, importing the shared default
- `src/tasks/service.ts` - `cancelTask()`'s `RunnerTask` construction gains `wallClockCapMs` (irrelevant to a `kill()`-only call, filled with the built-in default)
- `src/runner/worktree-runner.test.ts` - boundary/precision `resolveCaps` tests for `wallClockCapMs` (zero/negative/fractional/1ms/ceiling), `makeRunnerTask()` helpers updated, cap-driven scenarios moved onto the task row
- `src/runner/worktree-runner.integration.test.ts` - hang-and-kill scenario's cap moved to the task row; new default-runner-with-db scenario proving `app.ts`'s production wiring
- `src/runner/rate-limit.test.ts` - `wallClockCapMs` added to a pre-existing `RunnerTask` literal (Rule 3 compile fix, not in `files_modified`)
- `src/api/http/app.ts` - default `WorktreeRunner` construction now passes `db: deps.db`

## Decisions Made

See `key-decisions` in frontmatter. Summary:

- `MAX_WALL_CLOCK_CAP_MS = 2_147_483_647`, applied only to `wallClockCapMs` inside the shared `resolveOneCap`, never to `maxTurns`/`setupTimeoutMs`.
- `WorktreeRunnerOptions.caps` demoted to the CONFIG layer, task row promoted to TASK — the entire point of the plan.
- `queue.ts` imports the shared `DEFAULT_WALL_CLOCK_CAP_MS` rather than duplicating the constant a third time.
- `cancelTask()`'s `RunnerTask` uses the file's own existing local default (already present, same value) rather than a cross-module import for a value irrelevant to a `kill()`-only path.
- The new default-runner integration test mutates `process.env.PATH` by prepending (not replacing) — a wholesale replacement broke the daemon's own `git` calls, discovered and fixed during this execution (see Issues Encountered).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `wallClockCapMs` to `rate-limit.test.ts`'s pre-existing `RunnerTask` literal**
- **Found during:** Task 1 (typecheck, after adding the required field)
- **Issue:** `rate-limit.test.ts` (not in this plan's `files_modified`) constructs a `RunnerTask` literal directly; the new required field broke `tsc --noEmit` there.
- **Fix:** Imported `DEFAULT_WALL_CLOCK_CAP_MS` from `worktree-runner.js` and added `wallClockCapMs: taskRow.wallClockCapMs ?? DEFAULT_WALL_CLOCK_CAP_MS` to the literal, matching the pattern already used for `maxTurns` in the same object.
- **Files modified:** `src/runner/rate-limit.test.ts`
- **Verification:** `npm run typecheck` exits 0; `npm test -- src/runner/rate-limit.test.ts` passes.
- **Committed in:** `273d74f` (Task 1 commit)

**2. [Rule 1 - Bug] Moved `worktree-runner.test.ts`'s two cap-driven scenarios onto the task row**
- **Found during:** Task 1 (after implementing the taREDACTED_SECRET precedence change)
- **Issue:** Two pre-existing tests in this plan's own `files_modified` file constructed the runner with `caps: { wallClockCapMs: 500 }` / `caps: { wallClockCapMs: 30_000 }` — the CONFIG layer, now lower priority than the task row's default 30-minute value. Left unchanged, the 500ms test would wait out the full default cap instead of firing at 500ms, timing out the test.
- **Fix:** `makeRunnerTask()` now accepts an optional `wallClockCapMs` parameter threaded through `createTask()`'s own real resolution (not hand-set on the returned object), and the two scenarios pass their cap there instead of via the runner constructor's `caps` option.
- **Files modified:** `src/runner/worktree-runner.test.ts`
- **Verification:** Both scenarios pass; the 500ms test still completes in well under its 10s timeout.
- **Committed in:** `273d74f` (Task 1 commit)

**3. [Rule 1 - Bug] Fixed the new default-runner test's PATH mutation strategy**
- **Found during:** Task 2 (writing the new integration scenario)
- **Issue:** First attempt replaced `process.env.PATH` wholesale with only the fixture bin dir and node's own dir (mirroring `FIXTURE_PATH_OVERRIDE`'s convention for the WORKER env). This broke the DAEMON's own `git` calls inside `ensureWorktree()`/`archiveWorktree()`, which run under the daemon's inherited `process.env`, not the allowlisted worker env — the test failed with a `CRASH` event carrying `spawnSync git ENOENT` instead of a `TIMEOUT`.
- **Fix:** Prepend the fixture bin dir onto the ORIGINAL `process.env.PATH` instead of replacing it, so `git`/`node` stay resolvable for the daemon's own calls while the fixture's `claude` still resolves first.
- **Files modified:** `src/runner/worktree-runner.integration.test.ts`
- **Verification:** The new scenario passes; ran with debug logging to confirm the exact failure mode before fixing.
- **Committed in:** `c7c5752` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 Rule 3 blocking compile fix, 2 Rule 1 bug fixes to keep existing/new tests correctly exercising the new precedence).
**Impact on plan:** All three were required by Task 1/2's own type and precedence changes — no scope creep; each is a direct, necessary consequence of making the per-task cap real.

## Issues Encountered

- The typecheck run also surfaced `TERMINAL_STATES.includes(row.status)` failing to compile in the new integration test (`TERMINAL_STATES` is typed narrower than `TaskState`) — fixed with a `readonly string[]` cast, consistent with how the array is consumed elsewhere in the codebase as a broader membership check. No behavior change, compile-only fix, folded into the Task 2 commit.
- Confirmed via `git stash`/re-run that 8 pre-existing failures across 4 files (`src/db/packaging.e2e.test.ts`, `src/registry/cwd-independence.e2e.test.ts`, `src/registry/registry.test.ts`, `src/registry/tracer.e2e.test.ts`) exist on the Task-1-only baseline too — these spawn real daemon subprocesses via `tsx` and fail in this sandboxed environment independent of this plan's changes. Out of scope per the deviation rules' scope boundary; not touched.

## Known Stubs

None. Every code path this plan adds is real: `resolveCaps` genuinely enforces the ceiling, `Scheduler.dispatch()` genuinely reads the task row's persisted cap, `buildApp()`'s default construction genuinely passes the database handle, and every new/modified test drives the real production path (HTTP → Scheduler → WorktreeRunner → recordEvent → SQLite), asserting on persisted database state rather than a mock or spy.

## Threat Flags

None beyond what this plan's own `<threat_model>` already registers (T-2-42 through T-2-46) — no new surface was introduced outside that register.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `npm test` (whole `unit` project): 470 passed, 4 skipped, 8 pre-existing/unrelated failures (same 4 files, same count, on both the Task-1-only baseline and the final Task-2 state — confirmed via `git stash`).
- `npm run typecheck` exits 0; `npm run lint` exits 0.

<!-- FIXTURE TRUNCATED at 20 KiB by M0-G capture; original size 21057 bytes -->

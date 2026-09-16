---
phase: 02-execution-worktree-runner-billing-safety
plan: 15
subsystem: api
tags: [typescript, fastify, drizzle, vitest, cli]

# Dependency graph
requires:
  - phase: 02-execution-worktree-runner-billing-safety
    provides: "plan 02-04's tracer (started_at/ended_at columns, recordEvent's extra-fields merge) and plan 02-08's HTTP task routes/CLI table this plan wires duration into"
provides:
  - "taskDurationSeconds(startedAt, endedAt) — pure whole-second duration derivation with 9 boundary cases pinned by tests"
  - "toTaskRepresentation(row) — the single shaping function every taREDACTED_SECRET route now passes through"
  - "durationSeconds wire field on POST /tasks, GET /tasks, GET /tasks/:id, and POST /tasks/:id/cancel"
  - "a DURATION column in the CLI's taskColumns, immediately after TURNS"
affects: [status-hooks-reconciliation, dashboard-review]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Presentation-boundary derivation: a value computed from two persisted columns at read time, never itself persisted, with a single shaping function as the one place it is attached"

key-files:
  created: []
  modified:
    - src/tasks/service.ts
    - src/tasks/service.test.ts
    - src/api/http/routes/tasks.ts
    - src/api/http/routes/tasks.test.ts
    - src/cli/index.ts
    - .planning/REQUIREMENTS.md

key-decisions:
  - "Duration truncates toward zero (never rounds) and clamps a negative clock-skew delta to zero, per plan 02-04's recorded flagged assumption — both choices are documented in taskDurationSeconds's own doc comment so a later reader does not silently change them"
  - "null and 0 are asserted as separate cases everywhere (function, route tests, CLI glyph) — null means 'not yet knowable', 0 means 'ran in under a second'; collapsing them would hide a stuck task as identical to an instant one"
  - "No database column, no migration — durationSeconds is derived on every read from started_at/ended_at, which stay the single source of truth"

patterns-established:
  - "toTaskRepresentation as the one shaping function every taREDACTED_SECRET HTTP handler passes its row(s) through, preventing per-route field drift"

requirements-completed: [TASK-05]

coverage:
  - id: D1
    description: "taskDurationSeconds derives a whole-second, truncated-toward-zero duration from started_at/ended_at, distinguishing 'not yet knowable' (null) from 'ran under a second' (0), clamping clock skew to 0, and degrading an unparseable timestamp to null"
    requirement: "TASK-05"
    verification:
      - kind: unit
        ref: "src/tasks/service.test.ts#taskDurationSeconds (TASK-05)"
        status: pass
    human_judgment: false
  - id: D2
    description: "toTaskRepresentation preserves every column of a task row unchanged and adds durationSeconds under its own key"
    requirement: "TASK-05"
    verification:
      - kind: unit
        ref: "src/tasks/service.test.ts#toTaskRepresentation (TASK-05)"
        status: pass
    human_judgment: false
  - id: D3
    description: "durationSeconds is present in the response body of all four taREDACTED_SECRET HTTP routes (create, list, show, cancel)"
    requirement: "TASK-05"
    verification:
      - kind: integration
        ref: "src/api/http/routes/tasks.test.ts#durationSeconds is present on the POST /tasks, GET /tasks, and GET /tasks/:id responses"
        status: pass
      - kind: integration
        ref: "src/api/http/routes/tasks.test.ts#durationSeconds is present on the POST /tasks/:id/cancel response"
        status: pass
    human_judgment: false
  - id: D4
    description: "A task driven to a terminal state through a real dispatch (fake CLI fixture) reports a non-negative integer duration; a task still in flight reports null, not 0"
    requirement: "TASK-05"
    verification:
      - kind: integration
        ref: "src/api/http/routes/tasks.test.ts#a task driven to a terminal state through a real dispatch reports durationSeconds as a non-negative integer"
        status: pass
      - kind: integration
        ref: "src/api/http/routes/tasks.test.ts#a task still in flight reports durationSeconds as null, not 0"
        status: pass
    human_judgment: false
  - id: D5
    description: "The CLI's taskColumns gains a DURATION column immediately after TURNS, rendering the absent case with the existing BRANCH '-' glyph and a present value with a trailing 's'; the CLI-isolation and route-map assertions in parity.test.ts still pass"
    requirement: "TASK-05"
    verification:
      - kind: unit
        ref: "src/cli/parity.test.ts (CLI isolation (D-01), TASK_ROUTE_MAP)"
        status: pass
    human_judgment: false

duration: 55min
completed: 2026-07-26
status: complete
---

# Phase 2 Plan 15: Task Duration Surfaced (TASK-05) Summary

**`taskDurationSeconds` derives a truncated whole-second duration from `started_at`/`ended_at` at the presentation boundary; `toTaskRepresentation` is the single shaping function every taREDACTED_SECRET route and the CLI's new DURATION column now read it through.**

## Performance

- **Duration:** 55 min
- **Started:** 2026-07-26T18:13:00Z (approx, first file read)
- **Completed:** 2026-07-26T18:18:35Z
- **Tasks:** 2 completed
- **Files modified:** 6

## Accomplishments
- `taskDurationSeconds(startedAt, endedAt)` — pure function covering all nine boundary cases from the plan's `<behavior>` list: sub-second spans, truncation at the 1999ms/1s line, identical timestamps, not-yet-started, started-not-ended, ended-without-started, clock-skew clamping, and unparseable timestamps on either side
- `toTaskRepresentation(row)` — the single shaping function; `POST /tasks`, `GET /tasks`, `GET /tasks/:id`, and `POST /tasks/:id/cancel` now all route their task(s) through it, so `durationSeconds` cannot be present on one response and missing from another
- CLI's `taskColumns` gains a `DURATION` column right after `TURNS` (D-29 pairs them as the usage proxy), reusing `BRANCH`'s existing `-` glyph for the absent case and appending `s` to a present value so a bare `0` reads unambiguously as zero seconds
- No schema change, no migration, no `drizzle/` file — verified by `git diff --stat src/db/schema.ts` reporting no change
- `.planning/REQUIREMENTS.md` marks TASK-05 complete in both the checkbox list and the Phase Tracking table

## Task Commits

Each task was committed atomically (Task 1 followed the TDD RED/GREEN cycle):

1. **Task 1 (RED): failing tests for `taskDurationSeconds`/`toTaskRepresentation`** - `3b8262e` (test)
2. **Task 1 (GREEN): implement `taskDurationSeconds` and `toTaskRepresentation`** - `3fae6c6` (feat)
3. **Task 2: surface duration on every task route and the CLI DURATION column** - `a083137` (feat)

_Note: no REFACTOR commit was needed — the GREEN implementation required no cleanup pass._

## Files Created/Modified
- `src/tasks/service.ts` - adds `taskDurationSeconds` and `toTaskRepresentation`/`TaskRepresentation`
- `src/tasks/service.test.ts` - `it.each` table covering all 9 duration boundary cases, plus a `toTaskRepresentation` column-preservation test
- `src/api/http/routes/tasks.ts` - all four taREDACTED_SECRET handlers route through `toTaskRepresentation`
- `src/api/http/routes/tasks.test.ts` - asserts `durationSeconds` presence on all four routes, a terminal-state non-negative-integer case (fake CLI fixture, `happy-path` scenario), and an in-flight `null` case (`hang` scenario)
- `src/cli/index.ts` - `TaskRow`'s wire shape gains `durationSeconds`; `taskColumns` gains the `DURATION` column
- `.planning/REQUIREMENTS.md` - TASK-05 marked complete in both trackers, with an evidence clause naming `taskDurationSeconds`

## Decisions Made
- Truncate toward zero, never round — the recorded reading from plan `02-04`'s flagged assumption, made a fact rather than an assumption in `taskDurationSeconds`'s doc comment.
- Clamp a negative (clock-skew) delta to `0` rather than surfacing a negative number; the raw ISO timestamps remain the untouched persisted truth.
- `null` (not yet knowable) and `0` (ran under a second) are kept as observably distinct outcomes at every layer — the pure function, the HTTP route tests, and the CLI's rendering glyph — because collapsing them would make a running task indistinguishable from an instant one.
- No duration column added to the schema; the value is derived on every read from `started_at`/`ended_at`, which stay the single source of truth (honors D-29 and the plan's explicit prohibition on treating duration as a cost figure — no sibling money-shaped field was introduced).

## Deviations from Plan

None — plan executed exactly as written. Both tasks' acceptance criteria were met without needing Rule 1-4 fixes.

## Issues Encountered

`npm test` across the whole `unit` project surfaces 10 pre-existing failures in `src/registry/cwd-independence.e2e.test.ts`, `src/registry/registry.test.ts`, `src/registry/tracer.e2e.test.ts`, and `src/db/packaging.e2e.test.ts` — all `ERR_MODULE_NOT_FOUND: Cannot find package 'commander'` when a built daemon is spawned out-of-process from a temp install directory. None of these files are in this plan's `files_modified` set and none were touched by this plan; they are out of scope per the executor's scope-boundary rule and were recorded to `.planning/WINDOWS.md` (entry id 1, kind `deviation`) for visibility rather than fixed here. This plan's own scoped verification — `npm test -- src/tasks/service.test.ts src/api/http/routes/tasks.test.ts src/cli/parity.test.ts` (79 tests), `npm run typecheck`, and `npm run lint` — is fully green.

The fixture-driven end-to-end task (`happy-path` scenario) completes in well under a second, so its observed `durationSeconds` in the terminal-state test was `0` — the sub-second case, distinguishable from the in-flight test's `null` in the adjacent test.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

TASK-05 is now fully discharged — the last requirement in this phase whose `Pending` marker was accurate is closed. `durationSeconds` is available wherever a task representation reaches an HTTP consumer or the CLI, ready for the dashboard (Phase 5) to render without any new backend work. No blockers for subsequent gap-closure plans in this wave.

---
*Phase: 02-execution-worktree-runner-billing-safety*
*Completed: 2026-07-26*

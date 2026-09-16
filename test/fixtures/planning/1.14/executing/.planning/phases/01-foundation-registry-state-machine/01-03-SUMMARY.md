---
phase: 01-foundation-registry-state-machine
plan: 03
subsystem: database
tags: [state-machine, event-sourcing, drizzle-orm, better-sqlite3, vitest, transactions]

# Dependency graph
requires:
  - phase: 01-foundation-registry-state-machine
    provides: "Plan 01's Drizzle schema (tasks/events tables), openDatabase()/runMigrations(), and the committed migration this plan's tests run against"
provides:
  - "src/core/state-machine/: TASK_STATES (8 names, SM-02), TaskEvent union, TaskContext, BlockReason, the single table-driven `transitions` map, and the pure applyEvent(state, ctx, event) function (SM-01, SM-03, SM-04)"
  - "src/core/event-store/record-event.ts: recordEvent() — the only code path in the repository permitted to write tasks.status — plus getTaskEvents() for ordered event-history reads (STATE-03, STATE-04, STATE-06)"
  - "src/core/event-store/single-writer.test.ts: a repository-wide source scan machine-enforcing STATE-05's single-writer invariant, run as part of the default `npm test`"
affects: [02-execution, 03-status, 04-dashboard-review]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single write path: recordEvent() is the only function permitted to mutate tasks.status; the invariant is machine-enforced by a repository-wide source scan (single-writer.test.ts), not merely documented — a second writer fails the default test suite"
    - "core/state-machine has zero outward dependencies — applyEvent is a pure function with no DB/FS/network/clock access, structurally verified by a same-directory-only import grep in acceptance criteria"
    - "recordEvent() wraps its two statements in better-sqlite3's native db.$client.transaction(fn) (not Drizzle's ORM-level .transaction()), matching ARCHITECTURE.md §2's literal pattern — Drizzle query builders execute against the same underlying connection, so they participate in the already-open transaction"
    - "Guard functions on transition-table rows (needs_human's four edges) read TaskContext.blockReason, itself derived from the task's most recent accepted events row rather than stored redundantly on the tasks table"

key-files:
  created:
    - src/core/state-machine/types.ts
    - src/core/state-machine/transitions.ts
    - src/core/state-machine/transitions.test.ts
    - src/core/event-store/record-event.ts
    - src/core/event-store/record-event.test.ts
    - src/core/event-store/single-writer.test.ts
  modified: []

key-decisions:
  - "Resolved a wording conflict in the plan input: must_haves.truths' auto-generated STATE-03-empty backstop item claims a task's first event should have from_status null, but the plan's own <behavior> bullet and <action> text (both taREDACTED_SECRET, non-generic) explicitly say from_status must reflect the task's seeded status, and REQUIREMENTS.md's actual STATE-03 text says nothing about null. Since tasks.status is NOT NULL with no default, a task always has a real status before any event fires, making a null first from_status structurally unreachable through recordEvent() as specified. Implemented per the explicit <behavior>/<action> instructions (from_status = task's current status, even on the first event) and named the corresponding test after that exact wording."
  - "toContext() only queries the events table for blockReason when the task's current status is needs_human — turnsUsed/maxTurns come directly off the tasks row in all cases. Avoids an unnecessary query on every recordEvent call for tasks not currently blocked."

patterns-established:
  - "Pattern: append-only write discipline — record-event.ts never issues UPDATE or DELETE against `events`, verified by both a repo-wide grep in acceptance criteria and single-writer.test.ts's positive-membership assertion"
  - "Pattern: illegal transitions are recorded, never dropped — accepted=0 with to_status equal to from_status makes a rejected attempt a queryable fact instead of a silent no-op (STATE-03, SM-04)"

requirements-completed: [STATE-03, STATE-04, STATE-05, STATE-06, SM-01, SM-02, SM-03, SM-04, QUAL-04]

coverage:
  - id: D1
    description: "TASK_STATES is the fixed 8-name enum (queued, running, needs_human, review, approved, rejected, failed, done) that TaskState derives from"
    requirement: "SM-02"
    verification:
      - kind: unit
        ref: "src/core/state-machine/transitions.test.ts#TASK_STATES (SM-02) > has exactly 8 members matching the fixed name set"
        status: pass
    human_judgment: false
  - id: D2
    description: "applyEvent(state, ctx, event) is a single, table-driven transition function returning the target state for every legal edge — including D-05..D-08's CANCEL/PUSH_SUCCEEDED/PUSH_FAILED/RETRY_PUSH edges and needs_human's two guarded branches — and never throws across the full state x event cross product"
    requirement: "SM-01"
    verification:
      - kind: unit
        ref: "src/core/state-machine/transitions.test.ts#applyEvent — legal edges (8 tests)"
        status: pass
      - kind: unit
        ref: "src/core/state-machine/transitions.test.ts#applyEvent — needs_human guarded edges (D-08) (5 tests)"
        status: pass
      - kind: unit
        ref: "src/core/state-machine/transitions.test.ts#applyEvent — exhaustive cross product > never throws and always returns a TASK_STATES member or null"
        status: pass
    human_judgment: false
  - id: D3
    description: "applyEvent is pure — deterministic across repeated calls, mutates neither ctx nor the event object, and every event type returns null from all three terminal states (failed, rejected, done)"
    requirement: "SM-03"
    verification:
      - kind: unit
        ref: "src/core/state-machine/transitions.test.ts#applyEvent — purity (3 tests)"
        status: pass
      - kind: unit
        ref: "src/core/state-machine/transitions.test.ts#applyEvent — terminal states (D-06) (3 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "An illegal transition returns null rather than throwing or silently applying, and recordEvent() still writes an events row for it (accepted=0, to_status equal to from_status) instead of dropping the attempt"
    requirement: "SM-04"
    verification:
      - kind: unit
        ref: "src/core/state-machine/transitions.test.ts#applyEvent — terminal states (D-06)"
        status: pass
      - kind: integration
        ref: "src/core/event-store/record-event.test.ts#an illegal transition inserts a rejected events row and leaves the task row unchanged"
        status: pass
    human_judgment: false
  - id: D5
    description: "recordEvent() inserts the events row and updates the tasks projection (status, version+1, last_activity_at) inside one better-sqlite3 transaction; a failure injected between the two statements (via a spied db.update throwing) commits neither change"
    requirement: "STATE-03"
    verification:
      - kind: integration
        ref: "src/core/event-store/record-event.test.ts#a legal transition inserts one accepted events row and updates the task projection"
        status: pass
      - kind: integration
        ref: "src/core/event-store/record-event.test.ts#a failure injected between the events insert and the tasks update commits neither change"
        status: pass
    human_judgment: false
  - id: D6
    description: "tasks is a transactionally-consistent projection of events — the same single db.$client.transaction() wraps both writes, so the projection can never reflect a partially-applied change"
    requirement: "STATE-04"
    verification:
      - kind: integration
        ref: "src/core/event-store/record-event.test.ts#a failure injected between the events insert and the tasks update commits neither change"
        status: pass
    human_judgment: false
  - id: D7
    description: "Exactly one module in the repository (record-event.ts) writes tasks.status — machine-enforced by a repository-wide source scan asserting set equality against a one-element expected set, manually verified by hand to fail when a second writer is temporarily introduced"
    requirement: "STATE-05"
    verification:
      - kind: unit
        ref: "src/core/event-store/single-writer.test.ts#exactly one module in the repository writes against the tasks table"
        status: pass
      - kind: unit
        ref: "src/core/event-store/single-writer.test.ts#positively confirms the event-store module is caught by the scanner, proving the pattern has teeth"
        status: pass
      - kind: manual_procedural
        ref: "Temporarily added src/registry/_scratch-second-writer.ts with a .update(tasks) call, confirmed the first test failed listing both files, then deleted the scratch file (never committed) and re-confirmed green"
        status: pass
    human_judgment: false
  - id: D8
    description: "getTaskEvents() returns the append-only event history ordered by ascending id (never created_at) — empty array for a task with no events, strictly increasing ids for same-millisecond events, and replaying accepted rows' to_status values reproduces the task's current status"
    requirement: "STATE-06"
    verification:
      - kind: unit
        ref: "src/core/event-store/record-event.test.ts#getTaskEvents on a task with no events returns an empty array"
        status: pass
      - kind: unit
        ref: "src/core/event-store/record-event.test.ts#two events recorded in the same millisecond receive strictly increasing ids"
        status: pass
      - kind: unit
        ref: "src/core/event-store/record-event.test.ts#getTaskEvents returns rows in ascending id order, and replaying accepted rows reproduces the current status"
        status: pass
    human_judgment: false
  - id: D9
    description: "The state-machine module runs hermetically with no daemon and no claude process, and its test file completes in under 5 seconds"
    requirement: "QUAL-04"
    verification:
      - kind: unit
        ref: "npx vitest run --project unit src/core/state-machine/transitions.test.ts (112ms, 22/22 passing)"
        status: pass
      - kind: other
        ref: "grep -rEn \"^import|require\\(\" src/core/state-machine/transitions.ts src/core/state-machine/types.ts — only ./types.js, no outward import"
        status: pass
    human_judgment: false

duration: ~20min
completed: 2026-07-22
status: complete
---

# Phase 1 Plan 3: Task State Machine and Event Store Summary

**A single table-driven `transitions` map plus a pure `applyEvent()` implementing the eight SM-02 states (including D-05..D-08's CANCEL/PUSH_SUCCEEDED/PUSH_FAILED/RETRY_PUSH edges), and `recordEvent()` as the sole transactional write path into `tasks.status`, with a repository-wide source scan machine-enforcing the single-writer invariant.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-22T23:05:00-04:00 (approx)
- **Completed:** 2026-07-22T23:27:25-04:00
- **Tasks:** 3
- **Files modified:** 6 created, 0 modified

## Accomplishments
- `src/core/state-machine/`: the eight-name `TASK_STATES` tuple, the extended `TaskEvent` union (D-05 `CANCEL`, D-07 `PUSH_SUCCEEDED`/`PUSH_FAILED`, D-08 `RETRY_PUSH`), and one table-driven `transitions` map plus the pure `applyEvent()` — zero outward dependencies, 22 passing unit tests in 112ms including an exhaustive state × event cross-product proving it never throws
- `src/core/event-store/record-event.ts`: `recordEvent()` wraps the `events` insert and the `tasks` update in a single `better-sqlite3` transaction (`db.$client.transaction`), computing the next state via `applyEvent()` rather than branching on status directly — 12 passing integration tests against a real temp-file WAL database, including an injected-failure rollback test proving the two writes can never partially commit
- `src/core/event-store/single-writer.test.ts`: a repository-wide source scan proving STATE-05 by construction — asserts the set of files writing `tasks.status` equals exactly `{record-event.ts}`, verified by hand to fail when a second writer is temporarily introduced
- Both `needs_human` guard branches from D-08 fully exercised: mid-run blocking accepts `HOOK_STOP`→`review`/`TIMEOUT`→`failed` and rejects a push retry; push-failure blocking accepts a push retry→`done`/`REJECT`→`rejected` and rejects `HOOK_STOP`
- Full unit suite (7 files, 60 tests) and `tsc --noEmit` both green after this plan's additions, with no regression to Plan 01's existing coverage

## Task Commits

Each task was committed atomically:

1. **Task 1: The eight-state transition table and the pure applyEvent function** - `59d9192` (feat, tdd)
2. **Task 2: recordEvent() — the single transactional write path into tasks.status** - `769bfef` (feat, tdd)
3. **Task 3: Prove the single-writer property with a repository-wide scan** - `812784f` (test)

**Plan metadata:** _pending — this commit_

## Files Created/Modified

**Task 1 (state machine):**
- `src/core/state-machine/types.ts` - `TASK_STATES`, `TaskState`, `TERMINAL_STATES`, `TaskEvent`, `BlockReason`, `TaskContext`, `Guard`, `Transition`
- `src/core/state-machine/transitions.ts` - the `transitions` table and `applyEvent()`
- `src/core/state-machine/transitions.test.ts` - 22 pure unit tests

**Task 2 (event store):**
- `src/core/event-store/record-event.ts` - `recordEvent()`, `getTaskEvents()`, `EventSource`, `EventRow`
- `src/core/event-store/record-event.test.ts` - 12 integration tests against a real temp-file WAL database

**Task 3 (invariant proof):**
- `src/core/event-store/single-writer.test.ts` - repository-wide source scan, 2 tests

## Decisions Made
- Resolved a wording conflict between the plan's auto-generated `must_haves.truths` STATE-03-empty backstop item ("first event has from_status null") and the plan's own explicit `<behavior>`/`<action>` text ("from_status reflecting the task's seeded status"). Followed the explicit taREDACTED_SECRET instructions: `tasks.status` is `NOT NULL` with no default, so a task row always carries a real status before any event fires, making a null first `from_status` structurally unreachable through `recordEvent()`. The corresponding test is named after the `<behavior>` bullet's exact wording to make this traceable.
- `toContext()` only queries `events` for `blockReason` when the task's current status is `needs_human` — avoids an unnecessary query on every `recordEvent()` call for tasks that aren't currently blocked.
- Used `db.$client.transaction(fn)` (better-sqlite3's native transaction wrapper on the underlying connection) rather than Drizzle's ORM-level `.transaction()` API, matching ARCHITECTURE.md §2's literal `recordEvent` example. Drizzle's query builders (`db.insert`/`db.update`/`db.select`) execute against that same underlying connection, so they participate in the already-open transaction without needing a separate `tx` handle.
- `EventRow` is `InferSelectModel<typeof events>` rather than a hand-written interface, so the type can never drift from the schema.

## Deviations from Plan

None beyond the documented wording-conflict resolution above (not a plan violation — the plan's own explicit `<behavior>`/`<action>` text took precedence over a generic auto-generated backstop phrase that didn't match REQUIREMENTS.md's actual STATE-03 text or the schema's `NOT NULL` constraint). No auto-fixes, no scope creep, no architectural changes, no package installs.

## Issues Encountered
- The worktree had no `node_modules` at start; ran `npm ci` once via the pinned Node 22.21.1 binary before any test/typecheck command, per the environment's setup note. `better-sqlite3`'s prebuilt binary loaded correctly under Node 22 (verified with a standalone `require()` smoke check) despite `npm ci` itself internally resolving Node 20.19.4 for its own engine-check warnings (a shebang/PATH quirk of this environment, not a build issue — the installed native module works under Node 22 regardless).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `src/core/state-machine/` and `src/core/event-store/` are complete, hermetically tested, and ready for Plan 02 (registry/CLI, if it lands after this plan in the wave) and Phase 2's runner to call `recordEvent()` for every hook-driven and timeout/crash-driven transition.
- The single-writer invariant is now a standing CI gate (`single-writer.test.ts` runs in the default `npm test`), so Phase 2's runner and Phase 3's hook receiver must route every status change through `recordEvent()` or the default test suite fails.
- `getTaskEvents()`'s ascending-id ordering is exactly what Phase 4's SSE stream needs for `Last-Event-ID` backfill — no further design work needed there.
- No blockers for downstream plans in this phase or for Phase 2.

## Self-Check: PASSED

- FOUND: src/core/state-machine/types.ts
- FOUND: src/core/state-machine/transitions.ts
- FOUND: src/core/state-machine/transitions.test.ts
- FOUND: src/core/event-store/record-event.ts
- FOUND: src/core/event-store/record-event.test.ts
- FOUND: src/core/event-store/single-writer.test.ts
- FOUND commit: 59d9192 (Task 1)
- FOUND commit: 769bfef (Task 2)
- FOUND commit: 812784f (Task 3)

---
*Phase: 01-foundation-registry-state-machine*
*Completed: 2026-07-22*

---
phase: 02-execution-worktree-runner-billing-safety
plan: 09
subsystem: scheduler
tags: [p-queue, concurrency, kill-switch, rate-limit, backoff, abortcontroller, fastify, commander]

# Dependency graph
requires:
  - phase: 02-execution-worktree-runner-billing-safety
    provides: "The tracer-only Scheduler (enqueue/onIdle/setConcurrency) from plan 02-04; resolveModel/resolveCaps/etc. and the queued.CANCEL transition edge from plan 02-08; the wall-clock cap, apiKeySource kill assertion, and classifyRun()/captureEvidence() rate-limit classifier promoted to src/runner/rate-limit.ts from plan 02-06"
provides:
  - "Scheduler.setConcurrency()/reconstructFromDb() — a settings-backed, runtime-changeable concurrency cap read from the settings table (validated integer >= 1, warns and falls back to 3 on any invalid stored value) that survives a daemon restart by rebuilding the in-memory queue from `queued` task rows, never persisting the queue itself as a structure (D-25)"
  - "Scheduler.killSwitch()/pause()/resume() — SAFE-02's kill switch: pauses the queue BEFORE killing any running session (D-27) so nothing is dispatched into a slot a kill just freed; idempotent; resume is a separate explicit call. POST /kill-switch and `fleet kill-switch` mirror it."
  - "Scheduler.cancelQueued() — a genuine PD-10 dequeue primitive using p-queue's AbortSignal support (confirmed against the real p-queue@9.3.3 dependency) to remove a still-queued job before it ever dispatches; built and tested, not yet wired into the production cancel route (see Deviations)"
  - "computeBackoff()/applyJitter()/resolveResumeDelayMs()/Scheduler.pauseForRateLimit() — SAFE-04's clamped exponential backoff (60s to 60min, doubling, jitter-clamped) with a resetsAt (unix seconds) preference over the local curve, idempotent against a second classification while already paused (SAFE-04 concurrency)"
affects: [02-10]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "p-queue AbortSignal per enqueued job (one AbortController per task id, cleared the instant dispatch() actually starts) as the genuine per-task dequeue primitive — confirmed via a standalone spike against the real dependency before relying on it, not merely from documentation"
    - "Pure, clock-injectable resolveResumeDelayMs(resetsAtUnixSeconds, attempt, nowMs?) separated from the stateful pauseForRateLimit() method so the resetsAt-preference/refusal boundary is directly unit-testable without fake timers or a full Scheduler"

key-files:
  created:
    - src/scheduler/queue.test.ts
  modified:
    - src/scheduler/queue.ts
    - src/api/http/routes/tasks.ts
    - src/cli/index.ts
    - src/cli/parity.test.ts

key-decisions:
  - "PD-12: Scheduler.cancelQueued()'s underlying p-queue AbortSignal primitive is fully implemented and tested directly in queue.test.ts, but is NOT called from routes/tasks.ts's POST /tasks/:id/cancel handler. Wiring it in changes observable dispatch timing for a queued task's cancellation, which plan 02-08's own src/api/http/routes/tasks.test.ts test ('cancels a queued task by recording CANCEL without touching the runner') explicitly encodes into its cleanup strategy (it waits for the previously-queued task to reach 'running' before manually killing it) — that file is not in this plan's files_modified. Wiring in cancelQueued() there without also updating that test broke it (confirmed: the test's own waitUntil for the now-never-dispatched task timed out). Reverted the wiring rather than touch an out-of-scope test file; the primitive stands ready for whichever plan next touches routes/tasks.ts's test coverage."
  - "PD-13: pauseForRateLimit(result: ClassifyRunResult, resetsAtUnixSeconds?: number) accepts resetsAtUnixSeconds as a second, explicit parameter rather than a field on ClassifyRunResult itself. src/runner/rate-limit.ts (owned by plan 02-06, not in this plan's files_modified) has no such field anywhere in its shape — a rate_limit_event line's resetsAt is never extracted by classifyRun(). A caller with access to the raw stream-json line would need to extract it separately and pass it here."
  - "PD-14: reconstructFromDb() takes no arguments (uses the Scheduler's own this.db) rather than the plan action text's literal reconstructFromDb(db) shape — the class already holds a db reference from construction, and accepting a second, potentially-different db as a parameter would invite a caller passing a mismatched database by mistake."

requirements-completed: [SAFE-01, SAFE-02, SAFE-04, SAFE-05]

coverage:
  - id: D1
    description: "Settings-backed concurrency cap: absent/valid/invalid (0, -1, 2.5, non-numeric, malformed JSON) settings.scheduler.concurrency values are validated at read time, invalid ones warn and fall back to 3; setConcurrency() persists across a fresh Scheduler instance; with concurrency=3 and four long-running jobs, pending===3 and size===1, and resolving one refills the slot"
    requirement: "SAFE-01"
    verification:
      - kind: unit
        ref: "src/scheduler/queue.test.ts#Scheduler concurrency cap (SAFE-01, T-2-25) — all 6 cases"
        status: pass
    human_judgment: false
  - id: D2
    description: "Boot-time reconstruction: reconstructFromDb() enqueues exactly the queued rows and leaves a running row untouched; an empty database enqueues 0 items without throwing; the queue itself is never persisted as a structure (grep-verified: exactly one insert(settings) call site, next to CONCURRENCY_SETTING_KEY)"
    requirement: "SAFE-01"
    verification:
      - kind: unit
        ref: "src/scheduler/queue.test.ts#Scheduler.reconstructFromDb (SAFE-01 boot reconstruction, D-25) — both cases; concurrency-cap describe block's settings-table structural test"
        status: pass
    human_judgment: false
  - id: D3
    description: "Kill switch: with 3 running + 2 queued, killSwitch() kills all 3, leaves the 2 queued undispatched (pending 0, size 2 — the D-27 ordering assertion), and pauses; idempotent on a second call and on an empty/idle scheduler; each killed task gets a runner.kill() call and a terminating CANCEL events row landing the task in failed; resume() is a separate explicit call that killSwitch() never schedules; POST /kill-switch returns 200 {killed,paused:true}; POST /tasks still returns 201 with status queued while paused"
    requirement: "SAFE-02"
    verification:
      - kind: unit
        ref: "src/scheduler/queue.test.ts#Scheduler.killSwitch (SAFE-02, D-27) — all 7 cases"
        status: pass
    human_judgment: false
  - id: D4
    description: "fleet kill-switch and POST /kill-switch exist in structural 1:1 parity, distinguished from `fleet task <subcommand>` entries in TASK_ROUTE_MAP; fleet kill-switch --json exits EXIT_OK and prints {killed,paused}"
    requirement: "SAFE-02"
    verification:
      - kind: integration
        ref: "src/cli/parity.test.ts#TASK_ROUTE_MAP describe block (4 assertions) / 'fleet kill-switch --json' exits EXIT_OK..."
        status: pass
    human_judgment: false
  - id: D5
    description: "PD-10 dequeue primitive: Scheduler.cancelQueued() removes a still-queued task via AbortSignal so it never reaches provision()/spawn() once its slot frees, returns false for an already-dispatching or never-enqueued task id — confirmed against the real p-queue dependency in a standalone spike before relying on it in production code"
    requirement: "(flagged gap from plan 02-08, evaluated per this plan's own instructions)"
    verification:
      - kind: unit
        ref: "src/scheduler/queue.test.ts#Scheduler.cancelQueued (PD-10 closure, flagged by plan 02-08) — all 3 cases"
        status: pass
    human_judgment: false
  - id: D6
    description: "Rate-limit backoff: computeBackoff(attempt) is exactly 60_000/120_000/240_000/480_000/960_000/1_920_000 for attempts 1-6 and exactly 3_600_000 for 7+; applyJitter clamps 1000 samples at attempts 1 and 7 into [60_000, 3_600_000]; pauseForRateLimit schedules exactly one resume timer, idempotent against a second call while already paused; nothing dispatches between pause and resume; the attempt counter resets to 0 after resume fires"
    requirement: "SAFE-04"
    verification:
      - kind: unit
        ref: "src/scheduler/queue.test.ts#computeBackoff / applyJitter / Scheduler.pauseForRateLimit describe blocks — all cases"
        status: pass
    human_judgment: false
  - id: D7
    description: "resetsAt preference: a resetsAt one hour out (unix seconds) produces a delay within 1000ms of 3_600_000 and bypasses computeBackoff; a resetsAt in the past or more than 24 hours out is refused with a named warning and falls back to computeBackoff"
    requirement: "SAFE-04, SAFE-05"
    verification:
      - kind: unit
        ref: "src/scheduler/queue.test.ts#resolveResumeDelayMs (SAFE-04/SAFE-05 resetsAt preference) — all 4 cases; Scheduler.pauseForRateLimit's 'prefers a resetsAt...' case"
        status: pass
    human_judgment: false
  - id: D8
    description: "Transparency prohibition honored: SAFE-04/SAFE-05 are documented here and in code comments as implemented-against-best-available-evidence, never as verified against a real rate-limit hit — SPIKE-01 remains detected-but-unconfirmed"
    verification: []
    human_judgment: true
    rationale: "This is a documentation/transparency claim about how results are framed, not a testable code property — a human should confirm no phase-completion artifact overstates SAFE-04/SAFE-05 as verified."

duration: ~2h
completed: 2026-07-26
status: complete
---

# Phase 02 Plan 09: Full Scheduler Control Surface — Concurrency Cap, Kill Switch, Rate-Limit Backoff Summary

**`Scheduler` widened from plan 02-04's dispatch-only tracer into the full SAFE-01/SAFE-02/SAFE-04 control surface: a settings-backed concurrency cap that survives a daemon restart, a kill switch that pauses the queue before it kills anything, and a rate-limit pause with a clamped 60s-to-60min exponential backoff that prefers the CLI's own `resetsAt` answer — plus a genuine p-queue `AbortSignal`-based dequeue primitive (`cancelQueued()`) that mechanically closes plan 02-08's PD-10 gap, built and tested but deliberately not yet wired into the production cancel route.**

## Performance

- **Duration:** ~2h
- **Started:** 2026-07-26T15:20:00Z (approx)
- **Completed:** 2026-07-26T15:41:00Z (approx)
- **Tasks:** 3
- **Files modified:** 5 (1 created, 4 modified)

## Accomplishments

- `Scheduler.setConcurrency()`/constructor now read/validate/persist `scheduler.concurrency` in the `settings` table — an invalid stored value (0, negative, non-integer, non-numeric, or malformed JSON) falls back to the default of 3 with a warning naming the offending value, never silently coerced.
- `reconstructFromDb()` rebuilds the in-memory queue from every `queued` task row on boot, deliberately skipping `running` rows (Phase 3's `RECONCILE_ORPHANED` territory) — the queue itself is never persisted as its own structure.
- `killSwitch()` pauses the queue FIRST, then kills every currently-running session via the injected `Runner` and records a `CANCEL` event for each, landing each task in `failed` — verified that no queued task is ever dispatched into a slot a kill just freed. Idempotent. `resume()` is a separate, explicit call that nothing in this plan ever calls automatically except a fired rate-limit resume timer.
- `POST /kill-switch` and `fleet kill-switch --json` mirror the kill switch in structural parity with the rest of the `TASK_ROUTE_MAP`, correctly distinguished as a top-level command rather than a `fleet task` subcommand.
- `computeBackoff()`/`applyJitter()`/`resolveResumeDelayMs()` implement SAFE-04's clamped exponential curve (60s doubling to a 60-minute cap, jitter bounded and clamped so it can never undershoot the floor or exceed the cap) with a preference for a CLI-supplied `resetsAt` (unix seconds) over the local curve, refusing a `resetsAt` that is already past or more than 24 hours out.
- `pauseForRateLimit()` pauses the queue and schedules exactly one resume timer, idempotent against a second classification arriving while already paused — the existing timer and attempt counter stand rather than resetting.
- Discovered and closed the mechanical half of PD-10 (plan 02-08's flagged gap): `Scheduler.cancelQueued()` uses `p-queue`'s `AbortSignal` support — confirmed against the real `p-queue@9.3.3` dependency in a standalone spike before relying on it — to genuinely remove a still-queued job before it ever reaches `provision()`/`spawn()`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Settings-backed concurrency cap and boot-time reconstruction from the tasks table** - `b6fb614` (feat)
2. **Task 2: A kill switch that pauses the queue before it kills anything** - `29b5ad5` (feat)
3. **Task 3: Rate-limit pause with exponential backoff, jitter, and the CLI's own reset time preferred** - `edce8ee` (feat)

**Plan metadata:** committed alongside this SUMMARY (worktree mode — STATE.md/ROADMAP.md excluded; orchestrator updates centrally)

## Files Created/Modified

- `src/scheduler/queue.ts` - `setConcurrency()`, `reconstructFromDb()`, `pause()`/`resume()`/`killSwitch()`, `cancelQueued()`, `computeBackoff()`/`applyJitter()`/`resolveResumeDelayMs()`/`pauseForRateLimit()`, `MIN_BACKOFF_MS`/`MAX_BACKOFF_MS`, `SchedulerError` gains `invalid_concurrency`
- `src/scheduler/queue.test.ts` - new file; one test per `<behavior>` bullet across all three tasks, plus `cancelQueued()`'s own coverage
- `src/api/http/routes/tasks.ts` - `POST /kill-switch`; an explanatory NOTE comment on `POST /tasks/:id/cancel` documenting the deliberately-unwired `cancelQueued()` primitive
- `src/cli/index.ts` - `TASK_ROUTE_MAP` extended to 6 entries (`kill-switch` top-level), `fleet kill-switch` command
- `src/cli/parity.test.ts` - `TASK_ROUTE_MAP` describe block extended in place (6-entry count, task-prefix/top-level command-set split into two assertions), `fleet kill-switch --json` exit-code/JSON-contract test

## Decisions Made

See `key-decisions` in frontmatter (PD-12 through PD-14). Summary:

- **PD-12:** `cancelQueued()`'s primitive is built and fully tested but NOT wired into `routes/tasks.ts`'s cancel handler — wiring it in broke an existing, out-of-scope test (`routes/tasks.test.ts`, not in this plan's `files_modified`) whose cleanup logic assumed the old PD-10 gap. Reverted rather than touch that file.
- **PD-13:** `pauseForRateLimit()` takes `resetsAtUnixSeconds` as a second explicit parameter since `ClassifyRunResult` (owned by plan 02-06) has no such field.
- **PD-14:** `reconstructFromDb()` is a zero-argument instance method (uses `this.db`) rather than accepting a `db` parameter, avoiding a caller-supplied database mismatch.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug, caught before any commit] Wiring `cancelQueued()` into `POST /tasks/:id/cancel` broke a pre-existing, out-of-scope test**
- **Found during:** Task 2, closing the PD-10 gap
- **Issue:** `p-queue`'s `AbortSignal` support genuinely dequeues a still-queued job (confirmed via a standalone spike against the real `p-queue@9.3.3` dependency). Wiring `scheduler.cancelQueued(id)` into the cancel route changed observable dispatch timing: `src/api/http/routes/tasks.test.ts`'s `'cancels a queued task by recording CANCEL without touching the runner'` test explicitly waits for the previously-queued second task to reach `'running'` before manually killing it (its own comment says this accounts for the then-real PD-10 gap). With the wiring in place, that task never dispatches at all, and the test's `waitUntil` call times out. `routes/tasks.test.ts` is not in this plan's `files_modified`.
- **Fix:** Reverted the wiring in `routes/tasks.ts`'s cancel handler, leaving a clear NOTE comment explaining the primitive exists, is tested, and is ready for a future plan (whichever next touches `routes/tasks.ts`'s test coverage) to wire in with a corresponding test update.
- **Files modified:** `src/api/http/routes/tasks.ts` (reverted the one-line addition, kept the explanatory comment)
- **Verification:** Full `npm test` (`unit` project, 388/388) green after the revert; `cancelQueued()` itself remains fully covered directly in `queue.test.ts`.
- **Committed in:** `29b5ad5` (Task 2 commit) — the revert happened before this commit, so the committed state never included the broken wiring.

---

**Total deviations:** 1 (a scope-boundary correction caught and fixed before any commit reached the repository). No scope creep beyond what Task 1/2/3's own instructions and acceptance criteria required.

## Flagged Gaps Explicitly Evaluated (per this plan's own instructions)

**1. PD-10 (flagged by plan 02-08): CLOSED at the mechanical level, NOT wired into production.**
`Scheduler.cancelQueued(taskId)` is a genuine dequeue primitive — a still-queued task's `p-queue` job is aborted via `AbortSignal` before it ever starts, confirmed directly against the real `p-queue@9.3.3` dependency (not merely from its documentation) in a throwaway spike before relying on it. It is fully implemented and tested in `queue.test.ts` (3 tests: removes-before-dispatch, no-op-if-already-dispatching, no-op-if-never-enqueued). It is deliberately **not** called from `routes/tasks.ts`'s `POST /tasks/:id/cancel` handler, because doing so breaks `routes/tasks.test.ts`'s existing queued-cancel test (out of this plan's `files_modified`) — see Deviation 1 above. **The remaining work for a future plan is a one-line addition** (`scheduler.cancelQueued(request.params.id);` before the `cancelTask()` call in `routes/tasks.ts`) plus updating `routes/tasks.test.ts`'s cleanup logic in the now-obsolete workaround test to assert the task never reaches `running` instead of waiting for it to.

**2. Per-task `wallClockCapMs` / `.fleet.yml`/Fleet-config cap layers (flagged by plan 02-06): NOT addressed by this plan.**
This plan's territory was `scheduler/queue.ts`, `api/http/routes/tasks.ts`, and `src/cli/*` — none of which are the seam this gap needs. The gap is specifically that `RunnerTask` (from `runner.interface.ts`) has no `wallClockCapMs` field and `WorktreeRunner`'s per-instance `caps` override (from `WorktreeRunnerOptions`) is the only wiring point today; `Scheduler.dispatch()` in this plan assembles a `RunnerTask` from `taskRow`/`project` fields but has no additional field to add without widening `runner.interface.ts` itself (not in this plan's `files_modified`). Genuinely out of this plan's reach — left exactly as 02-06's SUMMARY documented it, for whichever future plan owns `runner.interface.ts`.

## Issues Encountered

None beyond the one auto-fixed deviation above. `npm run typecheck`, `npm run lint`, and `npm test` (`unit` project, 388/388) are all green as of the final commit (`edce8ee`).

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- The full `Scheduler` control surface (`enqueue`/`pause`/`resume`/`killSwitch`/`setConcurrency`/`reconstructFromDb`/`pauseForRateLimit`/`cancelQueued`) is complete and ready for `app.ts`/a daemon-boot call site to invoke `reconstructFromDb()` on startup — not wired into `app.ts` by this plan (`app.ts` is not in `files_modified`).
- `cancelQueued()` is ready for a future plan to wire into `routes/tasks.ts`'s cancel handler alongside a corresponding update to `routes/tasks.test.ts`'s now-obsolete workaround test.
- **SAFE-04/SAFE-05 transparency, restated per this plan's own prohibition:** a green test suite against `computeBackoff`/`applyJitter`/`resolveResumeDelayMs`/`pauseForRateLimit` is NOT the same claim as "verified against a real rate-limit hit." SPIKE-01 remains detected-but-unconfirmed — every fixture is hand-constructed from documented shapes. This SUMMARY records SAFE-04/SAFE-05 as implemented-against-best-available-evidence only.
- `pauseForRateLimit()` is also not wired into `WorktreeRunner`'s real exit path (that code lives in `worktree-runner.ts`, not in this plan's `files_modified`, and records `RATE_LIMITED` directly via `recordEvent()` with no callback into the Scheduler) — a future plan touching both `queue.ts` and `worktree-runner.ts`/`runner.interface.ts` in the same wave is the natural place to close that production wiring gap.
- No blockers for subsequent plans in this phase.

## Self-Check: PASSED

All modified/created files verified present

<!-- FIXTURE TRUNCATED at 20 KiB by M0-G capture; original size 21189 bytes -->

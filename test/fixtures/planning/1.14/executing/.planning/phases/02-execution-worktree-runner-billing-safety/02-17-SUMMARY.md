---
phase: 02-execution-worktree-runner-billing-safety
plan: 17
subsystem: api
tags: [resume, scheduler, worktree, cli, http, wiring-invariant, vitest]

# Dependency graph
requires:
  - phase: 02-execution-worktree-runner-billing-safety
    provides: "plan 02-16's resumeTask()/RESUMABLE_STATES/MAX_RESUME_CHAIN_DEPTH service-layer primitives and the resumed_from_task_id/resume_session_id schema columns; plan 02-13's RunnerTask.wallClockCapMs; plan 02-06's buildSpawnArgv() resume branch"
provides:
  - "RunnerTask.resumeSessionId/baseRefOverride, threaded from Scheduler.dispatch() through WorktreeRunner.provision()/spawn() into a real spawned child's argv"
  - "EnsureWorktreeInput.baseRef — an explicit base ref ensureWorktree() uses verbatim in place of resolveBaseRef()"
  - "POST /tasks/:id/resume and fleet task resume <id>"
  - "src/wiring-invariant.test.ts — a build-failing guard against implemented-but-never-called production symbols"
affects: [phase-03, phase-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wiring-invariant scan (src/wiring-invariant.test.ts): a registry of {symbol, declaringFile} pairs, each asserted to appear in at least one non-test production source file OTHER than its declaring file — modelled on single-writer.test.ts's shape, catching the built-but-unwired defect class this phase shipped three times"
    - "RunnerTask carries resume/base-ref overrides as plain STRINGS (session id, git ref), never a Fleet task id — preserves RUN-07's container-backend seam"

key-files:
  created:
    - src/wiring-invariant.test.ts
  modified:
    - src/runner/runner.interface.ts
    - src/runner/worktree-manager.ts
    - src/runner/worktree-runner.ts
    - src/runner/worktree-runner.integration.test.ts
    - src/scheduler/queue.ts
    - src/scheduler/queue.test.ts
    - src/api/http/routes/tasks.ts
    - src/api/http/routes/tasks.test.ts
    - src/api/http/errors.ts
    - src/cli/index.ts
    - src/cli/parity.test.ts
    - .planning/REQUIREMENTS.md

key-decisions:
  - "A resumed task's worktree is cut from the LINEAGE PARENT's own surviving branch (refs/heads/<parent.branchName>), derived inside Scheduler.dispatch()'s try block — a missing parent row or missing parent branch name throws loudly there rather than silently falling back to the project default branch"
  - "The wiring-invariant registry deliberately excludes buildSpawnArgv()/composeAllowedTools() (worktree-runner.ts) — their only legitimate caller is the same module, so registering them would produce a false failure; the rule is 'crosses a file boundary', not 'is important'"
  - "POST /tasks/:id/resume's body accepts only an optional prompt, .strict() — a body attempting to supply a session id is REJECTED (400 validation_failed), not silently accepted and ignored"

patterns-established:
  - "The wiring-invariant guard is now the standing mechanism for this defect class — a future symbol meant to be called across a file boundary should be added to its registry rather than re-discovered by a human grep during verification"

requirements-completed: [RUN-06]

coverage:
  - id: D1
    description: "A resume issued over the CLI/HTTP reaches a real claude child process whose argv continues the parent's session (--resume <id> --fork-session), proven by reading the fake CLI fixture's recorded argv rather than a mock"
    requirement: "RUN-06"
    verification:
      - kind: integration
        ref: "src/runner/worktree-runner.integration.test.ts#RUN-06 tracer: a resume travels from a task row through the Scheduler and the worktree manager into a real spawned child whose argv continues the parent session..."
        status: pass
    human_judgment: false
  - id: D2
    description: "The resumed task's worktree is cut from the parent task's surviving branch, never the project default — proven by a real git merge-base --is-ancestor check"
    requirement: "RUN-06"
    verification:
      - kind: integration
        ref: "src/runner/worktree-runner.integration.test.ts#RUN-06: an explicit baseRef is used VERBATIM in place of resolveBaseRef..."
        status: pass
      - kind: integration
        ref: "src/runner/worktree-runner.integration.test.ts#RUN-06 tracer (same test as D1) — merge-base --is-ancestor assertion"
        status: pass
    human_judgment: false
  - id: D3
    description: "A dispatch whose row claims a lineage but whose parent row (or branch name) cannot be found fails loudly and lands the task in failed with the lineage id in the recorded event payload, rather than silently falling back to the default branch"
    requirement: "RUN-06"
    verification:
      - kind: unit
        ref: "src/scheduler/queue.test.ts#Scheduler.dispatch lineage resolution (RUN-06) > a task row carrying a lineage id whose parent is absent reaches failed with the lineage id present in the recorded event payload"
        status: pass
    human_judgment: false
  - id: D4
    description: "POST /tasks/:id/resume and fleet task resume <id> — every resumeTask() refusal maps to its own HTTP status (404/409/409/422/422), the body rejects an attempt to supply a session id, and the 201 success response carries the lineage and duration fields"
    requirement: "RUN-06"
    verification:
      - kind: integration
        ref: "src/api/http/routes/tasks.test.ts#POST /tasks/:id/resume (RUN-06) — all 8 cases (404, 409x2, 422x2, strict-body x2, 201 success)"
        status: pass
      - kind: unit
        ref: "src/cli/parity.test.ts#TASK_ROUTE_MAP — task resume entry and CLI-isolation scan"
        status: pass
    human_judgment: false
  - id: D5
    description: "A wiring-critical exported symbol with no production reader outside its declaring file fails the build; the guard is proven to have teeth by a deliberate temporary break"
    verification:
      - kind: unit
        ref: "src/wiring-invariant.test.ts — 17 tests (14 registry entries + registry-shape + absent-symbol-yields-zero + file-set-shape)"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-07-26
status: complete
---

# Phase 02 Plan 17: Wire the resume path, expose it, and guard against re-regression Summary

**Connected `RunnerTask.resumeSessionId`/`baseRefOverride` through `Scheduler.dispatch()` and `WorktreeRunner` into a real spawned child's `--resume <id> --fork-session` argv, exposed it as `POST /tasks/:id/resume` and `fleet task resume`, and shipped `src/wiring-invariant.test.ts` — a build-failing scan that would have caught all three "implemented, tested, never called" primitives this phase shipped.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 3
- **Files modified:** 11 modified, 1 created

## Accomplishments

- `buildSpawnArgv()`'s resume branch (unit-tested and unreachable since plan `02-06`) now has a real production caller: a resume issued via the CLI or HTTP travels `resumeTask()` → `Scheduler.enqueue()` → `Scheduler.dispatch()` → `RunnerTask.resumeSessionId`/`baseRefOverride` → `WorktreeRunner.spawn()`/`provision()` → the spawned child's argv, proven by reading the fake CLI fixture's recorded argv (not a spy on `buildSpawnArgv`).
- The resumed task's worktree is cut from its lineage parent's own surviving branch (`refs/heads/<parent.branchName>`) rather than the project default — `EnsureWorktreeInput.baseRef` lets `ensureWorktree()` bypass `resolveBaseRef()`'s remote-tracking preference when the caller already knows the exact local ref it wants.
- A lineage id whose parent row (or parent branch name) cannot be found now fails loudly inside `Scheduler.dispatch()`'s existing `try`/`catch`, landing the task in `failed` with the lineage id in the recorded `CRASH` event payload — never a silent fallback to the default branch.
- `POST /tasks/:id/resume` and `fleet task resume <id> [--prompt <p>]` are live: every one of `resumeTask()`'s four refusal codes maps to its own HTTP status (`task_not_resumable`/`resume_chain_depth_exceeded` → 409, `task_has_no_session`/`task_has_no_branch` → 422), and the request body rejects an attempted session-id override rather than silently ignoring it.
- `RUN-06` is now marked complete in both `.planning/REQUIREMENTS.md` trackers with an evidence clause.
- `src/wiring-invariant.test.ts` automates the exact check that found `pauseForRateLimit`, `cancelQueued`, and `buildSpawnArgv`'s resume branch unwired by hand during prior verification rounds — a registry of 14 wiring-critical symbols, each asserted to have a production reader outside its own declaring file.

## Task Commits

1. **Task 1: One resume, all the way from a task row to a recorded spawn argv** - `1688575` (feat)
2. **Task 2: The resume surface — one route, one command, one status per refusal** - `a0f4850` (feat)
3. **Task 3: A build-failing guard against the built-but-unwired defect class** - `a3044ec` (test)

_Note: this plan carried no separate plan-metadata commit — worktree mode excludes STATE.md/ROADMAP.md updates, which the orchestrator applies centrally after the wave merges; the `.planning/REQUIREMENTS.md` edit is included in Task 2's commit._

## Files Created/Modified

- `src/runner/runner.interface.ts` - `RunnerTask.resumeSessionId`/`baseRefOverride`, both optional
- `src/runner/worktree-manager.ts` - `EnsureWorktreeInput.baseRef`, used verbatim in place of `resolveBaseRef` when supplied
- `src/runner/worktree-runner.ts` - `provision()` passes `baseRefOverride` through; `spawn()` passes `resumeSessionId` through; stale doc-comment sentence removed
- `src/runner/worktree-runner.integration.test.ts` - RUN-06 tracer test (parent + resumed argv readback, ancestor check) and a direct `ensureWorktree({ baseRef })` HEAD/ancestor test
- `src/scheduler/queue.ts` - `dispatch()` populates the two new `RunnerTask` fields and derives `baseRefOverride` from the lineage parent, throwing loudly on a missing parent/branch
- `src/scheduler/queue.test.ts` - lineage-resolution test (missing parent → `failed` with the lineage id in the event payload); `seedTask()` gained a `resumedFromTaskId` override
- `src/api/http/routes/tasks.ts` - `POST /tasks/:id/resume`, strict body accepting only an optional prompt
- `src/api/http/routes/tasks.test.ts` - 8 new tests covering every refusal status plus the 201 success shape
- `src/api/http/errors.ts` - four new `CODE_TO_STATUS` entries for `resumeTask()`'s refusal codes
- `src/cli/index.ts` - `TASK_ROUTE_MAP`'s `task resume` entry, the `task resume` subcommand, a `RESUMED-FROM` column, and the lineage field on the CLI's wire shape
- `src/cli/parity.test.ts` - `TASK_ROUTE_MAP` length/contents updated to seven entries
- `src/wiring-invariant.test.ts` (new) - the build-failing wiring guard
- `.planning/REQUIREMENTS.md` - RUN-06 marked complete in both the checkbox list and the Phase Tracking table

## Decisions Made

- **Base ref derivation lives inside `dispatch()`'s existing `try` block**, not as a separate pre-check — so a missing parent/branch reaches the SAME terminal `CRASH` write path every other dispatch failure does, with no second fail-loud route added.
- **The wiring-invariant registry excludes same-module-only callees** (`buildSpawnArgv`, `composeAllowedTools`) by design — registering a symbol whose only legitimate caller lives in its own declaring file would produce a permanent false failure, and the natural "fix" for that is to weaken the rule, which is exactly the failure mode a guard like this exists to prevent. Recorded in the file's own header comment.
- **The resume route's success handler enqueues the RETURNED (new) task's id**, exactly like the create handler — a resume is a dispatch (D-30), and holding it back pending some other gate would introduce a second per-task pause mechanism the phase deliberately avoids.

## Deviations from Plan

None — plan executed exactly as written. The plan's own "flagged assumptions" (cutting the resumed worktree from the parent's branch tip rather than the default; the wiring guard proving reference, not reachability) were both implemented as flagged, with no escalation needed.

## Issues Encountered

None. The `resumeTask` teeth-check (demonstrating the wiring guard fails when its production reference is removed) required removing not just the route's function call but also two INCIDENTAL doc-comment mentions of `resumeTask` in `errors.ts` and `tasks.ts` — the scan matches raw text, including comments, which is exactly the acknowledged "reference, not reachability" scope limit recorded in the guard's own header. Reverted cleanly via `git checkout --` before the Task 3 commit; `git status --short` confirmed the working tree matched the prior commit exactly except for the new test file.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- RUN-06 is complete; the resume path is a real, tested, guarded production feature — no longer a documented-but-unreachable primitive.
- The wiring-invariant guard stands as ongoing protection for future plans in this phase (and later phases) against re-shipping the same defect class; new wiring-critical cross-module symbols should be added to its registry as they're introduced.
- Remaining Phase 2 gap-closure plan `02-18` is unaffected by this plan's changes (no shared files touched).

## Self-Check: PASSED

All 14 files/directories claimed as created/modified verified present via `git ls-files --error-unmatch`. All four commit hashes (`1688575`, `a0f4850`, `a3044ec`, `ada16ee`) verified present via `git log --oneline --all`.

---
*Phase: 02-execution-worktree-runner-billing-safety*
*Completed: 2026-07-26*

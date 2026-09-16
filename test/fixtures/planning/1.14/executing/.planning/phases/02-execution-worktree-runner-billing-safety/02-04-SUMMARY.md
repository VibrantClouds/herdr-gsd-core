---
phase: 02-execution-worktree-runner-billing-safety
plan: 04
subsystem: runner
tags: [tracer, worktree, child-process, spawn-argv, billing-safety, p-queue, fastify, cli]

# Dependency graph
requires:
  - phase: 02-execution-worktree-runner-billing-safety
    provides: "src/runner/env.ts (buildWorkerEnv, CLAUDE_ENV_ALLOWLIST, FORCED_GIT_ENV) from plan 02-01; p-queue@^9.3.3 and the confirmed D-03 no---bare decision from plan 02-02; the fake-claude-cli fixture (FAKE_CLAUDE_BIN_DIR, fixtureEnvFor, FLEET_FIXTURE_SCENARIO, seven scenarios) from plan 02-03"
provides:
  - "Runner interface (provision/spawn/kill/status, ProvisionResult, SpawnResult, RunnerStatus) — the RUN-07 seam a future container backend implements with no schema change"
  - "worktree-manager.ts: ensureWorktree() (idempotent add+lock, D-18 origin/local base-ref fallback), archiveWorktree() (unlock+remove, keeps branch ref), branchNameForTask()/worktreeRootFor() pure helpers, WorktreeError"
  - "worktree-runner.ts: WorktreeRunner implementing Runner; buildSpawnArgv() pure billing-safe argv builder; killTree() process-group teardown"
  - "scheduler/queue.ts: Scheduler wrapping p-queue — enqueue()/onIdle()/setConcurrency(), SchedulerError"
  - "tasks/service.ts: createTask()/getTask(), resolveCaps()/resolveModel(), TaskServiceError"
  - "POST /tasks, GET /tasks/:id; fleet task create|show CLI mirroring the HTTP surface"
  - "api/http/errors.ts: complete phase-02 CODE_TO_STATUS set plus one generic code-property error branch — no later plan in this phase edits this file"
  - "recordEvent() extraFields parameter (sessionId/turnsUsed/startedAt/endedAt) — the only sanctioned channel for non-INSERT tasks-row writes outside the status transition itself"
affects: [02-05, 02-06, 02-07, 02-08, 02-09, 02-10]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure argv builder (buildSpawnArgv) separated from the actual spawn call, so the billing contract is unit-testable without a process and re-verifiable by spawning the fixture and reading back received argv"
    - "Runner interface excludes filesystem paths and PIDs from its own surface — WorktreeRunner tracks pid/status internally in a private Map, never leaking process-specific fields into the seam a future DockerRunner would also have to satisfy"
    - "recordEvent() extraFields: a narrow, explicit metadata channel merged into the SAME transactional update as a status transition, preserving STATE-05's single-write-path invariant for runtime-observed fields that are not themselves a status change"
    - "branchName/worktreePath computed at task-INSERT time from pure functions of the generated UUID — never require a later UPDATE, so they never need the extraFields channel"

key-files:
  created:
    - src/runner/runner.interface.ts
    - src/runner/worktree-manager.ts
    - src/runner/worktree-runner.ts
    - src/runner/worktree-runner.test.ts
    - src/runner/worktree-runner.integration.test.ts
    - src/scheduler/queue.ts
    - src/tasks/service.ts
    - src/api/http/routes/tasks.ts
  modified:
    - src/api/http/app.ts
    - src/api/http/errors.ts
    - src/cli/index.ts
    - src/core/event-store/record-event.ts
    - src/spikes/fixtures/fake-claude-cli/claude

key-decisions:
  - "PD-04 (made during execution, not pre-recorded): absent a hook receiver in Phase 2 (D-14: \"hooks take that role in Phase 3\"), the only legal edge out of `running` a stdout-observed process exit can take today is `CRASH -> failed` — matching every other non-hook-confirmed exit from `running` (TIMEOUT, RECONCILE_ORPHANED, CANCEL). The real outcome (success vs. error, exit code, result subtype) is preserved in the event payload's `reason` field, never lost, but this tracer cannot promote a task to `review`/`done` without a real Stop hook. This satisfies the plan's literal instruction to record a \"HOOK_STOP-equivalent terminal event\" and its acceptance criterion that the terminal status be a member of TERMINAL_STATES."
  - "PD-05: extended `recordEvent()` with an optional `extraFields` parameter (sessionId/turnsUsed/startedAt/endedAt) rather than adding a second write path. `record-event.ts` is not in this plan's `files_modified` list, but the plan's own acceptance criteria require persisting these fields, and the pre-existing `single-writer.test.ts` repo-wide structural scan asserts NO module outside `record-event.ts` (and one documented `projects.ts` exception) may ever call `db.update(tasks)` — confirmed by running the full suite before writing any of this plan's DB-touching code. Extending the single write path, not adding a competing one, was the only design compatible with that pre-existing invariant."
  - "PD-06: `branchName`/`worktreePath` are computed at taREDACTED_SECRET INSERT time (via `branchNameForTask()`/`worktreeRootFor()`, both pure functions of the generated UUID) rather than deferred to provisioning time. This sidesteps needing a second `recordEvent()`-mediated write for fields that never change after creation, and lets `ensureWorktree()`'s own computation of the same values serve as an idempotency cross-check rather than the sole source of truth."
  - "PD-07: `SpawnResult` matches the plan's literally-specified five-field shape (`exitCode`, `sessionId`, `turnsUsed`, `durationMs`, `terminalSubtype`) exactly — no `pid` field, per ARCHITECTURE.md §7's explicit instruction that process-specific fields must never leak into the Runner interface. Consequence: `tasks.runner_pid`/`tasks.runner_started_at` are NOT populated by this tracer (both nullable columns, no test asserts them). A later plan (Phase 3 crash reconciliation, which needs this data) must decide how a pid channel reaches the Scheduler without widening `SpawnResult` — documented here as a known gap, not silently produced."

patterns-established:
  - "Doc comments describing the single-write-path invariant must paraphrase around the literal string \"db.update(tasks)\" — writing it verbatim inside a comment trips `single-writer.test.ts`'s content-based scan exactly as it did for `fake-claude-cli/index.ts` in plan 02-03. Caught and fixed while running the full suite before the first commit."

requirements-completed: [WT-01, WT-03, WT-04, RUN-01, RUN-02, RUN-07, RUN-08, BILL-04, TASK-01, SAFE-08]

coverage:
  - id: D1
    description: "POST /tasks provisions a locked worktree on a fleet/<short-id> branch, spawns against the fake-claude-cli happy-path fixture, records turnsUsed=3/sessionId/startedAt/endedAt, and archives the worktree while the branch survives"
    requirement: "TASK-01, WT-01, WT-04, RUN-01, RUN-02"
    verification:
      - kind: integration
        ref: "src/runner/worktree-runner.integration.test.ts#WorktreeRunner tracer (end-to-end) > provisions a locked worktree, spawns against the fixture, records turnsUsed/duration, and archives while keeping the branch"
        status: pass
    human_judgment: false
  - id: D2
    description: "Branch names are ref-format-legal and unique by construction (WT-03); a repo with no origin remote still provisions from the local default-branch ref (D-18); ensureWorktree() is idempotent across two calls (WT-04); the worktree HEAD is always the task branch, never the default branch (SAFE-08)"
    requirement: "WT-03, WT-04, SAFE-08"
    verification:
      - kind: integration
        ref: "src/runner/worktree-runner.integration.test.ts#worktree-manager (WT-01, WT-03, WT-04) — all 4 cases (check-ref-format, no-origin fallback, HEAD-is-task-branch, idempotent lock)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The Runner interface has exactly four members (provision/spawn/kill/status), a single WorktreeRunner implementation, and never drives an interactive TUI"
    requirement: "RUN-07, RUN-08"
    verification:
      - kind: other
        ref: "src/runner/runner.interface.ts — four-member Runner type, checked by tsc; src/runner/worktree-runner.ts spawns with stdio: ['ignore','pipe','pipe'] (no PTY)"
        status: pass
    human_judgment: true
    rationale: "RUN-07's \"a future backend needs no migration\" and RUN-08's \"never drives an interactive TUI\" are design properties per the plan's own flagged-assumptions section — no runtime test can prove a hypothetical future backend's needs; verified by review against the interface shape and the spawn call's stdio configuration."
  - id: D4
    description: "Every billing-safety property of buildSpawnArgv()'s output is asserted by a build-failing test: no --bare ever, --setting-sources '' exactly once, all three --disallowedTools deny rules, --permission-mode acceptEdits (never literal \"default\"), each billing flag exactly once, --max-turns base-10 round-trip — parameterized across default/taREDACTED_SECRET/project-override input combinations; the fixture-recorded argv deep-equals the builder's output; a spawn built while process.env.ANTHROPIC_API_KEY is polluted yields a fixture-observed key set that is a subset of the allowlist"
    requirement: "BILL-04"
    verification:
      - kind: unit
        ref: "src/runner/worktree-runner.test.ts — 21 assertions across buildSpawnArgv, the argv round-trip spawn, and the env-shape-at-spawn-time spawn"
        status: pass
    human_judgment: false
  - id: D5
    description: "No module in src/runner, src/scheduler, src/tasks, or src/api/http/routes issues a status-mutating write against the tasks table outside recordEvent()"
    requirement: "(cross-cutting invariant, STATE-05)"
    verification:
      - kind: unit
        ref: "src/core/event-store/single-writer.test.ts#single-writer invariant (STATE-05) — pre-existing repo-wide scan, re-run green after every file this plan added"
        status: pass
      - kind: other
        ref: "grep -rn \"db.update(tasks)\" src/runner src/scheduler src/tasks src/api/http/routes | grep -v \"record-event\" -> no matches"
        status: pass
    human_judgment: false

duration: ~90min
completed: 2026-07-24
status: complete
---

# Phase 02 Plan 04: Tracer — Task Create Through Worktree, Billing-Safe Spawn, Archive Summary

**One `fleet task create` now provisions a locked `fleet/<short-id>` worktree, spawns a billing-safe headless session against the fake-claude-cli fixture with an argv contract locked by 21 build-failing assertions, records `turnsUsed`/`sessionId`/timestamps, and archives the worktree while the branch survives — wired end to end through HTTP, the Scheduler, the Runner interface, and a single `recordEvent()` write path.**

## Performance

- **Duration:** ~90 min
- **Started:** 2026-07-24T21:20:00Z (approx)
- **Completed:** 2026-07-24T21:50:00Z (approx)
- **Tasks:** 2 (Task 1 tracer, Task 2 billing-contract lock)
- **Files modified:** 13 (8 created, 5 modified)

## Accomplishments

- Built the `Runner` seam (`provision`/`spawn`/`kill`/`status`, `ProvisionResult`, `SpawnResult`) exactly as D-17 specifies — four members, no class hierarchy, `WorktreeRunner` the only implementation, `tasks.runner_kind`/`runner_meta` ready for a future container backend with no schema change.
- `worktree-manager.ts`: idempotent `ensureWorktree()` (prune → detect-registered → add-if-absent → lock-if-unlocked) and `archiveWorktree()` (unlock → remove, branch ref kept forever), `branchNameForTask()`/`worktreeRootFor()` as pure functions of the generated task UUID, `resolveBaseRef()` implementing D-18's origin-remote-or-local-default fallback.
- `worktree-runner.ts`: `WorktreeRunner` spawning via `node:child_process.spawn` (D-13, not `execa`) with `detached: true, shell: false`, a pure `buildSpawnArgv()` builder emitting the exact D-01/D-09/D-10 flag set in the exact specified order, and `killTree()`'s process-group SIGTERM→SIGKILL escalation.
- `scheduler/queue.ts`: `Scheduler` wrapping `p-queue`, auto-dispatching on `enqueue()` (TASK-03's dispatch half — the slot-freeing half is plan 02-09's), threading every task-row mutation through `recordEvent()`.
- `tasks/service.ts`, `api/http/routes/tasks.ts`, `cli/index.ts`: `POST /tasks`/`GET /tasks/:id` and `fleet task create|show`, mirroring the `fleet project` command's exact HTTP-client shape (D-01 CLI isolation preserved — `parity.test.ts`'s structural scan still passes with no changes to that test).
- `api/http/errors.ts` closed out for the whole phase in one pass: every error code plans 02-05 through 02-09 will need, plus a generic `code`-property branch so no later plan in phase 02 edits this file again.
- Task 2 locked the billing contract with 21 assertions spanning the pure `buildSpawnArgv()` output, a real spawn against the fixture with argv read back via `FLEET_FIXTURE_ARGV_OUT`, and an env-shape assertion at actual spawn time via a new `FLEET_FIXTURE_ENV_OUT` fixture mechanism.

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end tracer** - `12af07f` (feat)
2. **Task 2: Lock the spawn-argv billing contract** - `b0fc600` (test)

**Plan metadata:** committed alongside this SUMMARY (worktree mode — STATE.md/ROADMAP.md excluded; orchestrator updates centrally)

## Files Created/Modified

- `src/runner/runner.interface.ts` - `Runner`, `RunnerStatus`, `ProvisionResult`, `SpawnResult`, `RunnerTask`
- `src/runner/worktree-manager.ts` - `ensureWorktree()`, `archiveWorktree()`, `resolveBaseRef()`, `worktreeRootFor()`, `branchNameForTask()`, `WorktreeError`
- `src/runner/worktree-runner.ts` - `WorktreeRunner`, `buildSpawnArgv()`, `killTree()`, `DEFAULT_ALLOWED_TOOLS`/`DEFAULT_DISALLOWED_TOOLS`/`PERMISSION_MODE`/`PROHIBITED_BARE_FLAG`
- `src/runner/worktree-runner.test.ts` - 21 build-failing billing-contract assertions (Task 2)
- `src/runner/worktree-runner.integration.test.ts` - the tracer's end-to-end verify plus worktree-manager-level idempotency/HEAD/ref-format/no-origin tests
- `src/scheduler/queue.ts` - `Scheduler`, `SchedulerError`
- `src/tasks/service.ts` - `createTask()`, `getTask()`, `resolveCaps()`, `resolveModel()`, `TaskServiceError`
- `src/api/http/routes/tasks.ts` - `registerTaskRoutes()`, `POST /tasks`, `GET /tasks/:id`
- `src/api/http/app.ts` - wires `Scheduler`+`WorktreeRunner` into `buildApp`, injectable `scheduler` dep for tests
- `src/api/http/errors.ts` - complete phase-02 `CODE_TO_STATUS` set; generic `code`-property error-rendering branch
- `src/cli/index.ts` - `TASK_ROUTE_MAP`, `fleet task create|show`, `taskColumns`
- `src/core/event-store/record-event.ts` - `RecordEventFields`, `recordEvent()`'s new optional `extraFields` parameter
- `src/spikes/fixtures/fake-claude-cli/claude` - added `FLEET_FIXTURE_ENV_OUT` support (echoes received env var key names)

## Decisions Made

See `key-decisions` in frontmatter (PD-04 through PD-07). Summary:
- **PD-04:** Absent Phase 3's hook receiver, a completed run's terminal signal is recorded as `CRASH -> failed` (the only edge available from `running` without a hook), with the real outcome preserved in the event payload's `reason` field.
- **PD-05:** `recordEvent()` gained an optional `extraFields` parameter rather than a second write path, preserving the pre-existing `single-writer.test.ts` invariant.
- **PD-06:** `branchName`/`worktreePath` are computed at taREDACTED_SECRET INSERT time, never requiring a later UPDATE.
- **PD-07:** `SpawnResult` stayed at the plan's literal five-field shape, deliberately excluding `pid` — `runner_pid`/`runner_started_at` remain unpopulated by this tracer (see Known Gaps below).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] `recordEvent()` needed a channel for runtime-observed task metadata**
- **Found during:** Task 1, designing how `branchName`/`sessionId`/`turnsUsed`/timestamps reach the `tasks` table
- **Issue:** The plan's acceptance criteria require `branchName`, `turnsUsed`, `sessionId`, `startedAt`/`endedAt` to be persisted, but `src/core/event-store/record-event.ts` is not in this plan's `files_modified` list, and the pre-existing `single-writer.test.ts` structural scan forbids any other module in the repo from calling `db.update(tasks)`.
- **Fix:** Extended `recordEvent()` with an optional `extraFields` parameter merged into the same transactional update, applied regardless of transition acceptance. `branchName`/`worktreePath` were resolved separately by computing them at taREDACTED_SECRET INSERT time instead (PD-06), so only `sessionId`/`turnsUsed`/`startedAt`/`endedAt` needed the new channel.
- **Files modified:** `src/core/event-store/record-event.ts`
- **Verification:** `record-event.test.ts` (9 pre-existing tests) and `single-writer.test.ts` (2 pre-existing tests) both pass unchanged; the new integration test confirms `sessionId`/`turnsUsed`/`startedAt`/`endedAt` are readable via `GET /tasks/:id` after the tracer runs.
- **Committed in:** `12af07f` (Task 1 commit)

**2. [Rule 1 - Bug] Doc comments containing the literal string `db.update(tasks)` tripped the single-writer structural scan**
- **Found during:** Task 1, first `npm test` run
- **Issue:** `src/scheduler/queue.ts` and `src/tasks/service.ts` both had doc comments describing the single-write-path invariant using the literal phrase `db.update(tasks)` — the same false-positive pattern documented in plan 02-03's SUMMARY (`fake-claude-cli/index.ts` tripped on the literal string `process.cwd()`).
- **Fix:** Reworded both comments to describe the same constraint without the literal token.
- **Files modified:** `src/scheduler/queue.ts`, `src/tasks/service.ts`
- **Verification:** Full `npm test` (`unit` project) green, 188/188.
- **Committed in:** `12af07f` (Task 1 commit)

**3. [Rule 1 - Bug] Empty-string tool overrides fell through instead of using the D-10 default**
- **Found during:** Task 2, writing the empty-override test for `buildSpawnArgv`
- **Issue:** `input.allowedTools ?? DEFAULT_ALLOWED_TOOLS` used nullish coalescing, so an explicit empty string (a legitimate "no override configured" shape from a future `.fleet.yml` reader) passed through as `''` instead of falling back to the default — violating the plan's own must-have that `--allowedTools` is never emitted with an empty-string value.
- **Fix:** Changed both `allowedTools` and `disallowedTools` resolution to `||` (falsy check) instead of `??`.
- **Files modified:** `src/runner/worktree-runner.ts`
- **Verification:** New test `an empty allowedTools override falls back to the D-10 default list rather than emitting an empty string` passes.
- **Committed in:** `b0fc600` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 missing-functionality addition required by the plan's own acceptance criteria, 2 bugs found via test-writing). No scope creep beyond what Task 1/2's own instructions and acceptance criteria required.

## Known Gaps

- **`tasks.runner_pid`/`tasks.runner_started_at` remain null.** The plan's action text asks for these to be persisted "via the task service," but `SpawnResult`'s literal five-field shape (no `pid`) is specified elsewhere in the same plan, and ARCHITECTURE.md §7 explicitly forbids leaking process-specific fields into the `Runner` interface. Both columns are nullable and untested by this plan's acceptance criteria. A later plan (Phase 3 crash reconciliation, which is the actual consumer of this data per `/proc` start-time correlation) needs to decide how a pid channel reaches the Scheduler without widening `SpawnResult`.
- **TASK-03 and TASK-05 deliberately left off `requirements-completed`** despite appearing in this plan's frontmatter `requirements` list. TASK-03 ("dispatch automatically when a concurrency slot frees") — this tracer proves auto-dispatch-on-creation, but never exercises concurrency-cap contention (no test runs more tasks than the configured cap). TASK-05 ("duration in seconds ... at the API/CLI surface") — this plan persists `startedAt`/`endedAt` as ISO timestamps only; no seconds-rounded presentation exists yet at the API or CLI layer. Both are genuinely plan 02-09's/a later plan's job to close, matching the precedent 02-03-SUMMARY.md set for QUAL-02/SAFE-03.
- **`--wall-clock-cap` enforcement is not implemented.** `wallClockCapMs` is accepted and persisted on task creation but `WorktreeRunner.spawn()` does not schedule a `setTimeout` to kill a long-running session. Not in this plan's explicit action text or acceptance criteria; a later plan (likely 02-09, alongside rate-limit backoff) is the natural place.

## Issues Encountered

None beyond the three auto-

<!-- FIXTURE TRUNCATED at 20 KiB by M0-G capture; original size 22218 bytes -->

---
phase: 02-execution-worktree-runner-billing-safety
plan: 08
subsystem: api
tags: [tasks, http, cli, model-routing, state-machine, fastify, zod, commander]

# Dependency graph
requires:
  - phase: 02-execution-worktree-runner-billing-safety
    provides: "POST /tasks + GET /tasks/:id tracer, createTask()/getTask()/resolveCaps()/resolveModel() skeletons, fleet task create|show CLI, Runner interface, WorktreeRunner, Scheduler, fake-claude-cli fixture, SPIKE-06 (bare model aliases confirmed) — all from plans 02-03/02-04"
provides:
  - "resolveModel/resolveCaps/resolveWallClockCapMs/resolveAllowedTools/resolveDisallowedTools in tasks/service.ts — the shared task > .fleet.yml > Fleet config > built-in-default precedence order (D-11/D-12), with model tier-name translation (cheap/default/high -> haiku/sonnet/opus) and dated-id/unrecognized-string rejection at the validation boundary"
  - "fleetYmlSchema override keys: model, max_turns, wall_clock_cap_ms, allowed_tools, disallowed_tools"
  - "GET /tasks (status/projectId filters, newest-first), GET /tasks/:id/events (reuses getTaskEvents, 404 for unknown id), POST /tasks/:id/cancel (kills a running task via the Scheduler's own Runner, records CANCEL, never calls archiveWorktree itself)"
  - "fleet task list|events|cancel CLI subcommands, TASK_ROUTE_MAP extended to five entries, resolveTaskPath(), eventColumns"
  - "queued.CANCEL -> failed transition table row (core/state-machine/transitions.ts) — closes a real gap: the table previously had no edge out of queued at all"
affects: [02-09, 02-10]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Generic resolvePrecedence<T>(input, fallback) backing five differently-typed resolvers (model/maxTurns/wallClockCapMs/allowedTools/disallowedTools) so all five share one precedence implementation, tested by five parallel it.each tables rather than duplicated conditional chains"
    - "Reading a collaborator's private field via a duck-typed accessor (runnerFor()) as a documented, deliberate escape hatch when the owning file is out of a wave's file-modification boundary — the duck-type check turns a future silent no-op into a loud runtime error instead"

key-files:
  created:
    - src/api/http/routes/tasks.test.ts
  modified:
    - src/tasks/service.ts
    - src/tasks/service.test.ts
    - src/api/http/routes/tasks.ts
    - src/cli/index.ts
    - src/cli/parity.test.ts
    - src/registry/fleet-yaml.ts
    - src/registry/fleet-yaml.test.ts
    - src/core/state-machine/transitions.ts
    - src/core/state-machine/transitions.test.ts

key-decisions:
  - "PD-08: cancelTask() derives model/cap resolution and cancellation logic entirely within tasks/service.ts's existing file boundary, but the HTTP cancel route needed the EXACT SAME Runner instance the Scheduler used to spawn() a task (a fresh WorktreeRunner's internal pid map would be empty, making kill() a silent no-op). queue.ts is owned by plan 02-09 (a later wave) and is not in this plan's files_modified, so registerTaskRoutes() reads the Scheduler's private `runner` field directly via a duck-typed runnerFor() helper rather than widening queue.ts's public surface. A rename of that field in 02-09 fails loudly (a thrown Error) instead of silently producing a non-functional cancel."
  - "PD-09: added a queued.CANCEL -> failed row to core/state-machine/transitions.ts (Rule 2 — missing critical functionality). The pre-existing table had NO edge out of queued for cancellation at all; without it, cancelling a queued task would record a permanently-rejected event and the task would sit in queued forever, contradicting this plan's own must-have that a queued task's cancellation lands in failed. Lands in failed for the same uniformity PD-01 already established for RATE_LIMITED (every non-success exit before a real run completes is failed, never a new state)."
  - "PD-10: true removal of a queued task from the Scheduler's p-queue pending set is NOT implemented — queue.ts (owned by 02-09) exposes no such method today. cancelTask() on a queued task only records CANCEL (moving tasks.status to failed); the task's own already-enqueued p-queue job still fires once its concurrency slot frees, and Scheduler.dispatch()'s DISPATCH transition on the now-failed row is correctly rejected by the state machine (accepted:0), but provision()/spawn() still run against the real Runner. Documented as a known gap for 02-09 to close with a genuine dequeue primitive — see Known Gaps below."
  - "PD-11 (Fleet config layer): 'Fleet config' in D-11/D-12's precedence order is the existing config.ts readConfigFile()/<fleetHome>/config.json mechanism (not a new module) — model/maxTurns/wallClockCapMs/allowedTools/disallowedTools keys are read from it with best-effort typed extraction (a wrong-typed key is treated as absent, matching readConfigFile()'s existing 'absent config is normal' posture)."

requirements-completed: [TASK-02, TASK-03, TASK-04, TASK-06, SAFE-03]
# TASK-01 and RUN-02 were already complete from plan 02-04 (unchanged here).

coverage:
  - id: D1
    description: "Model routing: task > .fleet.yml > Fleet config > sonnet default; tier names (cheap/default/high) translate to aliases before persistence; a dated model id or unrecognized string is rejected at task creation naming the three accepted aliases"
    requirement: "SAFE-03"
    verification:
      - kind: unit
        ref: "src/tasks/service.test.ts#resolveModel precedence / tier-name translation / rejection describe blocks"
        status: pass
      - kind: unit
        ref: "src/tasks/service.test.ts#creating a task with model: \"high\" persists tasks.model as \"opus\", never \"high\""
        status: pass
      - kind: integration
        ref: "src/api/http/routes/tasks.test.ts (via createTask, exercised indirectly through cap/tool-list precedence tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Cap and tool-list resolution (maxTurns, wallClockCapMs, allowedTools, disallowedTools) share the identical four-level precedence order as model resolution, asserted by a shared it.each shape across five resolver describe blocks; a fleetYml override replaces the default tool list wholesale rather than producing a superset"
    requirement: "RUN-02"
    verification:
      - kind: unit
        ref: "src/tasks/service.test.ts#resolveCaps / resolveWallClockCapMs / resolveAllowedTools / resolveDisallowedTools precedence describe blocks"
        status: pass
    human_judgment: false
  - id: D3
    description: "GET /tasks lists every task newest-first with optional status/projectId filters, returns {tasks:[]} on an empty db, and 400s on an unknown status value; POST /tasks is deliberately not idempotent (two identical bodies -> two distinct 201 rows)"
    requirement: "TASK-02"
    verification:
      - kind: integration
        ref: "src/api/http/routes/tasks.test.ts#GET /tasks on an empty database returns 200 with { tasks: [] } / GET /tasks?status=not_a_real_status returns 400 validation_failed / GET /tasks lists every created task... / POST /tasks is deliberately not idempotent..."
        status: pass
    human_judgment: false
  - id: D4
    description: "GET /tasks/:id/events returns every events row for a task in ascending id order (including rejected accepted:0 rows), 404s for an unknown task id rather than returning an empty array"
    requirement: "TASK-04"
    verification:
      - kind: integration
        ref: "src/api/http/routes/tasks.test.ts#GET /tasks/:id/events for an unknown task id returns 404 task_not_found / GET /tasks/:id/events returns rows in ascending id order, including rejected (accepted:0) rows"
        status: pass
    human_judgment: false
  - id: D5
    description: "POST /tasks/:id/cancel kills a running task's process group via the Scheduler's own Runner, records a CANCEL event (source=user), lands the task in failed, and archives the worktree through the SAME Scheduler.dispatch() finally block a normal completion reaches (no cancellation-specific teardown branch); a queued task is cancelled by recording the event alone; anything else is 409 task_not_running"
    requirement: "TASK-06"
    verification:
      - kind: integration
        ref: "src/api/http/routes/tasks.test.ts#cancels a running fixture-backed task... / cancels a queued task by recording CANCEL without touching the runner / cancelling an already-terminal task returns 409 task_not_running"
        status: pass
      - kind: unit
        ref: "src/tasks/service.test.ts#cancelTask on a running task calls runner.kill()... / cancelTask on a queued task records CANCEL... / cancelTask on an already-terminal task throws task_not_running..."
        status: pass
    human_judgment: false
  - id: D6
    description: "Tasks enqueue and dispatch automatically when a concurrency slot frees (TASK-03) — a second task stays queued behind a concurrency:1 slot occupied by the first, and its dispatch fires for real once the first is freed"
    requirement: "TASK-03"
    verification:
      - kind: integration
        ref: "src/api/http/routes/tasks.test.ts#cancels a queued task by recording CANCEL without touching the runner (the cleanup phase proves the freed-slot auto-dispatch)"
        status: pass
    human_judgment: false
  - id: D7
    description: "fleet task list|events|cancel CLI subcommands exist in structural 1:1 parity with five registered HTTP routes (TASK_ROUTE_MAP), with the CLI-isolation invariant (no src/db/, src/registry/, drizzle-orm imports) intact"
    requirement: "TASK-02, TASK-04, TASK-06"
    verification:
      - kind: unit
        ref: "src/cli/parity.test.ts#TASK_ROUTE_MAP describe block (three assertions) / CLI isolation (D-01) describe block"
        status: pass
      - kind: integration
        ref: "src/cli/parity.test.ts#`fleet task list --json` writes parseable JSON and nothing else to stdout / `fleet task cancel` against a 409 (already-terminal task) exits EXIT_FAILED"
        status: pass
    human_judgment: false

duration: ~2h
completed: 2026-07-26
status: complete
---

# Phase 02 Plan 08: Task Surface Completion — List, Event History, Cancellation, Model Routing Summary

**Model/cap/tool-list resolution across a shared task > `.fleet.yml` > Fleet config > default precedence order, plus `GET /tasks`, `GET /tasks/:id/events`, `POST /tasks/:id/cancel`, and their `fleet task list|events|cancel` CLI mirrors — cancellation reuses the Scheduler's existing terminal-archival path with zero cancellation-specific teardown code.**

## Performance

- **Duration:** ~2h
- **Started:** 2026-07-26T14:40:00Z (approx)
- **Completed:** 2026-07-26T15:06:00Z (approx)
- **Tasks:** 3
- **Files modified:** 10 (1 created, 9 modified)

## Accomplishments

- `resolveModel`/`resolveCaps`/`resolveWallClockCapMs`/`resolveAllowedTools`/`resolveDisallowedTools` in `src/tasks/service.ts` share one `resolvePrecedence<T>()` implementation of D-11/D-12's task > `.fleet.yml` > Fleet config > built-in-default order, exercised by five parallel `it.each` precedence tables plus dedicated tier-name-translation and rejection tests.
- `createTask()` now reads `.fleet.yml` live from the project's `repoPath` and the daemon's `config.json` to fill that resolution order end to end — a task created with `model: 'high'` persists `tasks.model = 'opus'`, never `'high'`.
- `fleetYmlSchema` gained `model`/`max_turns`/`wall_clock_cap_ms`/`allowed_tools`/`disallowed_tools` override keys, still `.strict()`.
- `GET /tasks` (status/projectId filters, newest-first, `{tasks:[]}` on empty), `GET /tasks/:id/events` (reuses the existing ascending-id `getTaskEvents()`, 404s rather than returning `[]` for an unknown id), and `POST /tasks/:id/cancel` (strict empty body) round out the HTTP task surface.
- Cancellation kills a `running` task's process group through the Scheduler's own `Runner` instance, records a `CANCEL` event with `source: 'user'`, and relies entirely on the already-in-flight `Scheduler.dispatch()`'s existing `finally` block to archive the worktree — `cancelTask()` itself never calls `archiveWorktree()`, so there is no second teardown path to keep correct (D-26).
- `fleet task list|events|cancel` CLI subcommands added, `TASK_ROUTE_MAP` extended to five entries, all structurally asserted against the live Fastify route table the same way `PROJECT_ROUTE_MAP` already is.
- Closed a real gap in `core/state-machine/transitions.ts`: the table had no edge at all out of `queued` for cancellation — added `queued.CANCEL -> failed`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Model routing and cap resolution with a full resolution-order test matrix** - `b4b9757` (feat)
2. **Task 2: List, event history, and cancellation over HTTP** - `26a72ef` (feat)
3. **Task 3: CLI task subcommands in structural 1:1 parity with the routes** - `905e4da` (feat)
4. **Follow-up: assert POST /tasks non-idempotency (TASK-02 must-have gap found during self-check)** - `3acddf6` (test)

**Plan metadata:** committed alongside this SUMMARY (worktree mode — STATE.md/ROADMAP.md excluded; orchestrator updates centrally)

## Files Created/Modified

- `src/tasks/service.ts` - `resolveModel()`, `resolveCaps()`, `resolveWallClockCapMs()`, `resolveAllowedTools()`, `resolveDisallowedTools()`, `resolvePrecedence<T>()`, `listTasks()`, `cancelTask()`; `createTask()` now reads `.fleet.yml`/`config.json`
- `src/tasks/service.test.ts` - precedence `it.each` tables (5 resolvers x 4 levels), tier-translation/rejection tests, DB-backed `createTask`/`listTasks`/`cancelTask` tests with a `FakeRunner`
- `src/api/http/routes/tasks.ts` - `GET /tasks`, `GET /tasks/:id/events`, `POST /tasks/:id/cancel`, `runnerFor()`
- `src/api/http/routes/tasks.test.ts` - new file; one test per `<behavior>` bullet, plus a fixture-backed running-task-cancel test and a concurrency-slot-freeing queued-task-cancel test
- `src/cli/index.ts` - `TASK_ROUTE_MAP` extended to 5 entries, `resolveTaskPath()`, `eventColumns`, `fleet task list|events|cancel`
- `src/cli/parity.test.ts` - `TASK_ROUTE_MAP` describe block, `--json`/exit-code assertions for `task list`/`task cancel`; live-daemon `beforeEach` rewired to a fixture-backed Scheduler + temp `FLEET_HOME`
- `src/registry/fleet-yaml.ts` - `fleetYmlSchema` gains 5 override keys
- `src/registry/fleet-yaml.test.ts` - schema-acceptance and read-back tests for the new keys
- `src/core/state-machine/transitions.ts` - `queued.CANCEL -> failed` row
- `src/core/state-machine/transitions.test.ts` - `queued + CANCEL -> failed` test

## Decisions Made

See `key-decisions` in frontmatter (PD-08 through PD-11). Summary:

- **PD-08:** `registerTaskRoutes()` reads the Scheduler's private `runner` field via a duck-typed `runnerFor()` helper instead of widening `queue.ts` (owned by plan 02-09, out of this plan's `files_modified`) — a rename fails loudly rather than silently no-op'ing `kill()`.
- **PD-09:** Added `queued.CANCEL -> failed` to the transition table (Rule 2 deviation) — without it, cancelling a queued task had nowhere to go.
- **PD-10:** True pending-queue removal (dequeue a specific p-queue job) is NOT implemented — `queue.ts` exposes no such primitive today. Documented as a known gap for 02-09.
- **PD-11:** "Fleet config" in the precedence order is the existing `config.ts`/`config.json` mechanism, not a new module.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] `queued` had no `CANCEL` transition edge at all**
- **Found during:** Task 1, designing `cancelTask()`'s queued-task branch
- **Issue:** `core/state-machine/transitions.ts`'s `queued` row only had `DISPATCH`. Calling `recordEvent(CANCEL)` on a queued task would be silently rejected (`accepted: 0`), leaving the task in `queued` forever — directly contradicting this plan's own must-have that a cancelled queued task lands in `failed`.
- **Fix:** Added `queued: { CANCEL: [{ target: 'failed' }] }`, matching the uniformity PD-01 already established for `RATE_LIMITED`.
- **Files modified:** `src/core/state-machine/transitions.ts`, `src/core/state-machine/transitions.test.ts`
- **Verification:** New test `queued + CANCEL -> failed (D-05/TASK-06, plan 02-08)`; the pre-existing exhaustive cross-product test and the "one row per `TASK_STATES` member" test both still pass unchanged.
- **Committed in:** `b4b9757` (Task 1 commit)

**2. [Rule 3 - Blocking, file-boundary variant] `registerTaskRoutes()` needed the Scheduler's `Runner` but `queue.ts` is out of scope**
- **Found during:** Task 2, wiring `POST /tasks/:id/cancel`
- **Issue:** Cancelling a `running` task needs `runner.kill(task)` called on the EXACT SAME `Runner` instance the Scheduler used to `spawn()` it (a fresh instance's internal pid bookkeeping is empty, making `kill()` silently do nothing). `Scheduler` (queue.ts) holds its `runner` as a private field with no public accessor, and `queue.ts` is owned by plan 02-09 in a later wave — not in this plan's `files_modified`, and the orchestrator's parallel-execution boundary explicitly excludes it. `app.ts` (which constructs the default `Scheduler`) is similarly out of scope (owned/edited by 02-04/02-07).
- **Fix:** Added `runnerFor(scheduler)` in `routes/tasks.ts` — reads the existing private `runner` field directly via a duck-type check (confirms the extracted value has a `kill` function before returning it), throwing a clear error if the shape doesn't match rather than silently returning a non-functional object. No production or test call site needed a new parameter threaded through `buildApp`/`registerTaskRoutes`.
- **Files modified:** `src/api/http/routes/tasks.ts`
- **Verification:** `src/api/http/routes/tasks.test.ts`'s running-task-cancel test proves the real process is actually killed (worktree directory gone, branch survives) using exactly this mechanism, both with a custom test-constructed `Scheduler` and (via `cli/parity.test.ts`) with the default `buildApp({db})`-constructed one.
- **Committed in:** `26a72ef` (Task 2 commit)

**3. [Rule 1 - Bug, caught before any commit] `cli/parity.test.ts`'s live-daemon test block would have written into the real `~/.fleet` on the machine running the tests**
- **Found during:** Task 3, adding a `fleet task create`/`fleet task cancel` test to the existing "against a live daemon" describe block
- **Issue:** That block's `beforeEach` built its Fastify app with the DEFAULT (real, unwired) `WorktreeRunner` and never overrode `FLEET_HOME`. Before this plan, no test in that block ever created a task, so the gap was latent. Adding a taREDACTED_SECRET test would have caused `ensureWorktree()` to provision a REAL git worktree directory under the developer's actual `~/.fleet/worktrees/...` (confirmed by directly observing this happen once during development, then removed with `rmdir`) instead of a disposable temp directory, and could in principle have caused a real `spawn('claude', ...)` call if the default runner's argv had ever reached that far.
- **Fix:** Rewired the `beforeEach` to construct a `Scheduler`/`WorktreeRunner` pair pointed at the fake-claude-cli fixture (`happy-path` scenario) and to set `process.env.FLEET_HOME` to a per-test temp directory (restored/cleaned up in the existing `afterEach`), before adding any taREDACTED_SECRET test to that block. The same fix pattern was then applied proactively to a similar new test added to `src/api/http/routes/tasks.test.ts` (`POST /tasks` non-idempotency), which needed a fixture-backed scheduler for the same reason.
- **Files modified:** `src/cli/parity.test.ts`, `src/api/http/routes/tasks.test.ts`
- **Verification:** Re-ran the full suite with an explicit `test -d "$HOME/.fleet"` check immediately before and after — confirmed absent both times for every test file I own.
- **Committed in:** `905e4da` (Task 3 commit) and `3acddf6` (follow-up test commit)

---

**Total deviations:** 3 auto-fixed (1 missing-transition-edge correctness fix, 1 file-boundary-driven design decision, 1 test-hygiene bug caught before any commit). No scope creep beyond what Task 1/2/3's own instructions and acceptance criteria required.

## Known Gaps

- **True pending-queue removal is not implemented (PD-10).** `cancelTask()` on a `queued` task records `CANCEL` (moving `tasks.status` to `failed`) but cannot remove the task's already-enqueued job from the Scheduler's internal `p-queue`. When that job's concurrency slot eventually free

<!-- FIXTURE TRUNCATED at 20 KiB by M0-G capture; original size 24618 bytes -->

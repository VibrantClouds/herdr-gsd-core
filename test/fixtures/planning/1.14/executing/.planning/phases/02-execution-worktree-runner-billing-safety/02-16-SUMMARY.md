---
phase: 02-execution-worktree-runner-billing-safety
plan: 16
subsystem: database
tags: [drizzle, sqlite, taREDACTED_SECRET, resume, state-machine]

# Dependency graph
requires:
  - phase: 02-execution-worktree-runner-billing-safety
    provides: "createTask/getTask/cancelTask (plan 02-04), agent profile columns (plan 02-12), toTaskRepresentation/taskDurationSeconds (plan 02-15)"
provides:
  - "Two nullable resume columns (resumed_from_task_id, resume_session_id) on tasks, shipped by a generated, journalled migration"
  - "resumeTask() — validated, named-error resume creation, routed through the single createTask() INSERT path"
  - "RESUMABLE_STATES, MAX_RESUME_CHAIN_DEPTH, resumeChainDepth() — the bounded chain-depth primitive"
affects: [02-17]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A resume forks a NEW task row rather than reopening a terminal one (D-06 preserved) — decided by a human at Task 1's checkpoint before any code was written"
    - "Both a lineage column and an independently-captured session-id column are kept on the same row, deliberately not normalised into one, because the redundancy records two different facts (lineage vs. audit record of the resume request)"

key-files:
  created: [drizzle/0002_task_resume.sql, drizzle/meta/0002_snapshot.json]
  modified: [src/db/schema.ts, drizzle/meta/_journal.json, src/db/migrate.test.ts, src/tasks/service.ts, src/tasks/service.test.ts]

key-decisions:
  - "Task 1 (human decision, gate=blocking): fork-new-row. `fleet task resume <id>` creates a NEW task row that continues the original's session; the original row stays terminal. Honours D-06 in transitions.ts exactly — no edge out of a terminal state, state graph stays a DAG, each task's event log stays one unambiguous story."
  - "RESUMABLE_STATES is exactly `['failed']` for this phase, declared as a named constant rather than an inline status check, so widening it later (e.g. to include `review`) is a deliberate one-line edit."
  - "MAX_RESUME_CHAIN_DEPTH is a policy number (5), not a measured one — exists to make a runaway resume chain structurally impossible against the subscription usage window."
  - "resumeChainDepth() bounds its own walk by MAX_RESUME_CHAIN_DEPTH so a cyclic lineage (which the schema does not prevent — no FK on the lineage column) terminates rather than looping."

patterns-established:
  - "A resume reads resume_session_id server-side from the parent row it just loaded by primary key — never from caller input — closing the spoofing surface a public field would open."

requirements-completed: []  # RUN-06 deliberately left unmarked — this plan is the storage/service half only; plan 02-17 earns the mark with the dispatch hop

coverage:
  - id: D1
    description: "Task 1 decision recorded: resume forks a new task row (fork-new-row), decided by a human before any implementation"
    verification:
      - kind: other
        ref: "Decision recorded verbatim in this SUMMARY's key-decisions and in the orchestrator-supplied checkpoint resolution"
        status: pass
    human_judgment: false
  - id: D2
    description: "Two nullable resume columns (resumed_from_task_id, resume_session_id) added to tasks, shipped via a real drizzle-kit-generated migration listed in the journal"
    requirement: "RUN-06"
    verification:
      - kind: unit
        ref: "src/db/migrate.test.ts#the tasks table gains nullable resume columns (RUN-06, plan 02-16)"
        status: pass
      - kind: unit
        ref: "src/db/migrate.test.ts#the migration journal lists exactly three entries"
        status: pass
      - kind: integration
        ref: "src/db/packaging.e2e.test.ts (all 4 tests, built-daemon packaging with 3-migration trail)"
        status: pass
    human_judgment: false
  - id: D3
    description: "resumeTask() validates and creates a resumed task row, refusing every meaningless resume by a distinct named error code, never half-creating a row"
    requirement: "RUN-06"
    verification:
      - kind: unit
        ref: "src/tasks/service.test.ts#resumeTask (RUN-06) — 21 tests covering success, lineage/inheritance, prompt override, every named refusal, and the 5-deep chain bound"
        status: pass
    human_judgment: false
  - id: D4
    description: "resumeTask has no production caller when this plan completes — deliberate, recorded gap closed by plan 02-17"
    verification: []
    human_judgment: true
    rationale: "Not independently testable — this is a documentation/process assertion about scope boundary, not a behavior. Plan 02-17's repository-scan guard (its own Task 3) is what makes this gap detectable rather than permanent."

duration: 35min
completed: 2026-07-26
status: complete
---

# Phase 02 Plan 16: Resume Persistence and Validation Summary

**Two nullable resume columns shipped via a real generated migration, and `resumeTask()` — a validated, named-error resume creation function routed through the existing `createTask()` INSERT path — with `resumeTask` intentionally unwired until plan 02-17.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 3 (1 checkpoint decision, resolved by a human before this agent started; 2 auto tasks executed by this agent)
- **Files modified:** 8 (2 new, 6 modified)

## Task 1: Decision (resolved by human before this agent's run)

**Decision: fork-new-row.** `fleet task resume <id>` creates a NEW task row that continues the original's session; the original row stays terminal. This was selected by a human at the plan's `checkpoint:decision` gate, prior to this continuation agent being spawned — no implementation work preceded the decision, and Tasks 2 and 3 proceeded exactly as the plan specifies for that branch.

Rationale (from the plan's own framing, now realized in code): `src/core/state-machine/transitions.ts` states in its own doc comment that `failed`/`rejected`/`done` are fully terminal (D-06) and that retrying means creating a new task row, never transitioning the original back. The `reopen-original` alternative would have required adding an edge out of a terminal state, contradicting D-06 directly. No changes were made to `transitions.ts` — verified unchanged by `git diff --stat` before commit.

## Accomplishments

- `tasks.resumed_from_task_id` and `tasks.resume_session_id`: two nullable, no-default, no-FK columns added immediately after `session_id`, shipped via `drizzle/0002_task_resume.sql` generated by `npm run db:generate -- --name task_resume` (never hand-written) — the journal now lists three entries and the migration statements are additive `ALTER TABLE ... ADD` columns, not a table rebuild.
- `resumeTask(db, id, input)`: loads the parent via `getTask` (unknown id → existing `task_not_found`), then refuses by name for: a non-resumable status (`task_not_resumable`, naming the observed status), a missing session id (`task_has_no_session`), a missing branch name (`task_has_no_branch`), or a chain already at `MAX_RESUME_CHAIN_DEPTH` (`resume_chain_depth_exceeded`). On success, calls the existing `createTask()` — never a second INSERT path — passing the parent's project, title, prompt (or an override), model, turn cap, wall-clock cap, and agent profile, plus the two resume fields.
- `RESUMABLE_STATES` (exactly `['failed']`), `MAX_RESUME_CHAIN_DEPTH` (5), and `resumeChainDepth()` (a lineage walk bounded by the same constant, so a cyclic lineage terminates rather than looping — the schema has no FK constraint preventing a cycle).
- `CreateTaskInput` gains `resumedFromTaskId`/`resumeSessionId`, documented as populated ONLY by `resumeTask` and deliberately absent from the public taREDACTED_SECRET surface — `resumeSessionId` is read server-side from the parent row, never caller-suppliable.
- 21 new tests in `src/tasks/service.test.ts` covering: successful resume + new-id assertion, lineage/session-id assertions, parent-row byte-identity after resume, full inheritance (project/title/prompt/model/caps/agent-profile), explicit prompt override vs. verbatim inheritance, unknown-id, all 7 non-`failed` states each raising `task_not_resumable` with the status named in the message (and no row created), missing-session and missing-branch refusals (no row created), and a 5-deep resume chain whose 6th resume is refused (no row created).
- 2 new tests in `src/db/migrate.test.ts` asserting the fresh-database schema has both new nullable columns and the journal lists exactly three entries.

## Task Commits

Each task was committed atomically:

1. **Task 1: Decide what a resume is** — resolved by human decision before this agent's run (fork-new-row); no commit, no code changes attributable to this task.
2. **Task 2: Two nullable resume columns and a real generated migration** — `048a9f6` (feat)
3. **Task 3: `resumeTask()` — every way a resume can be meaningless, refused by name** — `628bf9b` (feat)

**Plan metadata:** this commit (docs: complete plan)

## Files Created/Modified

- `src/db/schema.ts` — two new nullable columns on `tasks`, documented (why both exist, not just lineage)
- `drizzle/0002_task_resume.sql` — generated migration, additive `ALTER TABLE`
- `drizzle/meta/0002_snapshot.json` — generated schema snapshot (companion to the migration)
- `drizzle/meta/_journal.json` — third entry appended by `db:generate`
- `src/db/migrate.test.ts` — two new fresh-database assertions (nullable columns, three journal entries)
- `src/tasks/service.ts` — `resumeTask`, `RESUMABLE_STATES`, `MAX_RESUME_CHAIN_DEPTH`, `resumeChainDepth`, four new `TaskServiceErrorCode` members, `CreateTaskInput`/`createTask` extended with the two resume fields
- `src/tasks/service.test.ts` — 21 new `resumeTask` tests, plus a one-line fixture fix for `toTaskRepresentation`'s test (see Deviations)

## Decisions Made

See Task 1 above (fork-new-row) and the frontmatter `key-decisions` block.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Populated this worktree's empty `node_modules` before running tests**
- **Found during:** Task 2 verification
- **Issue:** This worktree's own `node_modules/` contained only Vite cache directories — no real packages were installed here (module resolution had been silently falling back to a `node_modules` several directories up the tree for ordinary `vitest run`, but `src/db/packaging.e2e.test.ts` symlinks `REPO_ROOT/node_modules` — this worktree's own, nearly-empty one — into an isolated `mkdtemp` install root with no ancestor chain back to real dependencies, so the built daemon child failed with `ERR_MODULE_NOT_FOUND: commander`).
- **Fix:** Ran `npm install --prefer-offline --no-audit --no-fund` in this worktree (236 packages added in ~2s from the local cache). Not a code change — no files modified, nothing committed for this fix.
- **Verification:** `npm test -- src/db/migrate.test.ts src/db/packaging.e2e.test.ts` went from 2 failing (packaging e2e Tests 2 and 3) to 11/11 passing.

**2. [Rule 3 - Blocking] Fixed `toTaskRepresentation` test fixture broken by the new schema columns**
- **Found during:** Task 2 verification (`npm run build`, invoked by `packaging.e2e.test.ts`'s `beforeAll`)
- **Issue:** `src/tasks/service.test.ts`'s `toTaskRepresentation (TASK-05)` test constructs a `TaskRow`-typed object literal by hand. Adding the two new columns to the schema made that literal's inferred type incomplete, failing `tsc` with `TS2739: ... is missing the following properties ... resumedFromTaskId, resumeSessionId` — a direct, mechanical consequence of Task 2's schema change, not a pre-existing issue.
- **Fix:** Added `resumedFromTaskId: null, resumeSessionId: null` to the fixture object, immediately after `sessionId`, matching the schema's own column order.
- **Files modified:** `src/tasks/service.test.ts`
- **Verification:** `npm run typecheck` and the full `npm test` (518/518) both pass.
- **Committed in:** `048a9f6` (Task 2 commit — the fix is inseparable from the schema change that caused it)

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking, both direct consequences of Task 2's schema change or this worktree's pre-existing empty `node_modules`)
**Impact on plan:** No scope creep — both fixes were required to reach a green `npm test`/`npm run typecheck`/`npm run lint` state that Task 2's own acceptance criteria mandate.

## Issues Encountered

None beyond the two deviations above.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `resumeTask` exists, is fully tested, and is intentionally **unwired**: it has no production caller (no HTTP route, no CLI command, no dispatch wiring) when this plan completes. This is the exact shape of gap this phase has now shipped three times, and is recorded here per the plan's own instruction so it is found here rather than rediscovered later.
- Plan `02-17` is the closing half: the HTTP route (`POST /tasks/:id/resume` or equivalent), the CLI command, the dispatch-time read of `resume_session_id` into `Scheduler.dispatch()`'s `RunnerTask` (feeding `buildSpawnArgv`'s existing `--resume`/`--fork-session` branch), and a repository-scan guard that fails when a wiring-critical exported symbol (starting with `resumeTask` by name) has no non-test production reference.
- `RUN-06` is deliberately left unmarked in `.planning/REQUIREMENTS.md` — plan `02-17` earns that mark once the dispatch hop lands.
- No changes were made to `src/core/state-machine/transitions.ts` (verified via `git diff --stat`, empty) and `src/core/event-store/single-writer.test.ts` passes unchanged (2/2), confirming the fork-new-row decision required no state-graph edit.

## Self-Check: PASSED

- `src/db/schema.ts` — FOUND, contains `resumedFromTaskId`/`resumeSessionId`
- `drizzle/0002_task_resume.sql` — FOUND
- `drizzle/meta/0002_snapshot.json` — FOUND
- `src/tasks/service.ts` — FOUND, contains `resumeTask`, `RESUMABLE_STATES`, `MAX_RESUME_CHAIN_DEPTH`, `resumeChainDepth`
- Commit `048a9f6` — FOUND in `git log --oneline --all`
- Commit `628bf9b` — FOUND in `git log --oneline --all`
- Full suite: 29 files / 518 tests passing; `npm run typecheck` exits 0; `npm run lint` exits 0

---
*Phase: 02-execution-worktree-runner-billing-safety*
*Completed: 2026-07-26*

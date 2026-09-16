---
phase: 02-execution-worktree-runner-billing-safety
plan: 05
subsystem: runner
tags: [git-worktree, idempotency, fleet-yml, spawnSync, crash-recovery]

# Dependency graph
requires:
  - phase: 02-execution-worktree-runner-billing-safety
    provides: "src/runner/worktree-manager.ts's create-and-lock tracer slice, src/runner/env.ts's buildWorkerEnv()/CLAUDE_ENV_ALLOWLIST, and src/registry/fleet-yaml.ts's readFleetYml() from plan 02-04"
provides:
  - "ensureWorktree(): the full ARCHITECTURE.md §4 four-step idempotent algorithm (prune -> detect-registered -> reattach-existing-branch -> clear-stray-directory), converging from any of five partial states (A-E) without throwing"
  - "parseWorktreePorcelain(): standalone, git-free parser for `git worktree list --porcelain` output"
  - "runSetupCommands(): executes a project's .fleet.yml setup commands inside the worktree under buildWorkerEnv()'s allowlisted environment, read live via readFleetYml(), never snapshotted"
  - "captureDirtyWork()/archiveWorktree(): dirty-work-capture-before-teardown — a commit onto the task branch under Fleet's injected identity precedes unlock+remove, and the branch outlives the worktree"
  - "Branch-name collision handling (D-20): a numeric suffix (-2, -3, ...) is appended when the canonical fleet/<short-id> branch is already checked out elsewhere, capped at 100 attempts"
affects: [02-06, 02-07, 02-08, 02-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Total-function git helpers (gitStatusPorcelainBestEffort / gitStatusPorcelainOrThrow) separating 'a failed status check is fine to treat as clean' from 'a failed status check must halt' call sites, matching fleet-yaml.ts's never-throw-unless-genuinely-unexpected discipline"
    - "Stray-registration cleanup (branch mismatch at the target path) reuses the same capture-then-remove sequence as archiveWorktree() rather than force-removing, so the threat-model's no-force-remove-without-capture prohibition holds on every code path in the module, not just the documented teardown path"
    - "Branch-name resolution and directory-cleanup are two independent decisions computed before the single `add` call site — a stray on-disk directory is cleared regardless of which add form (with or without -b) the branch-existence check selected"

key-files:
  created: []
  modified:
    - src/runner/worktree-manager.ts
    - src/runner/worktree-manager.test.ts

key-decisions:
  - "Kept ArchiveWorktreeInput's signature unchanged ({ repoPath, worktreePath }, no new taskId field) by deriving taskId from basename(worktreePath) — worktreeRootFor() already makes the task UUID the directory's own name, so no call-site outside this plan's files_modified list (scheduler/queue.ts, worktree-runner.integration.test.ts) needed to change."
  - "Added an optional setupTimeoutMs to EnsureWorktreeInput rather than widening the interface with a required field, so worktree-runner.ts's existing ensureWorktree() call (from plan 02-04) keeps compiling unchanged."
  - "State B's 'already registered, correct branch' check accepts the canonical fleet/<short-id> name OR any numeric-suffixed variant (fleet/<short-id>-N) at the target path, not just an exact match — a task whose branch was suffixed once (state E) must still recognize itself as correctly provisioned on a later idempotent call, since the target path is unique per task by construction and nothing else could have provisioned there."
  - "The 'registered at target path but on an unexpected branch' case (mentioned in ARCHITECTURE.md §4's algorithm text but not one of the five acceptance-criteria states) is implemented via the same capture-then-remove sequence as archiveWorktree(), never a force-remove — required by the threat model's blanket prohibition on discarding uncommitted work, which is not limited to the documented teardown path."
  - "Added a defensive worktree_remove_failed WorktreeErrorCode (not in errors.ts's CODE_TO_STATUS map, so it falls through to the generic 500 status) for the case a plain `git worktree remove` fails after a successful capture+unlock — an unlikely path with no dedicated test, kept for total-function discipline rather than an unhandled throw."

patterns-established:
  - "Every git-status-read call site in this module goes through one of two named helpers (gitStatusPorcelainBestEffort / gitStatusPorcelainOrThrow) rather than an inline try/catch — makes the 'is this a fail-open or fail-closed status check' decision visible at the call site instead of buried in a catch block."

requirements-completed: [WT-01, WT-02, WT-05, WT-06, WT-07, SAFE-08]

coverage:
  - id: D1
    description: "ensureWorktree() converges on one locked worktree from any of five partial states (A: nothing exists, B: registered+correct branch, C: branch exists/not registered, D: directory on disk/not registered, E: branch collision with an unrelated checkout) without throwing, and locking stays idempotent across repeated calls"
    requirement: "WT-01, WT-02, SAFE-08"
    verification:
      - kind: unit
        ref: "src/runner/worktree-manager.test.ts#ensureWorktree — four-step idempotent algorithm (WT-01/02/04, SAFE-08) — 8 tests covering states A-E, exactly-one-locked-line idempotency, locked-worktree-remove-fails, and resolveBaseRef's no-origin fallback"
        status: pass
    human_judgment: false
  - id: D2
    description: "A stray directory removal (ensureWorktree()'s step 4) refuses to clear a path outside worktreeRootFor()'s Fleet-owned root, throwing WorktreeError('worktree_path_outside_root') instead"
    requirement: "SAFE-08"
    verification:
      - kind: unit
        ref: "src/runner/worktree-manager.test.ts#ensureWorktree — four-step idempotent algorithm > throws WorktreeError with code worktree_path_outside_root when asked to clear a directory outside worktreeRootFor()'s root"
        status: pass
    human_judgment: false
  - id: D3
    description: ".fleet.yml setup commands run inside the worktree, after add-and-lock and before any spawn, under buildWorkerEnv()'s allowlisted environment (asserted at the real spawn boundary via an env dump) — a repo with no .fleet.yml or an empty setup array runs zero commands, a failing command returns the command string and captured output, and a hanging command is terminated at its own timeout"
    requirement: "WT-05"
    verification:
      - kind: unit
        ref: "src/runner/worktree-manager.test.ts#runSetupCommands (WT-05, D-24) — 7 tests: zero-.fleet.yml, empty/absent setup key, file-created-before-return, failing-command structured failure, timeout termination, env-shape-at-spawn-boundary, and ensureWorktree()'s own setup_command_failed propagation"
        status: pass
    human_judgment: false
  - id: D4
    description: "archiveWorktree() commits any dirty tracked/untracked state onto the task branch (under Fleet's injected identity, never the ambient git user) before unlocking and removing the worktree; a clean worktree produces no commit; the branch survives removal; archival is idempotent"
    requirement: "WT-06, WT-07"
    verification:
      - kind: unit
        ref: "src/runner/worktree-manager.test.ts#archiveWorktree (WT-06/07, D-22/D-23) — 5 tests: dirty-capture-single-commit-with-both-files, clean-tree-no-commit, branch-survives-and-worktree-deregistered, idempotent-double-archive, captureDirtyWork-noop-on-clean-tree"
        status: pass
    human_judgment: false
  - id: D5
    description: "No destructive git verb (--force removal, branch -D, reset --hard, git clean) and no persistent user-repository config mutation (worktreeConfig, config --worktree, pushurl) appears anywhere under src/runner/"
    requirement: "(cross-cutting, threat model T-2-12/T-2-13)"
    verification:
      - kind: other
        ref: "grep -rn \"remove --force|remove -f|branch -D|reset --hard|git clean\" src/runner/worktree-manager.ts -> no matches; grep -rn \"worktreeConfig|config --worktree|pushurl\" src/runner/ -> no matches"
        status: pass
    human_judgment: false
  - id: D6
    description: "The whole repository's unit test suite, typecheck, and lint all pass with this plan's changes applied"
    requirement: "(plan-wide verification)"
    verification:
      - kind: other
        ref: "npm test (231/231 across 21 files, up from 209/209 pre-plan), npm run typecheck (tsc --noEmit, 0 errors), npm run lint (eslint ., 0 errors)"
        status: pass
    human_judgment: false

duration: ~55min
completed: 2026-07-26
status: complete
---

# Phase 02 Plan 05: Widen the Tracer's Worktree Slice to the Full WT-01…WT-07 Lifecycle Summary

**`ensureWorktree()` now implements ARCHITECTURE.md §4's complete four-step idempotent algorithm (five convergent partial states, branch-collision suffixing), runs `.fleet.yml` setup commands under the worker's own starved environment before any spawn, and `archiveWorktree()` captures dirty work into a commit on the task branch before ever removing the worktree.**

## Performance

- **Duration:** ~55 min
- **Started:** 2026-07-26T14:00:00Z (approx)
- **Completed:** 2026-07-26T14:55:00Z (approx)
- **Tasks:** 3 (implemented and committed together — see Deviations)
- **Files modified:** 2 (1 rewritten, 1 new)

## Accomplishments

- `ensureWorktree()` replaced the tracer's clean-first-run-only implementation with the full D-19 algorithm: `git worktree prune` -> `git worktree list --porcelain` detection -> branch-name collision resolution (D-20, numeric suffix up to 100 attempts) -> stray on-diREDACTED_SECRET cleanup (contained to `worktreeRootFor()`'s root, `WorktreeError('worktree_path_outside_root')` otherwise) -> `add` (with or without `-b` depending on whether the branch already exists) -> lock-if-not-already-locked -> `.fleet.yml` setup commands. Converges from any of five partial states without throwing.
- `parseWorktreePorcelain()` extracted as a standalone, unit-testable-without-git parser for the porcelain format (`worktree`/`HEAD`/`branch`/`locked` blocks).
- `runSetupCommands()` reads `.fleet.yml`'s `setup` array live via `readFleetYml()` (never re-parsed, never snapshotted — Phase 1 D-17) and runs each command as `sh -c <cmd>` (`shell: false`, single argv element, never string-interpolated) inside the worktree under `buildWorkerEnv()`'s allowlisted environment. A non-zero exit or a timeout returns a structured failure; `ensureWorktree()` translates that into `WorktreeError('setup_command_failed')` carrying the command string and captured output, and never proceeds to lock+return a half-provisioned worktree past that point.
- `captureDirtyWork()` and the rewritten `archiveWorktree()` implement D-22/D-23: detect via `git status --porcelain`, capture into a commit (`fleet: uncommitted work captured at session end (task <id>)`, Fleet's injected `GIT_AUTHOR_*`/`GIT_COMMITTER_*` identity from `buildWorkerEnv()`) if dirty, unlock, then plain `git worktree remove` (never `--force`) — the branch ref is never deleted. Archival is idempotent: a second call on an already-removed worktree returns successfully.
- A worktree registered at the target path but on an unexpected branch (a stray, not one of the five acceptance-criteria states but named in ARCHITECTURE.md §4's algorithm text) is captured-then-removed via the same sequence as `archiveWorktree()`, never force-removed — the threat model's no-destructive-removal-without-capture prohibition applies to every code path in the module, not just the documented teardown.
- 22 new tests in `worktree-manager.test.ts` covering every `<behavior>` bullet across all three tasks; whole-suite `npm test` grew from 209 to 231 passing tests with zero regressions.

## Task Commits

Tasks 1-3 were implemented and verified together in a single commit (see Deviations for why):

1. **Tasks 1-3: Four-step ensureWorktree algorithm, .fleet.yml setup commands, dirty-capture teardown** - `4cf47fd` (feat)

**Plan metadata:** committed alongside this SUMMARY (worktree mode — STATE.md/ROADMAP.md excluded; orchestrator updates centrally)

## Files Created/Modified

- `src/runner/worktree-manager.ts` - Rewrote `ensureWorktree()`/`archiveWorktree()`; added `parseWorktreePorcelain()`, `runSetupCommands()`, `captureDirtyWork()`, `WorktreePorcelainEntry`, `RunSetupCommandsInput`, `SetupCommandsResult`, `CaptureDirtyWorkInput`; extended `WorktreeErrorCode` with `worktree_path_outside_root`, `branch_name_exhausted`, `setup_command_failed`, `worktree_dirty_capture_failed`, `worktree_remove_failed`
- `src/runner/worktree-manager.test.ts` - New file, 22 tests across `parseWorktreePorcelain`, `ensureWorktree` (states A-E, collision, locking idempotency, path-containment), `runSetupCommands`, and `archiveWorktree`

## Decisions Made

See `key-decisions` in frontmatter. Summary:
- Kept `ArchiveWorktreeInput`'s two-field shape unchanged by deriving `taskId` from `basename(worktreePath)`, avoiding any change to `scheduler/queue.ts` or `worktree-runner.integration.test.ts` (both outside this plan's `files_modified`).
- Added `setupTimeoutMs` to `EnsureWorktreeInput` as optional, so `worktree-runner.ts`'s existing call site keeps compiling with zero changes.
- State B's "already correctly registered" check accepts a numeric-suffixed branch name too, so a task that hit a collision once still recognizes itself as provisioned on a later idempotent call.
- The "registered but wrong branch" stray case reuses the capture-then-remove sequence rather than a force-remove, honoring the threat model's blanket prohibition.

## Deviations from Plan

### Process deviation (not a Rule 1-3 auto-fix)

**Tasks 1, 2, and 3 were implemented and committed together in one commit rather than three separate task commits.**
- **Reason:** All three tasks modify the exact same two files (`worktree-manager.ts`, `worktree-manager.test.ts`) and are functionally interdependent by the plan's own design — Task 2's `runSetupCommands()` is called from inside Task 1's `ensureWorktree()`, and Task 3's `captureDirtyWork()` is shared between Task 1's stray-registration cleanup path and Task 3's `archiveWorktree()`. Each task's acceptance criteria independently requires "`npm test` (whole `unit` project) exits 0," which is only true once the tasks are integrated together — splitting into three sequential commits would have required landing an intermediate state (e.g., `ensureWorktree()` calling a not-yet-existent `runSetupCommands()`) that fails that criterion until the next commit lands.
- **Verification:** `npm test` (231/231, up from the pre-plan baseline of 209/209), `npm run typecheck` (0 errors), `npm run lint` (0 errors), and both required greps (destructive-verb absence in `worktree-manager.ts`, worktree-config-mutation absence in `src/runner/`) all pass against the single combined commit.
- **Committed in:** `4cf47fd`

No Rule 1-3 auto-fixes were needed — the implementation matched the plan's `<action>` text directly, including the exact env-construction call, the `sh -c` argv shape, the 4096-character output truncation, and the capture-commit message format.

---

**Total deviations:** 1 (process/commit-granularity only — no code deviation from the plan).
**Impact on plan:** None on correctness or scope; purely a commit-history granularity trade-off, documented above.

## Known Stubs

None — every behavior in the plan's `<behavior>` lists is wired to a real implementation and covered by a passing test.

## Issues Encountered

- Two rounds of `npm run typecheck`/`npm run lint` failures during implementation, both fixed inline before the commit: a TypeScript narrowing gap where a boolean local variable didn't carry the `!== undefined` narrowing back to `targetEntry.branch` (fixed by binding the narrowed value to its own `const`), and three `no-useless-assignment` ESLint violations from a `let x = ''; try { x = ... } catch { x = ''; }` pattern (fixed by extracting `gitStatusPorcelainBestEffort()`/`gitStatusPorcelainOrThrow()` helpers, which also reduced duplication across three call sites — `simplify` skill guidance). Both are otherwise-invisible in the final diff; noted here only because they were caught and fixed before the single commit landed, not as separate deviations.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `ensureWorktree()`/`archiveWorktree()` are now the complete, crash-safe worktree lifecycle plan 02-06 (wall-clock-cap enforcement) and plan 02-09 (scheduler pause/resume/rate-limit/boot-time reconstruction) can build against without further changes to this module's public surface.
- `runSetupCommands()` is exported standalone and independently unit-tested — any later plan needing to re-run setup commands outside the `ensureWorktree()` flow (unlikely, but the symbol is available) does not need to duplicate this logic.
- The `worktree_remove_failed` code is not yet in `api/http/errors.ts`'s `CODE_TO_STATUS` map (this plan does not touch that file per the 02-04 restriction) — it currently falls through to a generic 500. Not a blocker: every other plan-02-05 code (`worktree_path_outside_root`, `branch_name_exhausted`, `setup_command_failed`, `worktree_dirty_capture_failed`) was already registered by plan 02-04's one-pass `errors.ts` completion.
- No blockers for sibling wave-3 plans (02-06, 02-07, 02-08) or downstream plan 02-09 — this plan touched only `src/runner/worktree-manager.ts` and its test file, per the wave's overlap-free file assignment.

## Self-Check: PASSED

Both files verified present on disk (`git show --stat HEAD`): `src/runner/worktree-manager.ts` (545 lines), `src/runner/worktree-manager.test.ts` (465 lines, new). Commit hash `4cf47fd` verified present in `git log --oneline`. `npm test` 231/231 green (21 files), `npm run typecheck` and `npm run lint` both clean as of the final commit.

---
*Phase: 02-execution-worktree-runner-billing-safety*
*Completed: 2026-07-26*

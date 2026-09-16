---
phase: 02-execution-worktree-runner-billing-safety
plan: 01
subsystem: infra
tags: [state-machine, billing-safety, env-allowlist, node-runtime, vitest]

# Dependency graph
requires:
  - phase: 01-foundation-registry-state-machine
    provides: TASK_STATES enum, TaskEvent union (including RATE_LIMITED), applyEvent() pure transition function, src/spikes/spawn-claude.ts allowlist spike, .nvmrc scaffold
provides:
  - "RATE_LIMITED transition edge on `running` (-> failed) and guarded edge on mid-run `needs_human` (-> failed)"
  - "src/runner/env.ts: single-source-of-truth worker-environment construction (CLAUDE_ENV_ALLOWLIST, buildAllowlistedEnv, FORCED_GIT_ENV, buildWorkerEnv)"
  - ".nvmrc pinning Node major version to 22 (verified already present from phase 01-01)"
affects: [02-02, 02-03, 02-04, 02-05, 02-09, worktree-manager, worktree-runner, scheduler]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Allowlist-forward env construction from a fresh object, never inherit-and-delete"
    - "Forced constants applied after an allowlist copy so no source value can win"
    - "Shape (subset) assertions instead of denylist assertions for security-critical output"

key-files:
  created:
    - src/runner/env.ts
    - src/runner/env.test.ts
  modified:
    - src/core/state-machine/transitions.ts
    - src/core/state-machine/transitions.test.ts
    - src/spikes/spawn-claude.ts

key-decisions:
  - "PD-01 (recorded in plan): RATE_LIMITED transitions running -> failed, never a backward edge into queued, to avoid forking the terminal-state teardown path and to avoid an automatic re-dispatch loop on an unconfirmed detector signal."
  - "buildWorkerEnv's four commit-identity variables are sourced only from caller-supplied overrides or module-level defaults (Fleet Agent / redacted@example.invalid), never from process.env or the target repository."

patterns-established:
  - "Pattern: worker-environment construction lives in src/runner/env.ts as the single definition site; any code needing CLAUDE_ENV_ALLOWLIST or buildAllowlistedEnv imports/re-exports from there rather than redefining it."

requirements-completed: [SAFE-04, BILL-01, BILL-02, BILL-06, BILL-07, SAFE-06]

coverage:
  - id: D1
    description: "applyEvent accepts RATE_LIMITED from running (-> failed) and from mid-run needs_human (-> failed), rejects it from push_failed-blocked needs_human and from every terminal state"
    requirement: "SAFE-04"
    verification:
      - kind: unit
        ref: "src/core/state-machine/transitions.test.ts#applyEvent — legal edges > running + RATE_LIMITED -> failed (PD-01)"
        status: pass
      - kind: unit
        ref: "src/core/state-machine/transitions.test.ts#applyEvent — needs_human guarded edges (D-08) > blockReason mid_run: RATE_LIMITED -> failed (PD-01)"
        status: pass
      - kind: unit
        ref: "src/core/state-machine/transitions.test.ts#applyEvent — needs_human guarded edges (D-08) > blockReason push_failed rejects RATE_LIMITED (PD-01: no live session to rate-limit)"
        status: pass
      - kind: unit
        ref: "src/core/state-machine/transitions.test.ts#applyEvent — terminal states (D-06) > every event type returns null from failed"
        status: pass
    human_judgment: false
  - id: D2
    description: "src/runner/env.ts is the single allowlist definition site; buildWorkerEnv() output is a shape-verified subset of the allowlist union forced-git-constants union identity keys, and excludes every credential/routing variable enumerated in PITFALLS.md Pitfall 1, including exact-key (never prefix) matching edge cases"
    requirement: "BILL-01, BILL-02, BILL-06, BILL-07, SAFE-06"
    verification:
      - kind: unit
        ref: "src/runner/env.test.ts#buildWorkerEnv (BILL-01, BILL-02, BILL-06, BILL-07, SAFE-06) — all 9 cases"
        status: pass
      - kind: unit
        ref: "src/spikes/spawn-claude.test.ts#buildAllowlistedEnv (T-1-ENVLEAK) — all 3 cases (re-export still exercised)"
        status: pass
      - kind: other
        ref: "grep -c \"export const CLAUDE_ENV_ALLOWLIST\" src/runner/env.ts src/spikes/spawn-claude.ts -> 1, 0"
        status: pass
    human_judgment: false
  - id: D3
    description: ".nvmrc pins the Node major version to 22 at the repository root"
    verification:
      - kind: other
        ref: "cat .nvmrc -> 22 (verified pre-existing from phase 01-01 commit da94f0a; no new commit needed)"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-07-24
status: complete
---

# Phase 02 Plan 01: Wave-0 Foundations Summary

**RATE_LIMITED state-machine edge landing in `failed`, `src/runner/env.ts` as the single worker-env construction site with forced git-starvation constants, and a pre-existing `.nvmrc` pin confirmed.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-07-24T00:35:00Z (approx)
- **Completed:** 2026-07-24T01:00:18Z
- **Tasks:** 3 (2 required new commits; Task 3 was already satisfied)
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments
- `applyEvent` now accepts `RATE_LIMITED` from `running` (-> `failed`) and from mid-run `needs_human` (-> `failed`), rejecting it from `push_failed`-blocked `needs_human` and every terminal state — unblocking plan 02-09's queue-pause logic (PD-01 rationale recorded in-source).
- `src/runner/env.ts` promoted as the single source of truth for worker-environment construction: `CLAUDE_ENV_ALLOWLIST`/`buildAllowlistedEnv` moved verbatim from the spike, `FORCED_GIT_ENV` added (five git-starvation constants forced after the allowlist copy), and `buildWorkerEnv()` composes both with four commit-identity variables sourced only from caller overrides or fixed defaults.
- `src/spikes/spawn-claude.ts` rewritten to re-export from `../runner/env.js` — confirmed exactly one `CLAUDE_ENV_ALLOWLIST` definition exists under `src/`.
- `.nvmrc` verified already present and correct (`22`) from an earlier phase-01 commit — no action needed.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the RATE_LIMITED transition edge to the `running` state** - `b7c2431` (feat)
2. **Task 2: Promote the worker-env module to src/runner/env.ts and add the BILL-06 shape test** - `694b148` (test, RED) + `e574a56` (feat, GREEN)
3. **Task 3: Pin the Node runtime to 22 via .nvmrc** - no commit needed; already satisfied by commit `da94f0a` (phase 01-01)

**Plan metadata:** committed with this SUMMARY (worktree mode — STATE.md/ROADMAP.md excluded; orchestrator updates centrally)

## Files Created/Modified
- `src/runner/env.ts` - Single-source-of-truth worker-env module: `CLAUDE_ENV_ALLOWLIST`, `buildAllowlistedEnv()`, `FORCED_GIT_ENV`, `WORKER_ENV_IDENTITY_KEYS`, `WorkerEnvInput`, `buildWorkerEnv()`
- `src/runner/env.test.ts` - Shape-assertion (subset) test suite covering every `<behavior>` case from the plan, including exact-key-vs-prefix, empty-vs-absent, forced-constant ordering, fresh-object-per-call, and identity injection
- `src/spikes/spawn-claude.ts` - Rewritten to re-export `CLAUDE_ENV_ALLOWLIST`/`buildAllowlistedEnv` from `../runner/env.js`; `spawnClaude()`/`claudeVersion()` unchanged
- `src/core/state-machine/transitions.ts` - Added `RATE_LIMITED` row to `running` (-> `failed`) and guarded `RATE_LIMITED` edge on `needs_human` (mid_run only); extended table doc comment with PD-01 rationale
- `src/core/state-machine/transitions.test.ts` - Added assertions for the new accepted/rejected `RATE_LIMITED` edges

## Decisions Made
- PD-01, PD-02, PD-03 were pre-recorded in the plan itself (not made during execution); no new architectural decisions were required during this plan's execution — all three tasks matched the plan's `<action>` blocks exactly.
- `.nvmrc` (Task 3) required no new work: verification against `git log --oneline -- .nvmrc` showed it was already committed with the exact required content (`22`) in phase 01-01's monorepo-scaffold commit. Documented here rather than silently produced as a no-op commit, per the plan's own acceptance criteria being satisfiable by inspection alone.

## Deviations from Plan

None - plan executed exactly as written. Task 3 required no file changes because its target state was already achieved by a prior phase's commit; this is a verification outcome, not a deviation, since the plan's acceptance criteria (file exists, content is `22`, `engines.node` unchanged) were all independently confirmed true.

**Environment note (not a deviation, not committed):** this worktree had no local `node_modules/` (git-ignored, not created by worktree provisioning). A symlink to the sibling main-repo `node_modules/` was created locally to run `vitest`/`tsc`/`eslint` for verification; this is a local filesystem artifact only, correctly excluded from git by the existing `.gitignore` entry, and was not committed.

## Issues Encountered
- `src/db/packaging.e2e.test.ts` fails in this sandbox (`spawnSync npm ENOENT`) because the sandboxed shell's `npm`/`node` PATH resolution is non-standard (see environment_note in the executor's instructions). This failure is unrelated to any file this plan touched and was excluded per the deviation rules' scope boundary (only auto-fix issues directly caused by the current task's changes). All other 168 unit tests pass; `npm run typecheck` and `eslint .` both exit clean.

## Next Phase Readiness
- `src/runner/env.ts` is ready for `worktree-runner.ts` (plan 02-05+) to consume `buildWorkerEnv()` for the `claude` spawn and `.fleet.yml` setup-command spawn.
- The `RATE_LIMITED` transition edge is ready for plan 02-09's scheduler queue-pause logic to write an accepted `events` row instead of an `accepted: 0` rejection.
- No blockers for subsequent Wave-0-dependent plans in this phase.

---
*Phase: 02-execution-worktree-runner-billing-safety*
*Completed: 2026-07-24*

## Self-Check: PASSED

All created files verified present on disk (`src/runner/env.ts`, `src/runner/env.test.ts`, this SUMMARY.md) and all recorded commit hashes (`b7c2431`, `694b148`, `e574a56`, `bbbed5d`) verified present in `git log --oneline --all`.

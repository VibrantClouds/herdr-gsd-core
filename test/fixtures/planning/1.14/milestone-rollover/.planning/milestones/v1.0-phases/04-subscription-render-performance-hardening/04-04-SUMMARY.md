---
phase: 04-subscription-render-performance-hardening
plan: "04"
subsystem: testing
tags: [karma, angular-esbuild, web-workers, angular.json, spike]

requires:
  - phase: 04-subscription-render-performance-hardening
    provides: "Phase 04 baseline test-suite counts (03-BASELINE.md / orchestrator-captured 448/419/29) used as the full-suite regression gate for this spike's builderMode change"
provides:
  - "Empirical, greppable verdict (`.planning/phases/04-subscription-render-performance-hardening/04-WORKER-SPIKE.md`) on whether a real module Worker instantiates and round-trips under this repo's headless Karma command"
  - "`builderMode: application` added to the `test` architect target in `angular.json`, matching the `build`/`serve` esbuild builder, proven safe against the full suite"
affects: [04-08, 04-09]

tech-stack:
  added: []
  patterns: ["Karma test builder now matches the production esbuild application builder (builderMode: application), so worker bundling behavior under test and under build/serve is the same code path"]

key-files:
  created:
    - .planning/phases/04-subscription-render-performance-hardening/04-WORKER-SPIKE.md
  modified:
    - angular.json

key-decisions:
  - "Kept the builderMode: application change on the test architect target because the scoped spike passed and the full suite showed zero new failures relative to the pre-phase baseline (448/419/29 before, 448/419/29 after spike removal, with the identical 29 failing test names)"
  - "Verdict recorded as real-worker-supported, builder_mode_changed: yes — 04-08/04-09 are not forced into the mock-only fallback but remain free to mock the Worker constructor where it simplifies a specific test"

requirements-completed: [PERF-03]

coverage:
  - id: D1
    description: "Empirical measurement of real module Worker instantiation under headless Karma, recorded in a greppable verdict file with a well-formed verdict: and builder_mode_changed: line"
    requirement: "PERF-03"
    verification:
      - kind: unit
        ref: "src/app/workers/spike-echo.worker.spec.ts (throwaway, deleted after measurement) — scoped ChromeHeadless run, before: 1 FAILED (SecurityError/build-error), after builderMode change: 1 SUCCESS"
        status: pass
      - kind: other
        ref: "grep -cE '^verdict: (real-worker-supported|mock-only)$' .planning/phases/04-subscription-render-performance-hardening/04-WORKER-SPIKE.md == 1; grep -cE '^builder_mode_changed: (yes|no)$' ... == 1"
        status: pass
    human_judgment: false
  - id: D2
    description: "angular.json builderMode change (if kept) proven safe: full suite shows zero new failures relative to the phase's recorded 448/419/29 baseline"
    requirement: "PERF-03"
    verification:
      - kind: unit
        ref: "CHROME_BIN=... pnpm exec ng test --no-watch --browsers=ChromeHeadless — with spike present: 449 total/420 SUCCESS/29 FAILED (29 names identical to baseline); after spike removal: 448 total/419 SUCCESS/29 FAILED (exact baseline shape)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Spike source files removed; workers/ directory left in place for 04-08; no tsconfig.worker.json or webWorkerTsConfig introduced; no lib-reference directive added"
    verification:
      - kind: other
        ref: "test ! -e src/app/workers/spike-echo.worker.ts && test ! -e src/app/workers/spike-echo.worker.spec.ts && ls tsconfig.worker.json (fails, confirms absent) && grep -c webWorkerTsConfig angular.json == 0"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-07-30
status: complete
---

# Phase 04 Plan 04: Worker Spike — Real Module Worker Under Headless Karma Summary

**Empirically proved a real module Worker bundles and round-trips under this repo's headless Karma command once `builderMode: "application"` is added to the `test` architect target — verdict `real-worker-supported`, kept the config change after a zero-new-failures full-suite gate.**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-07-30T23:33:43Z
- **Tasks:** 2 completed
- **Files modified:** 4 (2 created-then-deleted spike files, 1 verdict doc, 1 config file)

## Accomplishments

- Built a throwaway echo-worker spike (`spike-echo.worker.ts` + `.spec.ts`) that type-checks cleanly under the existing `tsconfig.json` with no lib-reference directive, no `tsconfig.worker.json`, and no `webWorkerTsConfig` entry.
- Measured the scoped spike under the **default** Karma builder (`builderMode` unset, defaults to `browser`/webpack): **FAILED** — `SecurityError: Failed to construct 'Worker'` because the bundler left the raw `file://` disk path in place instead of rewriting `new URL(...import.meta.url)` into a servable HTTP asset. This is exactly the bundler-mismatch failure mode D-14/Common Pitfall 1 predicted.
- Escalated per the plan's Branch B: added `"builderMode": "application"` to `projects.size-comparison-tool.architect.test.options`. Re-ran the scoped spike: **PASSED** — the worker was bundled as its own lazy chunk (`worker-2LIWGATX.js`), the same mechanism the esbuild `build`/`serve` targets already use.
- Ran the full suite as the mandatory hard gate before keeping the config change: 449 total / 420 SUCCESS / 29 FAILED with the spike spec present. The 29 failing test names were diffed line-by-line against the phase's recorded pre-phase baseline (448 total / 419 SUCCESS / 29 FAILED) and are **identical by full test name** — zero new failures introduced by the builder-mode switch.
- Kept the `angular.json` change, wrote the verdict file, deleted both spike source files (leaving `src/app/workers/` in place, empty, for 04-08), and re-confirmed `tsc --noEmit` (0 errors) and the full suite (exact baseline shape: 448/419/29, same 29 names) after cleanup.

## Task Commits

Each task was committed atomically:

1. **Task 1: Build the throwaway echo-worker spike and measure it under headless Karma** - `7c42197` (feat)
2. **Task 2: Escalate or accept, record the verdict, and remove the spike sources** - `480da48` (feat)

_No plan-metadata commit in this worktree — the orchestrator commits STATE.md/ROADMAP.md centrally after all wave agents complete; this SUMMARY.md is committed as part of the worktree-mode git_commit_metadata step._

## Files Created/Modified

- `.planning/phases/04-subscription-render-performance-hardening/04-WORKER-SPIKE.md` - Durable, greppable verdict (`verdict: real-worker-supported`, `builder_mode_changed: yes`) plus full command transcript and downstream guidance for 04-08/04-09.
- `angular.json` - Added `"builderMode": "application"` to `projects.size-comparison-tool.architect.test.options`, aligning the Karma test bundler with the `build`/`serve` esbuild `application` builder. Kept permanently — this is not a spike-only change; it is validated against the full suite and is the correct long-term config since it removes a bundler-mismatch class of bug for any future worker code.
- `src/app/workers/spike-echo.worker.ts`, `src/app/workers/spike-echo.worker.spec.ts` - Created in Task 1, deleted in Task 2 (throwaway measurement artifacts only). `src/app/workers/` directory left in place, empty, for 04-08 to populate.

## Decisions Made

- **Kept the `builderMode: application` config change** rather than reverting, because the plan's pre-decided branch logic ("Full suite green → keep the angular.json change") was satisfied: the 29 failures present with the change are the exact same 29 named tests as the phase's recorded pre-phase baseline, with zero new failures. This is a permanent, validated change to the repo's shared build config, not scoped only to this spike.
- **Verdict is `real-worker-supported`, not `mock-only`** — the `mock-only` degradation path in this plan's `<objective>` does not apply. 04-08 and 04-09 may write a real-worker round-trip spec using the proven pattern, though they remain free to mock the `Worker` constructor where that better suits a specific test's design.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worked around a worktree-local `node_modules` PATH resolution gap for `tsc`/`pnpm run typecheck`**
- **Found during:** Task 1, first `pnpm run typecheck` invocation
- **Issue:** This worktree has no `node_modules` of its own (it lives at the main repo root, one level up from `.claude/worktrees/<agent-id>/`). `pnpm exec ng test` resolves correctly via ancestor lookup, but `pnpm run typecheck` (and `pnpm exec tsc`) failed with `sh: line 1: tsc: command not found` / `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL` — a harness/environment PATH-resolution gap, not a type error.
- **Fix:** Invoked the `tsc` binary directly at its resolved path (`/home/user/Development/SizeComparisonSite/node_modules/.bin/tsc --noEmit`) for every typecheck verification in both tasks. Result was identical either way: 0 errors, exit 0.
- **Files modified:** None (verification-only workaround, no source change).
- **Verification:** Direct `tsc --noEmit` invocation returned exit 0 with no diagnostics, both with the spike worker present (Task 1) and after its removal (Task 2).
- **Committed in:** N/A (verification step, not a code change; documented here and in 04-WORKER-SPIKE.md for auditability).

---

**Total deviations:** 1 auto-fixed (1 blocking/environment workaround)
**Impact on plan:** No scope creep — the deviation is a test-harness environment quirk specific to this worktree layout, not a defect in the spike code or the `angular.json` change. Both typecheck verifications the plan requires (with spike present, after spike removal) were still performed and passed.

## Issues Encountered

None beyond the documented deviation above. The core measurement (scoped Karma spike, escalation, full-suite gate) proceeded exactly per plan with no unexpected blockers.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 04-08 (worker entry point + `offscreen-image-processor.ts`) may write a real-worker round-trip spec against `image-processing.worker.ts` using the exact `new Worker(new URL(...), { type: 'module' })` + `builderMode: application` pattern validated here.
- 04-09 (parity test) is unaffected either way — its geometry-fidelity contract is proven by importing `offscreen-image-processor.ts` directly, no `Worker` needed — but may now also exercise a real `Worker` at the `ImageProcessingService` boundary if useful for cancellation/termination tests.
- No blockers. `angular.json`'s `builderMode: application` change is a shared, permanent config change other Phase 04 plans (and future phases) inherit — already proven safe against the full suite in this plan.

## Self-Check: PASSED

- FOUND: `.planning/phases/04-subscription-render-performance-hardening/04-WORKER-SPIKE.md`
- FOUND: `.planning/phases/04-subscription-render-performance-hardening/04-04-SUMMARY.md`
- CONFIRMED ABSENT: `src/app/workers/spike-echo.worker.ts`
- CONFIRMED ABSENT: `src/app/workers/spike-echo.worker.spec.ts`
- FOUND commit: `7c42197` (Task 1)
- FOUND commit: `480da48` (Task 2)
- FOUND commit: `96584e3` (this summary)

---
*Phase: 04-subscription-render-performance-hardening*
*Completed: 2026-07-30*

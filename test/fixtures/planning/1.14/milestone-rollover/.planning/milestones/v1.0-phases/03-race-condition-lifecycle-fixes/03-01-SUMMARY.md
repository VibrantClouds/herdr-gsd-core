---
phase: 03-race-condition-lifecycle-fixes
plan: 01
subsystem: testing
tags: [angular, karma, jasmine, category-normalization, test-baseline]

# Dependency graph
requires:
  - phase: 02-service-architecture-serialization-safety
    provides: "Running full-suite baseline of 50 failures / 341 success / 391 total (Phase 2 close-out), which this plan re-confirms as the Phase 3 starting point"
provides:
  - "Phase 3 test-execution baseline (03-BASELINE.md) with the sorted 50-name failing-spec list and a subset-comparison gate definition"
  - "normalizeCategory(raw) — the single shared, idempotent, Title-Case category normalization helper that plan 03-06 wires into every category read/write boundary"
affects: [03-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure-module utility shape (no @angular/core import, plain describe/it spec) mirrored from adult-content-filter.ts for a second utils/ file"

key-files:
  created:
    - .planning/phases/03-race-condition-lifecycle-fixes/03-BASELINE.md
    - src/app/utils/category-normalization.ts
    - src/app/utils/category-normalization.spec.ts
  modified: []

key-decisions:
  - "Phase 3 gate is defined as a subset comparison (later failing-spec-name set ⊆ this baseline's 50-name set), not zero-failures or exact-count-match, because 50 pre-existing failures are inherited from Phase 1/Phase 2 and are out of this phase's scope (owned by Phase 5/TEST)"
  - "compare-modal.component.spec.ts's isolated-run count (30/0/30, all HttpClient NullInjectorError) is recorded as a documented artifact distinct from its ~29-entry full-suite count — the baseline explicitly instructs later plans to diff against the full-suite 50-name list, never the isolated-run count, to avoid false-positive regression signals"
  - "normalizeCategory Title-Cases every whitespace-separated word (not first-char-only) so 'HATS' and 'Hats' converge to the same canonical string — the first-char-only behavior at image-metadata.service.ts:72 is the exact bug RACE-04 exists to fix, though this plan does not touch that call site (03-06's job)"

requirements-completed: [RACE-04]

coverage:
  - id: D1
    description: "Phase-3 test-execution baseline recorded: full-suite 391/341/50 (name-identical to Phase 2 close-out), per-spec baseline for the six files this phase touches, tsc/build compile baseline, and an explicit subset-comparison gate definition"
    requirement: RACE-04
    verification:
      - kind: unit
        ref: "test -f .planning/phases/03-race-condition-lifecycle-fixes/03-BASELINE.md && grep -c 'Gate definition for Phase 3' .planning/phases/03-race-condition-lifecycle-fixes/03-BASELINE.md -> 1"
        status: pass
    human_judgment: false
  - id: D2
    description: "normalizeCategory(raw) exported as a pure, idempotent, Title-Case category normalizer with no Angular dependency, unit-tested over the full example set, idempotence property, and the eight default category names"
    requirement: RACE-04
    verification:
      - kind: unit
        ref: "category-normalization.spec.ts — 35 SUCCESS, 0 FAILED"
        status: pass
      - kind: unit
        ref: "grep -c 'export function normalizeCategory' category-normalization.ts -> 1; grep -c '@angular/core' category-normalization.ts -> 0; npx tsc --noEmit -> exit 0"
        status: pass
    human_judgment: false

duration: 22min
completed: 2026-07-30
status: complete
---

# Phase 03 Plan 01: Baseline & Shared Category Normalization Summary

**Recorded the Phase 3 test-execution baseline (391/341/50, subset-comparison gate) and shipped `normalizeCategory` — a single, idempotent, Title-Case category helper with zero Angular dependency that plan 03-06 will wire into every category boundary.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-07-30T18:57:00Z
- **Completed:** 2026-07-30T19:19:24Z
- **Tasks:** 2 completed
- **Files modified:** 3 (all new files)

## Accomplishments

- `03-BASELINE.md` captures the exact Phase 2 close-out counts (391 total / 341 pass / 50 fail) with zero delta, the sorted 50-name failing-spec list, and a "Gate definition for Phase 3" section that explicitly defines the gate as a subset comparison rather than "zero failures"
- Per-spec isolation baselines recorded for all six files this phase will touch, including the documented `compare-modal.component.spec.ts` isolation-vs-full-suite discrepancy (30/0/30 in isolation, driven by a pre-existing TestBed `HttpClient` DI gap) so later plans know to diff against the full-suite list, not the isolated count
- `npx tsc --noEmit` and `pnpm run build` both recorded at exit 0, matching Phase 2's close-out figures (including the pre-existing 25.94 kB bundle-budget warning)
- `normalizeCategory(raw: string | undefined | null): string | undefined` created as a pure module function (no `@angular/core` import), Title-Casing each whitespace-separated word after trimming/collapsing whitespace, with `undefined`/`null`/blank all normalizing to `undefined`
- 35 spec assertions cover the seven canonical example pairs, undefined/null/blank handling, the `'HATS'`/`'hats'` convergence case, internal whitespace collapsing, an idempotence property over 14 inputs, and all eight default category names remaining unchanged

## Task Commits

1. **Task 1: Record the phase-3 test-execution baseline** - `73fb9ee` (docs)
2. **Task 2: Create the shared normalizeCategory helper and its spec** - `e59cba9` (feat)

_No TDD tasks in this plan; both were `type="auto"`._

## Files Created/Modified

- `.planning/phases/03-race-condition-lifecycle-fixes/03-BASELINE.md` - Phase 3 test-execution baseline: environment, full-suite counts + 50-name failing-spec list, per-spec isolation baselines, compile baseline, gate definition
- `src/app/utils/category-normalization.ts` - `normalizeCategory()`, the single shared category-name normalization helper (pure, idempotent, Title-Case, no Angular DI)
- `src/app/utils/category-normalization.spec.ts` - 35-assertion spec covering canonical examples, null handling, case convergence, whitespace collapsing, idempotence, and default-category preservation

## Decisions Made

- Defined the Phase 3 gate as a subset comparison of failing-spec names rather than an exact-count match, so a later plan's fix that incidentally resolves one of the 50 pre-existing failures does not trip a false gate violation.
- Documented (rather than "fixed") the `compare-modal.component.spec.ts` isolated-run discrepancy: running it alone triggers `NullInjectorError: No provider for HttpClient` on all 30 specs (vs. ~29 failing names when co-loaded with the rest of the suite), a pre-existing TestBed module-resolution artifact unrelated to this plan's scope. The baseline instructs future plans to always diff against the full-suite 50-name list.
- Title-Cased every word (not first-char-only) in `normalizeCategory`, matching the plan's explicit transform contract, since first-char-only is the documented root cause of the `'HATS'`/`'Hats'` mismatch RACE-04 targets.

## Deviations from Plan

None - plan executed exactly as written. Both tasks' acceptance criteria were met on the first run with no auto-fixes required.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `03-BASELINE.md` is now the regression-attribution authority for every later plan in this phase; any full-suite failing name not in its 50-name list is a genuine regression that must be fixed before the phase closes.
- `normalizeCategory` is ready for plan 03-06 to import from `../utils/category-normalization` with no further design decisions — signature, transform contract, and idempotence are locked and tested.
- No file under `src/app/services/` or `src/app/components/` was touched by this plan (confirmed via `git status --short` before each commit) — both tasks stayed strictly within their declared file scope.

## Self-Check: PASSED

- `.planning/phases/03-race-condition-lifecycle-fixes/03-BASELINE.md` confirmed present on disk.
- `src/app/utils/category-normalization.ts` confirmed present on disk.
- `src/app/utils/category-normalization.spec.ts` confirmed present on disk.
- Commit `73fb9ee` confirmed present via `git log --oneline`.
- Commit `e59cba9` confirmed present via `git log --oneline`.

---
*Phase: 03-race-condition-lifecycle-fixes*
*Completed: 2026-07-30*

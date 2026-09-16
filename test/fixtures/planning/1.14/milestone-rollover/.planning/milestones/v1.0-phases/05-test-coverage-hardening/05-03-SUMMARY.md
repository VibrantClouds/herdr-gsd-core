---
phase: 05-test-coverage-hardening
plan: 03
subsystem: testing
tags: [angular, karma, jasmine, scaling, characterization-test]

# Dependency graph
requires:
  - phase: 05-test-coverage-hardening
    provides: "D-14 ordering constraint — this spec must land before the disputed positioning/scaling failure rows are adjudicated"
provides:
  - "src/app/services/scaling.service.spec.ts — first spec for ScalingService, characterizing calculateImageDimensions, calculateMeasurementLineLength, transformAttachmentPoint, calculateOverlayScale, and the scaleState$ observable"
affects: ["05-09 (adjudicates geometry/scale failure rows against this spec)", "05-12 (attachment-preview.onCanvasClick click-tests depend on calculateImageDimensions math being pinned)"]

# Actuals (#2632)
actuals:
  tokens: 2820
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns: ["Pure-math service characterization spec with minimal TestBed wrapper (providers-only, no component fixture) — matches src/app/utils/coordinate-transform.spec.ts's no-DI structure, adapted for an @Injectable providedIn:'root' service"]

key-files:
  created: [src/app/services/scaling.service.spec.ts]
  modified: []

key-decisions:
  - "Followed the plan's exact worked-example arithmetic for the measurement-line branch (600 * (24/rulerPixelLength)) rather than re-deriving independently, keeping the spec's numbers traceable to the skill doc's example"
  - "Used exact integer expectations (toBe) everywhere except the measurement-line-ratio case, where toBeCloseTo(…, 5) is used because rulerPixelLength is an irrational sqrt — this is the only case where floating-point tolerance is warranted"
  - "Did not modify scaling.service.ts anywhere — every case asserts the code's current observed output, including the zero-length-line guard, matching the plan's characterization-not-correction mandate"

patterns-established:
  - "describe-per-method structure with the expected value derived arithmetically in either the test title or an inline comment, so a future reader can see where each expectation number comes from without re-running the math"

requirements-completed: [TEST-02]

coverage:
  - id: D1
    description: "ScalingService.calculateImageDimensions is characterized: base formula, aspect-ratio-derived width, uniform scale multiplication, measurement-line effective-height branch, the zero-length-line divide-by-zero guard, and the originalDimensions-omitted no-fire case"
    requirement: "TEST-02"
    verification:
      - kind: unit
        ref: "src/app/services/scaling.service.spec.ts#calculateImageDimensions"
        status: pass
    human_judgment: false
  - id: D2
    description: "ScalingService.calculateMeasurementLineLength is characterized: 3-4-5 triangle exact distance, zero-length line, and negative-delta (end smaller than start) case"
    requirement: "TEST-02"
    verification:
      - kind: unit
        ref: "src/app/services/scaling.service.spec.ts#calculateMeasurementLineLength"
        status: pass
    human_judgment: false
  - id: D3
    description: "ScalingService.transformAttachmentPoint is characterized: independent per-axis scaling ratios, origin invariant ({0,0} stays at origin), and exact bottom-right corner mapping"
    requirement: "TEST-02"
    verification:
      - kind: unit
        ref: "src/app/services/scaling.service.spec.ts#transformAttachmentPoint"
        status: pass
    human_judgment: false
  - id: D4
    description: "ScalingService.calculateOverlayScale is characterized for both settings of scaleRelativeToParent, including a case proving different parentScale values are ignored (and yield identical results) when the flag is false"
    requirement: "TEST-02"
    verification:
      - kind: unit
        ref: "src/app/services/scaling.service.spec.ts#calculateOverlayScale"
        status: pass
    human_judgment: false
  - id: D5
    description: "ScalingService.scaleState$ is characterized: initial emission values, relativeScale after left/right updates, clamping at both bounds (0.1 and 10), and distinctUntilChanged behavior (repeated identical value produces one emission) — all subscriptions unsubscribed before spec end"
    requirement: "TEST-02"
    verification:
      - kind: unit
        ref: "src/app/services/scaling.service.spec.ts#scaleState$"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-08-01
status: complete
---

# Phase 5 Plan 03: ScalingService Characterization Spec Summary

**First spec for `ScalingService` (142 lines, previously untested) — pins the pixel/height math, measurement-line branch, overlay scale composition, and `scaleState$` clamping/distinct-until-changed behavior with 23 exact-value assertions.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 2 completed
- **Files modified:** 1 (new file)

## Accomplishments

- Created `src/app/services/scaling.service.spec.ts` characterizing all five public methods of `ScalingService` plus its `scaleState$` observable — the file had zero prior test coverage despite being the pixel/height math every size comparison in the app depends on (D-14).
- Pinned both edge branches of the measurement-line divide-by-zero guard: the zero-length-line case (guard holds, no `Infinity`/`NaN`) and the `originalDimensions`-omitted case (branch does not fire at all).
- Pinned the `calculateOverlayScale` `scaleRelativeToParent` branch with a case that proves changing `parentScale` while the flag is `false` produces an identical result — the sharpest possible assertion of that branch.
- Pinned `scaleState$` clamping at both bounds (0.1 and 10) and its `distinctUntilChanged` comparator (only `leftScale`/`rightScale` drive emissions) — with every test subscription unsubscribed before the spec ends, avoiding the cross-spec leakage hazard called out in the plan's threat model (T-05-03-02).
- Verified the full suite's failing count is unchanged at 29 (matches the D-01-documented baseline) after adding 35 new specs — proving no cross-spec leakage was introduced.

## Task Commits

Each task was committed atomically:

1. **Task 1: Characterize the dimension and coordinate math** - `7fffddb` (test)
2. **Task 2: Characterize overlay scale composition and the scaleState$ stream** - `279d0d6` (test)

**Plan metadata:** committed separately per worktree protocol (this SUMMARY + no STATE.md/ROADMAP.md changes — orchestrator owns those after wave merge)

## Files Created/Modified

- `src/app/services/scaling.service.spec.ts` - New characterization spec (23 test cases across 5 `describe` blocks: `calculateImageDimensions`, `calculateMeasurementLineLength`, `transformAttachmentPoint`, `calculateOverlayScale`, `scaleState$`)

## Decisions Made

- Used the plan's exact worked-example arithmetic for the measurement-line effective-height case (`600 * (24 / rulerPixelLength)`) so the expected value is traceable to `.claude/skills/scaling-system/SKILL.md`'s documented example, rather than re-deriving an equivalent but differently-phrased calculation.
- Used `toBeCloseTo(…, 5)` only for the one case where the expected value involves an irrational `sqrt` (the measurement-line ratio case); every other assertion uses exact `toBe` since the plan's chosen inputs (3-4-5 triangles, clean-dividing overlay/base ratios) were deliberately designed to produce exact values.
- Left `scaling.service.ts` completely untouched, including the zero-length-line guard that the plan's threat model (T-05-03-01) flags as worth pinning explicitly — this is a pure characterization spec per D-14/D-02, not a correction.

## Deviations from Plan

None — plan executed exactly as written. Both tasks' acceptance criteria were met verbatim: the `describe` block names match, the zero-length-line and no-`originalDimensions` measurement-line cases are present, the `{x:0,y:0}` origin case is present, the literal `10` is asserted against `basePixelsPerUnit`-derived arithmetic, the `scaleRelativeToParent`-false parentScale-invariance case is present, and the full-suite failing count (29) did not increase relative to the D-01-documented baseline.

Note: `.planning/phases/05-test-coverage-hardening/05-TRIAGE.md` (the Wave 0 artifact this plan's acceptance criteria reference for the "failing count did not increase" comparison) did not exist on disk at execution time — this plan does not `depends_on` it per its own frontmatter (`depends_on: []`), so the comparison was instead made directly against the fresh `pnpm test` run's failure count (29), which matches the number D-01 in `05-CONTEXT.md` independently documents as the current baseline (29 failing out of 533/556 specs). No discrepancy was found; this is noted for the record rather than as a deviation requiring action.

## Issues Encountered

`pnpm run lint` (`tsc --noEmit`) failed in this worktree with `tsc: command not found` — the worktree at `.claude/worktrees/agent-a5dda664b4f31c7ff` has no local `node_modules` (Node module resolution for `ng test`/`ng version` walks up to the main checkout's `node_modules`, which works for package resolution, but pnpm's `run`/`exec` bin-script dispatch does not find `tsc` this way). Verified type-correctness instead by running the main checkout's `node_modules/.bin/tsc --noEmit -p tsconfig.spec.json` directly against this worktree's `tsconfig.spec.json` — zero errors, zero output. This is an environment/worktree-tooling gap, not a code issue; `ng test`'s build step (which also runs the TypeScript compiler) succeeded cleanly for the same files.

## Requirements Tracking Note

This plan's frontmatter tags `requirements: [TEST-02]`, but TEST-02 is shared across eight plans in this phase (01, 03, 06, 07, 08, 09, 12, 13) — its literal text ("Refactored `upload-modal` and `attachment-preview` have specs exercising their core logic paths") is not what this plan delivers; `scaling.service.ts` was folded into TEST-02's requirement slot per D-14 ("scope beyond the named requirements"). Marking the top-level `- [ ] **TEST-02**` checkbox complete after only this one contributing plan would misrepresent REQUIREMENTS.md while the other seven TEST-02 plans are still outstanding, so this plan deliberately did **not** run `requirements mark-complete TEST-02`. The checkbox should flip only once all TEST-02-tagged plans in this phase have landed — leaving that call to whichever plan closes out the phase, or to the orchestrator's own reconciliation pass.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `05-09` can now adjudicate the geometry/scale failure rows (`$.y` container positioning, the `translate(...)` mismatch, `scaleRelativeToParent` disputes) against this spec's passing, explicit characterization of what `ScalingService` actually computes today, rather than by reading 142 lines of math and forming an opinion.
- `05-12`'s planned click-coordinate tests for `attachment-preview.onCanvasClick` can rely on `calculateImageDimensions`'s math being pinned, since that function is what converts click coordinates back to original image space.
- No blockers. Production `scaling.service.ts` is byte-identical to its pre-plan state (`git diff --exit-code` confirmed after both tasks).

---
*Phase: 05-test-coverage-hardening*
*Completed: 2026-08-01*

## Self-Check: PASSED

- FOUND: `src/app/services/scaling.service.spec.ts`
- FOUND: `.planning/phases/05-test-coverage-hardening/05-03-SUMMARY.md`
- FOUND: commit `7fffddb` (Task 1)
- FOUND: commit `279d0d6` (Task 2)
- FOUND: commit `2e58681` (SUMMARY)

---
phase: 03-race-condition-lifecycle-fixes
plan: 05
subsystem: ui
tags: [angular, resize-observer, race-condition, compare-modal]

# Dependency graph
requires:
  - phase: 01-component-decomposition
    provides: compare-modal.component.ts as the current shape this plan modifies
provides:
  - "compare-modal's default-position calculation derived from an observed #comparisonCanvas ResizeObserver, replacing the 100ms setTimeout layout guess"
  - "mark-pending semantics (pendingDefaultPositionsRecalc) so a recalculation requested before canvas dimensions are known is deferred and honored, never dropped"
affects: [03-07 (applyDefaultOverlays setTimeout removal, same file), 03-08 (phase close-out reconciliation)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cached-dimension ResizeObserver + mark-pending flag: observer callback caches dimensions and drains a pending flag if one is set, decoupling 'when dimensions become known' from 'when a recalculation was requested'"
    - "syncCanvasObserver() re-attach-on-identity-change pattern for @ViewChild elements gated behind @if, driven from ngAfterViewChecked"

key-files:
  created: []
  modified:
    - src/app/components/compare-modal/compare-modal.component.ts
    - src/app/components/compare-modal/compare-modal.component.spec.ts

key-decisions:
  - "Added provideHttpClient()/provideHttpClientTesting() to the spec's TestBed (Rule 3, blocking) — every spec in the file was failing with NullInjectorError before this fix, unrelated to RACE-02 but blocking verification of this plan's acceptance criteria"
  - "Left the 9 pre-existing On Top Toggle / Horizontal Flip DOM-selector-drift failures untouched and logged to deferred-items.md — they query CSS classes (.on-top-control, .flip-button) that no longer exist in the current template, unrelated to canvas dimension timing"

patterns-established:
  - "Cached-dimension ResizeObserver + mark-pending flag for DOM-measurement races"

requirements-completed: [RACE-02]

coverage:
  - id: D1
    description: "calculateDefaultPositions() reads cached canvas dimensions and runs synchronously instead of via setTimeout(100)"
    requirement: "RACE-02"
    verification:
      - kind: unit
        ref: "src/app/components/compare-modal/compare-modal.component.spec.ts#Default Positions — layout-driven computes synchronously when dimensions are already known"
        status: pass
    human_judgment: false
  - id: D2
    description: "A recalculation requested before canvas dimensions are observed is deferred (never dropped) and runs once real dimensions arrive"
    requirement: "RACE-02"
    verification:
      - kind: unit
        ref: "src/app/components/compare-modal/compare-modal.component.spec.ts#Default Positions — layout-driven defers the calculation when no canvas dimensions have been observed"
        status: pass
      - kind: unit
        ref: "src/app/components/compare-modal/compare-modal.component.spec.ts#Default Positions — layout-driven runs the deferred calculation once dimensions arrive"
        status: pass
    human_judgment: false
  - id: D3
    description: "Feeding canvas dimensions alone (no pending request) does not itself trigger a recalculation — existing triggers (panel-state subscription, comparisonCenter observer) remain the only drivers"
    requirement: "RACE-02"
    verification:
      - kind: unit
        ref: "src/app/components/compare-modal/compare-modal.component.spec.ts#Default Positions — layout-driven does not recalculate on a resize when nothing is pending"
        status: pass
    human_judgment: false
  - id: D4
    description: "POSITION_BUFFER=40 and the existing 'Image Dimensions with Buffer' image-cutoff regression specs are untouched and still pass"
    verification:
      - kind: unit
        ref: "src/app/components/compare-modal/compare-modal.component.spec.ts#Image Dimensions with Buffer (3 specs)"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-07-30
status: complete
---

# Phase 3 Plan 05: Cached-Dimension ResizeObserver for compare-modal Default Positions Summary

**Replaced compare-modal's `setTimeout(100)` layout guess with a dedicated `#comparisonCanvas` ResizeObserver, cached dimensions, and a mark-pending flag so an early recalculation request is deferred rather than silently dropped.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-07-30T19:07:56Z
- **Completed:** 2026-07-30T19:26:17Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- `calculateDefaultPositions()` is now synchronous and reads `canvasDimensions` (cached by a new `canvasResizeObserver`) instead of measuring `comparisonCanvas.nativeElement.clientWidth/Height` inside a 100ms timer
- Added `pendingDefaultPositionsRecalc` mark-pending flag: a request made before the canvas has real dimensions sets the flag and returns; `onCanvasResize()` drains it and runs the deferred calculation exactly once real dimensions arrive
- Added `syncCanvasObserver()`, driven from `ngAfterViewChecked`, to re-attach the observer whenever `#comparisonCanvas`'s element identity changes (it lives inside an `@if` on both models being selected, so it doesn't exist at `ngAfterViewInit` time and is destroyed/recreated on model clear+reselect)
- Existing recalculation triggers (panel-state subscription, `comparisonCenter` observer) and the `POSITION_BUFFER = 40` buffer math are byte-identical to before — no behavior change to those paths
- Added 4 new specs proving the mark-pending/synchronous-recalc behavior; fixed a pre-existing TestBed DI gap that was failing all 30 specs in the file

## Task Commits

1. **Task 1: Observe #comparisonCanvas, cache its dimensions, and make calculateDefaultPositions synchronous with mark-pending** - `47af8fc` (feat)
2. **Task 2: Add mark-pending and synchronous-recalc tests to compare-modal.component.spec.ts** - `a35f7b0` (test)

**Plan metadata:** (this commit)

## Files Created/Modified
- `src/app/components/compare-modal/compare-modal.component.ts` - New `canvasDimensions`/`canvasResizeObserver`/`observedCanvasEl`/`pendingDefaultPositionsRecalc` fields, `onCanvasResize`/`syncCanvasObserver`/`runDefaultPositionsCalc` methods, synchronous `calculateDefaultPositions()`, `ngAfterViewChecked` hook, `ngOnDestroy` cleanup for the new observer
- `src/app/components/compare-modal/compare-modal.component.spec.ts` - `provideHttpClient()`/`provideHttpClientTesting()` TestBed providers; new `Default Positions — layout-driven` describe block (4 specs)

## Decisions Made
- Kept `this.comparisonCanvas?.nativeElement` (optional chaining) in `syncCanvasObserver()` rather than a non-null assertion, matching the existing usage at the `onDragStart` call site in the same file — a plan acceptance-criteria grep pattern (`comparisonCanvas.nativeElement`, single-char wildcard) technically doesn't match the two-character `?.` sequence, but this is a grep-pattern artifact, not a functional gap; the primary `<verify>` command (tsc + setTimeout count) and the full test suite both confirm correctness.
- Extracted the observer's dimension-caching logic into a named `onCanvasResize` method exactly as directed, so specs can drive the deferred path deterministically without depending on the Karma `ResizeObserver` stub firing (its `observe()` is a no-op per `src/test-setup.ts`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `provideHttpClient()`/`provideHttpClientTesting()` to compare-modal's TestBed**
- **Found during:** Task 2 (initial spec run before adding new tests)
- **Issue:** All 30 pre-existing specs in `compare-modal.component.spec.ts` failed with `NullInjectorError: No provider for HttpClient!` — `AttachmentSidebarComponent` (imported into `CompareModalComponent`'s template) transitively depends on `ImageMetadataService`, which requires `HttpClient`. This blocked verifying both Task 1's "existing triggers unchanged" acceptance criteria and Task 2's new tests.
- **Fix:** Added `provideHttpClient()` and `provideHttpClientTesting()` to the `TestBed.configureTestingModule` providers array, matching the established pattern already used in `attachment-sidebar.component.spec.ts`.
- **Files modified:** `src/app/components/compare-modal/compare-modal.component.spec.ts`
- **Verification:** Spec run went from 30 FAILED (DI error) to 9 FAILED (unrelated pre-existing template-selector-drift failures, see below) + 25 SUCCESS.
- **Committed in:** `a35f7b0` (Task 2 commit)

**2. [Scope boundary — logged, not fixed] 9 pre-existing `compare-modal.component.spec.ts` failures deferred**
- **Found during:** Task 2 verification run (after the HttpClient fix above)
- **Issue:** `On Top Toggle` (4 specs) and `Horizontal Flip` (5 specs) query CSS classes (`.on-top-control`, `.slide-toggle`, `.label-left`, `.label-right`, `.flip-button`, `.flip-button.left-flip`, `.flip-button.right-flip`) that do not exist anywhere in the current `compare-modal.component.html` template (which uses `.on-top-chip`/`.reset-chip` and no flip-button markup at all). This is unrelated to RACE-02 and predates this phase — `.planning/phases/01-component-decomposition/01-BASELINE.md`'s Phase 1 close-out capture already records all 30 `CompareModalComponent` specs (including these 9) as failing.
- **Fix:** Not fixed — out of this plan's scope per the Scope Boundary rule (fixing would mean either restoring dead markup or rewriting spec assertions, neither of which relates to the canvas-dimension timing fix this plan delivers).
- **Files modified:** None — logged instead to `.planning/phases/03-race-condition-lifecycle-fixes/deferred-items.md`.
- **Verification:** Confirmed via full-suite run (`395 total, 29 FAILED, 366 SUCCESS`) that these 9 plus 20 other pre-existing failures elsewhere in the codebase are unchanged in name/count before and after this plan's changes — no regressions introduced.
- **Committed in:** `a35f7b0` (deferred-items.md committed alongside Task 2's spec changes)

---

**Total deviations:** 2 (1 auto-fixed blocking issue, 1 logged-and-deferred scope-boundary item)
**Impact on plan:** The HttpClient fix was necessary to verify this plan's acceptance criteria at all — without it, no spec in the file could run past component construction. The deferred item is genuinely out of scope (unrelated DOM selectors) and does not affect RACE-02's correctness.

## Issues Encountered
- The plan's Task 2 acceptance criterion `CHROME_BIN=<path> pnpm exec ng test ... reports 0 FAILED` is not literally achievable without also fixing the unrelated pre-existing template-selector-drift failures (see Deviation 2). The plan's own D-09 requirement — the `Image Dimensions with Buffer` specs must keep passing — is met (all 3 pass), and no new failures were introduced anywhere in the suite (verified via full-suite run against the pre-existing 01-BASELINE.md failure catalogue). `03-BASELINE.md` (referenced by several acceptance criteria in this plan) does not exist in this worktree — it is produced by plan 03-01, which runs in a parallel wave and had not yet merged when this plan executed.
- A minor grep-pattern note: the plan's acceptance criterion `grep -c 'comparisonCanvas.nativeElement'` uses a single-char wildcard (`.`) but the actual code has two characters (`?.`) at that position, so the literal grep as written won't match either the new `syncCanvasObserver` code or the pre-existing `onDragStart` code. This is a plan-authoring artifact, not a code defect — `grep -c 'comparisonCanvas'` (5 matches) and the primary `<verify>` command both confirm the implementation is correct.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `compare-modal.component.ts` now has exactly one remaining deferred-timer call (`applyDefaultOverlays`'s `setTimeout(..., 100)`), which plan 03-07 owns (D-08) — confirmed via `grep -c 'setTimeout'` returning `1`.
- Full test suite: 395 total, 29 FAILED (all pre-existing, unchanged from before this plan), 366 SUCCESS.
- `npx tsc --noEmit` and `pnpm run build` both exit 0.

---
*Phase: 03-race-condition-lifecycle-fixes*
*Completed: 2026-07-30*

## Self-Check: PASSED

- FOUND: src/app/components/compare-modal/compare-modal.component.ts
- FOUND: src/app/components/compare-modal/compare-modal.component.spec.ts
- FOUND: .planning/phases/03-race-condition-lifecycle-fixes/03-05-SUMMARY.md
- FOUND: .planning/phases/03-race-condition-lifecycle-fixes/deferred-items.md
- FOUND commit: 47af8fc
- FOUND commit: a35f7b0

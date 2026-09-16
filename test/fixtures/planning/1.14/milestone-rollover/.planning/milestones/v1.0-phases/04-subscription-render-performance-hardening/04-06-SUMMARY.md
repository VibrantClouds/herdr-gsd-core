---
phase: 04-subscription-render-performance-hardening
plan: "06"
subsystem: performance
tags: [angular, rxjs, resize-observer, image-display, comparison-panel]

# Dependency graph
requires:
  - phase: 04-subscription-render-performance-hardening
    provides: "ResizeObserverService (observe/unobserve API, rAF-batched single-zone-re-entry delivery) from 04-03"
provides:
  - "image-display.component.ts and comparison-panel.component.ts migrated onto the shared ResizeObserverService"
  - "Integration proof in compare-modal.component.spec.ts that two rendered image-display instances share a single native ResizeObserver (SC#2, D-09)"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Consumers subscribe to ResizeObserverService.observe(el).pipe(takeUntil(destroy$)) and call unobserve(el) in ngOnDestroy, rather than owning a ResizeObserver directly"
    - "image-display keeps deriving container dimensions from offsetWidth/offsetHeight (layout offsets), not the emitted rect, to preserve rotated-container behavior; comparison-panel keeps sourcing from the emitted rect plus its own padding math"

key-files:
  created: []
  modified:
    - src/app/components/image-display/image-display.component.ts
    - src/app/components/comparison-panel/comparison-panel.component.ts
    - src/app/components/compare-modal/compare-modal.component.spec.ts

key-decisions:
  - "Kept the setTimeout(0) initial update in image-display.component.ts exactly as-is (04-CONTEXT Claude's-Discretion question resolved in favor of preservation, per Task 1 step 7 of the plan) — it is a benign deferral from Phase 3, not something this migration should touch"
  - "comparison-panel sources width/height from the shared service's emitted DOMRectReadOnly (it already used entry.contentRect before this migration), while image-display continues reading offsetWidth/offsetHeight — the shared service returns a raw rect only; per-consumer padding/dimension-source math intentionally stays per-consumer (04-CONTEXT Claude's-Discretion)"
  - "compare-modal.component.spec.ts's new integration test is a sibling top-level describe, not nested inside describe('CompareModalComponent', ...) — nesting caused a leaked extra fixture (created by the outer describe's shared beforeEach) whose teardown corrupted TestBed state for later, unrelated specs when running the full suite (see Deviations)"

patterns-established:
  - "Whitebox integration testing pattern for proving DI-singleton-service sharing: install a capturing fake for the underlying native API, then identify the constructed instance whose recorded calls include all expected consumer targets, rather than asserting a raw global construction count (which is ambiguous when other, out-of-scope consumers exist in the same fixture)"

requirements-completed: [PERF-02]

coverage:
  - id: D1
    description: "image-display.component.ts consumes the shared ResizeObserverService instead of constructing its own ResizeObserver, pipes through takeUntil(destroy$), unobserves on destroy, and keeps deriving dimensions from offsetWidth/offsetHeight with updateContainerDimensions's body byte-identical"
    requirement: "PERF-02"
    verification:
      - kind: unit
        ref: "src/app/components/image-display/image-display.component.spec.ts (full scoped run: 34 SUCCESS / 3 pre-existing FAILED, unchanged from baseline)"
        status: pass
      - kind: other
        ref: "git diff -U0 shows no modification to updateContainerDimensions's body; grep counts for new ResizeObserver (0), resizeObserverService.observe(/unobserve( (1 each), ngZone (0 outside comments), setTimeout (1)"
        status: pass
    human_judgment: false
  - id: D2
    description: "comparison-panel.component.ts consumes the shared ResizeObserverService, sourcing width/height from the emitted rect, and keeps its own padding math including the 40px display-container subtraction verbatim"
    requirement: "PERF-02"
    verification:
      - kind: unit
        ref: "src/app/components/comparison-panel/comparison-panel.component.spec.ts (full scoped run: 3 SUCCESS / 5 pre-existing FAILED, unchanged from baseline)"
        status: pass
      - kind: other
        ref: "git diff confirms grep counts: new ResizeObserver (0), resizeObserverService.observe(/unobserve( (1 each), ' - 40' (2, both 40px subtraction lines), getComputedStyle (1)"
        status: pass
    human_judgment: false
  - id: D3
    description: "compare-modal.component.spec.ts proves exactly one native ResizeObserver instance serves both rendered image-display instances, and that unobserve fires for both containers on teardown, without touching compare-modal.component.ts itself (D-06 exclusion)"
    requirement: "PERF-02"
    verification:
      - kind: unit
        ref: "src/app/components/compare-modal/compare-modal.component.spec.ts#shared resize observation (PERF-02) — 3 new tests, all pass"
        status: pass
      - kind: other
        ref: "git diff src/app/components/compare-modal/compare-modal.component.ts is empty"
        status: pass
    human_judgment: false

# Metrics
duration: 48min
completed: 2026-07-30
status: complete
---

# Phase 4 Plan 6: Migrate image-display and comparison-panel onto ResizeObserverService Summary

**Both in-scope ResizeObserver construction sites (image-display, comparison-panel) now consume the shared ResizeObserverService from 04-03, and a new compare-modal integration test proves two rendered image-display instances share a single native observer instead of one each.**

## Performance

- **Duration:** 48 min
- **Started:** 2026-07-30T23:52:00Z (approx.)
- **Completed:** 2026-07-31T00:40:00Z (approx.)
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- `ImageDisplayComponent` no longer constructs its own `ResizeObserver`; it injects `ResizeObserverService`, subscribes to `observe(el).pipe(takeUntil(destroy$))`, and calls `unobserve(el)` in `ngOnDestroy`. The redundant per-callback `NgZone.run()` re-entry and the `NgZone` constructor dependency were removed entirely, since the shared service already re-enters the zone exactly once per rAF flush. `updateContainerDimensions()`'s body is untouched — it still reads `offsetWidth`/`offsetHeight` so rotated-container behavior is unaffected — and the `setTimeout(0)` initial update was deliberately kept.
- `ComparisonPanelComponent` no longer constructs its own `ResizeObserver`; it injects `ResizeObserverService` and subscribes the same way. Unlike `image-display`, this consumer sources `width`/`height` from the emitted `DOMRectReadOnly` (it already used `entry.contentRect` before this migration), and its own padding math — including the 40px display-container subtraction on each axis — is preserved verbatim.
- `compare-modal.component.spec.ts` gained a new `describe('shared resize observation (PERF-02)', ...)` integration test with three cases: both `app-image-display` instances render (precondition guard), exactly one native observer instance serves both display containers (SC#2, D-09), and `unobserve` fires for both containers on `fixture.destroy()`. `compare-modal.component.ts` itself remains completely untouched, preserving the two deliberately out-of-scope observers it owns for `#comparisonCenter` and `#comparisonCanvas` (D-06).

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate image-display onto ResizeObserverService** - `e610eb5` (feat)
2. **Task 2: Migrate comparison-panel onto ResizeObserverService** - `a4500c6` (feat)
3. **Task 3: Prove single-observer sharing across two image-display instances in compare-modal** - `0068b8a` (test)
4. **Fix: cross-spec test pollution from nested describe** - `8932fc1` (fix) — see Deviations below

_Note: this plan has no `docs:` plan-metadata commit in worktree mode — STATE.md/ROADMAP.md updates are applied centrally by the orchestrator after the wave merges._

## Files Created/Modified
- `src/app/components/image-display/image-display.component.ts` - Injects `ResizeObserverService`; subscribes to its `observe()` stream via `takeUntil(destroy$)`; removed the local `ResizeObserver` field, the `NgZone` dependency, and the per-callback zone re-entry; `unobserve`s the tracked element in `ngOnDestroy`.
- `src/app/components/comparison-panel/comparison-panel.component.ts` - Injects `ResizeObserverService`; subscribes to its `observe()` stream via `takeUntil(destroy$)`, sourcing width/height from the emitted rect; keeps its own padding math (including the 40px subtraction) and `getComputedStyle` call verbatim; `unobserve`s the tracked element in `ngOnDestroy`.
- `src/app/components/compare-modal/compare-modal.component.spec.ts` - New sibling top-level `describe('shared resize observation (PERF-02)', ...)` block with a capturing fake `ResizeObserver`, proving the shared service consolidates what used to be one `ResizeObserver` per `image-display` instance into a single one serving both.

## Decisions Made
- Kept `setTimeout(0)` initial update in `image-display.component.ts` exactly as-is, resolving the 04-CONTEXT.md Claude's-Discretion question in favor of preservation (Task 1 step 7) — it's a benign Phase 3 deferral, not something this migration should touch.
- Per-consumer dimension-source and padding math intentionally stays per-consumer: `image-display` still reads `offsetWidth`/`offsetHeight` (avoiding `getBoundingClientRect()`'s inflated dimensions on rotated containers), while `comparison-panel` sources from the shared service's emitted rect (matching its pre-migration `entry.contentRect` usage) and keeps its own 40px display-container padding subtraction. This matches 04-CONTEXT's resolution that the shared service returns a raw rect only, with padding math staying per-consumer.
- The new compare-modal integration test spies on the injected `ResizeObserverService`'s own `observe` method AND identifies, among all globally-constructed fake native observer instances, the single one whose recorded `observe` calls include both display container elements — this dual approach was chosen because `compare-modal.component.ts` itself constructs two other native `ResizeObserver`s (for `#comparisonCenter` and `#comparisonCanvas`, both explicitly out of scope per D-06), making a raw global construction count ambiguous.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Cross-spec test pollution from a nested describe block**
- **Found during:** Task 3 verification (full-suite run, per the plan's `<verification>` section requiring a green full suite before the wave merges)
- **Issue:** The new `describe('shared resize observation (PERF-02)', ...)` block was initially nested inside `describe('CompareModalComponent', ...)`. Because Jasmine always runs an outer describe's `beforeEach` before a nested describe's own `beforeEach`, every test in the new block also triggered the outer block's shared setup — creating an extra `CompareModalComponent` fixture (with its own `ImageDisplayComponent` children) against whatever `window.ResizeObserver` was installed at that moment, before the new block's own capturing fake was installed. The new block's `beforeEach` then called `TestBed.resetTestingModule()` to get a fresh `ResizeObserverService` singleton, which destroyed that leaked outer fixture — at a point where `window.ResizeObserver` had *already* been swapped to the capturing fake, corrupting Angular's internal fixture-tracking state. This surfaced only when running the full suite together, as spurious `this.observer?.unobserve is not a function` cleanup failures in a completely unrelated spec file (`image-display.component.spec.ts`), while the scoped `compare-modal.component.spec.ts` run alone stayed green (masking the bug from a scoped-only verification pass).
- **Fix:** Restructured the new test block as a true sibling top-level `describe(...)`, not nested inside `describe('CompareModalComponent', ...)`. It now has its own self-contained mock panel-state constants (duplicated, not shared with the outer describe, to avoid touching the outer describe's existing tests per the plan's "do not restructure the existing tests" instruction) and installs its capturing fake before any TestBed/component setup happens in its own, sole `beforeEach` — no leaked fixture, no explicit `TestBed.resetTestingModule()` needed.
- **Files modified:** `src/app/components/compare-modal/compare-modal.component.spec.ts`
- **Verification:** Full suite run twice, consistently reporting `494 total / 465 SUCCESS / 29 FAILED` — exactly the documented pre-existing 29-failure baseline plus this plan's 3 new passing tests, with zero new failures.
- **Committed in:** `8932fc1`

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** No scope change — the fix only restructured the new test's internal setup to avoid cross-spec pollution; all three tasks' acceptance criteria and the plan's `<success_criteria>` are met exactly as specified.

## Issues Encountered
- A scoped-only verification pass (running just `compare-modal.component.spec.ts`) would not have caught the pollution bug above — it only surfaced when running the full suite. This plan's `<verification>` section explicitly calls for a full-suite run before the wave merges, which is what caught it; documented here as a reminder that scoped runs are necessary-but-not-sufficient for changes that touch global test doubles (`window.ResizeObserver`) or call `TestBed` lifecycle methods directly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Both in-scope `ResizeObserver` construction sites (`image-display.component.ts:61`, `comparison-panel.component.ts:262`, per D-06) are now fully migrated onto `ResizeObserverService`. The three explicitly out-of-scope sites (`compare-modal.component.ts:118` and `:172`, `attachment-preview.component.ts:195`) remain untouched.
- Full test suite: 494 total / 465 SUCCESS / 29 FAILED — the 29 failures are unchanged from the phase's documented pre-existing baseline (491/462/29 at this plan's base commit); this plan's 3 new integration test cases all pass and introduce zero new failures.
- No serialization version bump owed — no `ExportedState`/`AppState`/`ImageModel` structure was touched by this plan.
- Manual sanity check (resizing the browser window with two panels loaded, confirming images track their containers with no visible lag) was not performed in this automated execution; the plan's `<verification>` section notes this as a phase-level manual pass, not a per-plan gate.

---
*Phase: 04-subscription-render-performance-hardening*
*Completed: 2026-07-30*

## Self-Check: PASSED

- FOUND: `src/app/components/image-display/image-display.component.ts`
- FOUND: `src/app/components/comparison-panel/comparison-panel.component.ts`
- FOUND: `src/app/components/compare-modal/compare-modal.component.spec.ts`
- FOUND: `.planning/phases/04-subscription-render-performance-hardening/04-06-SUMMARY.md`
- FOUND commit: `e610eb5` (Task 1)
- FOUND commit: `a4500c6` (Task 2)
- FOUND commit: `0068b8a` (Task 3)
- FOUND commit: `8932fc1` (fix: cross-spec pollution)
- FOUND commit: `3bf632e` (docs: SUMMARY + REQUIREMENTS.md)

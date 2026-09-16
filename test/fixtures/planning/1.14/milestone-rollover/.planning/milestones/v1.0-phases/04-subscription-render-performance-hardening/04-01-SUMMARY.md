---
phase: 04-subscription-render-performance-hardening
plan: "01"
subsystem: ui
tags: [rxjs, takeUntil, subscription-teardown, angular, testing]

# Dependency graph
requires: []
provides:
  - "AppComponent implements OnDestroy with a destroy$ class field and ngOnDestroy hook"
  - "All seven AppComponent ngOnInit subscriptions piped through takeUntil(this.destroy$)"
  - "Destroy-then-emit regression coverage for AppComponent (userModels$/hasUserModels, globalSettings$/currentUnit)"
affects: [04-02, 04-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "takeUntil(destroy$) subscription teardown idiom applied to AppComponent, matching comparison-panel.component.ts"
    - "Angular TestBed unit tests for a root component whose template renders a real child unconditionally must use real providedIn:'root' singletons (not partial useValue stubs) unless every transitively-constructed child dependency is also stubbed"

key-files:
  created: []
  modified:
    - src/app/app.component.ts
    - src/app/app.component.spec.ts

key-decisions:
  - "Test provider strategy deviated from the plan's useValue-stub design (see Deviations) because app.component.html renders <app-compare-modal> unconditionally, so TestBed.createComponent() eagerly constructs the full real child tree before detectChanges() runs"

patterns-established:
  - "AppComponent.destroy$ / AppComponent.ngOnDestroy — the teardown mechanism other 04-xx plans (04-02) mirror for ModelSelectorComponent/AttachmentSelectorComponent"

requirements-completed: [PERF-01]

coverage:
  - id: D1
    description: "AppComponent implements OnDestroy; all seven ngOnInit subscriptions piped through takeUntil(this.destroy$); ngOnDestroy completes destroy$"
    requirement: "PERF-01"
    verification:
      - kind: unit
        ref: "src/app/app.component.spec.ts#should create the app"
        status: pass
      - kind: other
        ref: "grep -c 'takeUntil(this.destroy$)' src/app/app.component.ts == 7"
        status: pass
    human_judgment: false
  - id: D2
    description: "Destroy-then-emit regression test proves userModels$ no longer mutates hasUserModels after ngOnDestroy()"
    requirement: "PERF-01"
    verification:
      - kind: unit
        ref: "src/app/app.component.spec.ts#subscription teardown (PERF-01) stops applying userModels$ emissions to hasUserModels after ngOnDestroy()"
        status: pass
    human_judgment: false
  - id: D3
    description: "Destroy-then-emit regression test proves globalSettings$ no longer mutates currentUnit after ngOnDestroy()"
    requirement: "PERF-01"
    verification:
      - kind: unit
        ref: "src/app/app.component.spec.ts#subscription teardown (PERF-01) stops applying globalSettings$ emissions to currentUnit after ngOnDestroy()"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-07-30
status: complete
---

# Phase 04 Plan 01: AppComponent Subscription Teardown Summary

**AppComponent now implements OnDestroy with a destroy$ Subject; all seven root-level subscriptions are piped through takeUntil(this.destroy$), verified by destroy-then-emit regression tests that fail without the fix.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-07-30T23:11:00Z
- **Completed:** 2026-07-30T23:35:57Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- `AppComponent` implements `OnDestroy`, holds a `private destroy$ = new Subject<void>()` class field, and all seven `ngOnInit` subscriptions (`userModels$`, `viewport$`, `currentUnit$`, `canShare$`, `isAdultMode$`, `leftPanelState$`, `rightPanelState$`) are piped through `takeUntil(this.destroy$)`.
- `ngOnDestroy()` calls `this.destroy$.next(); this.destroy$.complete();`, matching the established `comparison-panel.component.ts` idiom.
- `app.component.spec.ts` gained a `subscription teardown (PERF-01)` describe block with two destroy-then-emit regression cases, both verified to fail if the `takeUntil` pipes are reverted.
- Full Karma suite run: 450 total / 421 SUCCESS / 29 FAILED — the 29 failures are byte-for-byte the same pre-existing set named in the orchestrator's phase baseline (448/419/29); this plan introduces zero new failures and adds 2 new passing tests.

## Task Commits

1. **Task 1: Add takeUntil(destroy$) teardown to AppComponent's seven subscriptions** - `2e602e4` (feat)
2. **Task 2: Add destroy-then-emit regression coverage to app.component.spec.ts** - `53f7713` (test)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `src/app/app.component.ts` - Added `OnDestroy`, `destroy$` field, `takeUntil(this.destroy$)` on all seven subscriptions, `ngOnDestroy()`
- `src/app/app.component.spec.ts` - Added `subscription teardown (PERF-01)` describe block with destroy-then-emit regression tests

## Decisions Made
- Kept `ngOnDestroy`'s scope to subscription teardown only, per the plan's explicit instruction not to also clear `shareSuccessTimer` (out of scope for PERF-01/D-01).
- For the spec file, switched from the plan's planned partial `useValue` stubs to real `providedIn: 'root'` singletons for everything except `UserModelMigrationService` and `SiteModeService` — see Deviations below for why.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Plan's TestBed provider-stub design crashed on eager child-component construction**
- **Found during:** Task 2 (writing `app.component.spec.ts` destroy-then-emit tests)
- **Issue:** The plan instructed replacing `StateManagementService`, `IndexedDBUserModelService`, and `ViewportService` with partial `useValue` objects exposing only the observables `AppComponent` itself reads. This crashed all three specs with `TypeError: Cannot read properties of undefined (reading 'pipe')` inside `ModelAttachmentDefaultsService`'s constructor. Root cause: `app.component.html` renders `<app-compare-modal>` unconditionally (not behind an `@if`), so `TestBed.createComponent(AppComponent)` eagerly constructs the entire real child component tree (`CompareModalComponent` → `ComparisonPanelComponent` → …) during initial view creation, *before* `detectChanges()` runs — contrary to the plan's stated assumption ("leaving change detection unrun keeps the child modal components ... out of the picture so no further DI is required"). That real child tree injects the real `ModelAttachmentDefaultsService`, whose constructor reads `this.userModelService.initialized$` — a property the plan's partial stub for `IndexedDBUserModelService` did not include.
- **Fix:** Used the real `providedIn: 'root'` singletons for `StateManagementService`, `IndexedDBUserModelService`, `ViewportService`, `StateExportService`, `SeoService`, `CustomAttachmentPointService`, and `SnackbarService` (matching how the pre-existing bare `should create` test already exercised the full real tree with zero overrides). Kept `UserModelMigrationService` and `SiteModeService` overridden with `jasmine.createSpyObj` (as the plan specified) to keep `ngOnInit` deterministic and avoid real routing/URL side effects in a test module with no `Router` provided. Drove the two subscriptions under test via the real service's own surface: `StateManagementService.updateMeasurementUnit()` (a genuine public mutator) for the `globalSettings$` case, and a typed-cast access to `IndexedDBUserModelService`'s private `userModelsSubject` for the `userModels$` case (avoiding an async, non-deterministic real IndexedDB write via `saveUserModel()`).
- **Files modified:** `src/app/app.component.spec.ts`
- **Verification:** All 3 specs pass (`should create the app` + 2 new teardown cases). Confirmed both new cases fail when Task 1's `takeUntil` pipes are locally reverted (sanity check per the plan's own acceptance criterion), then restored Task 1's implementation with zero resulting diff (`git diff` empty after restore).
- **Committed in:** `53f7713` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The deviation only changed *how* the regression test drives its assertions (real singletons + real mutators instead of partial stubs); the substantive contract required by D-05 — destroy-then-emit coverage for `AppComponent`, verified to fail without the `takeUntil` fix — is fully met. No scope creep; no change to `app.component.ts` beyond what Task 1 specified.

## Issues Encountered
None beyond the deviation documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `AppComponent.destroy$` / `AppComponent.ngOnDestroy` now exist as documented in the phase's cross-plan symbol map, ready for 04-02 (`ModelSelectorComponent`, `AttachmentSelectorComponent`) to follow the same idiom independently (no shared dependency between 04-01 and 04-02 — both are wave-1, `depends_on: []`).
- No blockers for subsequent phase-04 plans.

---
*Phase: 04-subscription-render-performance-hardening*
*Completed: 2026-07-30*

## Self-Check: PASSED

- FOUND: src/app/app.component.ts
- FOUND: src/app/app.component.spec.ts
- FOUND: .planning/phases/04-subscription-render-performance-hardening/04-01-SUMMARY.md
- FOUND: 2e602e4 (Task 1 commit)
- FOUND: 53f7713 (Task 2 commit)

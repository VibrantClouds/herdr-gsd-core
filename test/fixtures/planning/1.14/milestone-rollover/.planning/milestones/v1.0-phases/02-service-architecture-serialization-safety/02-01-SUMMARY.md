---
phase: 02-service-architecture-serialization-safety
plan: 01
subsystem: testing
tags: [angular, jasmine, karma, testbed, dependency-injection, indexeddb]

# Dependency graph
requires:
  - phase: 01-component-decomposition
    provides: "52-failure full-suite baseline (01-BASELINE.md), attribution rule for regression detection"
provides:
  - "Hermetic state-export.service.spec.ts (8/8 green) with StateExportService's full dependency graph mocked"
  - "New category.service.spec.ts pinning cascadeRenameCategory/cascadeDeleteCategory behaviour pre-DEP-01-refactor"
  - "Phase 2 working baseline of 50 full-suite failures (down from Phase 1's 52), confirmed name-for-name against 01-BASELINE.md"
affects: [02-02, 02-03, 02-04, 02-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "IndexedDBUserModelService spy shape { initialized$: of(true), userModels$: of([]) } reused across specs that transitively depend on it"
    - "NativeIndexedDBService spy convention (init/getAll/add/update/delete returning Promise/Observable) established for the first time for CategoryService's DI needs"

key-files:
  created:
    - src/app/services/category.service.spec.ts
  modified:
    - src/app/services/state-export.service.spec.ts

key-decisions:
  - "Kept the pre-existing repo convention of hardcoding expected version literals in state-export.service.spec.ts rather than exporting CURRENT_VERSION from the service, per plan Task 1 Defect 3 instruction"
  - "category.service.spec.ts asserts against public API only (renameCategory/deleteCategory), never the private getUserModelServiceAsync lookup helper, so it survives the DEP-01 constructor-injection refactor unchanged"

requirements-completed: [SERL-03, DEP-01]

coverage:
  - id: D1
    description: "state-export.service.spec.ts mocks StateExportService's real constructor dependency (IndexedDBUserModelService) instead of the wrong UserModelService token, and completes the StateManagementService spy so setRestoringState no longer throws"
    requirement: SERL-03
    verification:
      - kind: unit
        ref: "src/app/services/state-export.service.spec.ts — TOTAL: 8 SUCCESS"
        status: pass
    human_judgment: false
  - id: D2
    description: "category.service.spec.ts pins cascadeRenameCategory/cascadeDeleteCategory behaviour, including the type-discrimination filter (model/custom_model vs custom_attachment), against the current pre-refactor implementation"
    requirement: DEP-01
    verification:
      - kind: unit
        ref: "src/app/services/category.service.spec.ts — TOTAL: 4 SUCCESS"
        status: pass
    human_judgment: false
  - id: D3
    description: "Full test suite reports exactly 50 failures, name-identical to the Phase 1 52-name baseline minus the two StateExportService entries this plan fixes — zero new regressions"
    verification:
      - kind: unit
        ref: "pnpm test --no-watch — TOTAL: 50 FAILED, 290 SUCCESS (340 total)"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-07-30
status: complete
---

# Phase 02 Plan 01: Test Scaffold Repair Summary

**Fixed StateExportService's spec to mock its real IndexedDBUserModelService dependency (was silently constructing the real service) and added a new category.service.spec.ts pinning cascade-rename/delete behaviour before the DEP-01 dependency-injection refactor.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-07-30T17:19:35Z
- **Tasks:** 2 completed
- **Files modified:** 2 (1 modified, 1 created)

## Accomplishments
- `state-export.service.spec.ts` now mocks all six of `StateExportService`'s real constructor dependencies (`StateManagementService`, `IndexedDBUserModelService`, `CustomAttachmentPointService`, `CategoryService`, `ImageMetadataService`, `ModelAttachmentDefaultsService`), runs 8/8 green, and no longer silently constructs any real service that reaches IndexedDB during the spec run
- Fixed the stale `'1.0.5'` version assertion in the JSON-export test to `'1.0.11'` (tracking `CURRENT_VERSION`)
- Created `category.service.spec.ts` from scratch — the first spec file for `CategoryService` — covering construction (cyclic-injection regression detector), `renameCategory`'s cascade-to-matching-models behaviour, the type-discrimination filter (model/custom_model vs custom_attachment), and `deleteCategory`'s reassign-to-"Custom" + delete-record behaviour
- Confirmed full-suite failure count is exactly 50 (down from Phase 1's 52), with every failing spec name matching the pre-existing baseline in `01-BASELINE.md` — zero new regressions introduced

## Task Commits

1. **Task 1: Repair the StateExportService spec's dependency-injection setup and stale version assertion** - `1a3e73a` (fix)
2. **Task 2: Create category.service.spec.ts pinning cascade behaviour before the DEP-01 refactor** - `acbc364` (test)

## Files Created/Modified
- `src/app/services/state-export.service.spec.ts` - Swapped `UserModelService` mock for `IndexedDBUserModelService`; added `setRestoringState` to the `StateManagementService` spy; added `CategoryService`/`ModelAttachmentDefaultsService` spies; fixed stale version literal
- `src/app/services/category.service.spec.ts` (new) - Pins `renameCategory`/`deleteCategory` cascade behaviour and type-discrimination filtering against the current Injector-lookup implementation

## Decisions Made
- Hardcoded the expected version literal (`'1.0.11'`) in the spec with a tracking comment, rather than exporting `CURRENT_VERSION` from `StateExportService` — matches this repo's existing convention of inlining expected literals rather than importing private constants (per plan Task 1 instruction)
- Wrote `category.service.spec.ts` against `CategoryService`'s public API only (`renameCategory`, `deleteCategory`, construction) — never referencing the private `getUserModelServiceAsync` lookup helper by name — so the same TestBed provider for `IndexedDBUserModelService` serves both the current runtime-injector lookup and the future (plan 02-03) constructor-injected implementation without any spec changes

## Deviations from Plan

None - plan executed exactly as written. All four defects in Task 1 and all four required behaviours in Task 2 were implemented per the plan's `<action>` blocks with no additional fixes needed.

## Issues Encountered

One TypeScript compile error during Task 2 authoring: `jasmine.createSpyObj('NativeIndexedDBService', ...).add.and.callFake((_storeName: string, data: unknown) => of(data))` failed generic-type inference (`Observable<unknown>` not assignable to the method's generic `Observable<T>` return type). Fixed by typing the callback's `data` parameter as `any` instead of `unknown` — this is a TypeScript inference limitation of `jasmine.SpyObj` against generic methods, not a logic bug, and the spy's runtime behavior (echoing `data` back through `of(...)`) is unchanged.

## Next Phase Readiness

- Working full-suite baseline for the rest of Phase 2 is confirmed at **50 failures** (not 52, not 0) — plans 02-02 through 02-05 should assert against this count.
- `category.service.spec.ts` is a green pre-refactor safety net; plan 02-03's DEP-01 constructor-injection refactor of `CategoryService` can now proceed with a before/after regression check in place.
- `state-export.service.spec.ts` is hermetic (fully mocked dependency graph); plan 02-04's version-fixture regression suite can extend this file without inheriting the prior DI-mock defects.
- No blockers identified.

## Self-Check: PASSED

All created/modified files confirmed present on disk; all three commit hashes (`1a3e73a`, `acbc364`, `7b8a13a`) confirmed present in `git log --oneline --all`.

---
*Phase: 02-service-architecture-serialization-safety*
*Completed: 2026-07-30*

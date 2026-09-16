---
phase: 05-test-coverage-hardening
plan: 06
subsystem: testing
tags: [angular, jasmine, karma, indexeddb, signals, dependency-injection]

# Dependency graph
requires:
  - phase: 05-test-coverage-hardening
    provides: 05-TRIAGE.md's authoritative 29-failure disposition table (plan 05-01)
provides:
  - Eight mock/DI-rot spec fixes (ManageModalComponent x4, UploadModalComponent x3, CategoryDropdownComponent x1) rewired to the services their components actually inject
  - A regression spec proving CategoryDropdownComponent's required signal input actually selects its category stream
affects: [05-12 (upload-modal.component.spec.ts TEST-02 gap-fill lands on this file's corrected DI wiring)]

# Actuals (#2632)
actuals:
  tokens: 2600
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Stand in IndexedDBUserModelService (not the deprecated UserModelService) so real, DI-resolved consumer services (UploadFormValidatorsService) pick up the spy"
    - "fixture.componentRef.setInput() before the first detectChanges() for required signal inputs"
    - "Await genuinely-async IndexedDB-backed service calls in specs instead of asserting synchronously before the promise settles"

key-files:
  created: []
  modified:
    - src/app/components/manage-modal/manage-modal.component.spec.ts
    - src/app/components/category-dropdown/category-dropdown.component.spec.ts
    - src/app/components/upload-modal/upload-modal.component.spec.ts

key-decisions:
  - "Row #28's storage-warning failure was not purely the DI mismatch 05-TRIAGE.md's evidence cell attributed it to -- the test's own threshold values (4.5MB/2MB) were also stale, calibrated to a pre-IndexedDB-migration ~5MB localStorage quota rather than the current 40MB (80% of 50MB) threshold. Corrected both root causes in the same edit; did not amend 05-TRIAGE.md's evidence text since it was outside this plan's declared files_modified."
  - "For upload-modal's unique-name validator, stood in IndexedDBUserModelService rather than UploadFormValidatorsService directly, letting the real (DI-resolved) validators service consult the mock -- matches the plan's stated preference and requires no changes to which validator function runs."

requirements-completed: [TEST-02]

coverage:
  - id: D1
    description: "ManageModalComponent's four failing specs (delete/clear/load/storage-warning) pass against IndexedDBUserModelService, the service the component actually injects"
    requirement: "TEST-02"
    verification:
      - kind: unit
        ref: "src/app/components/manage-modal/manage-modal.component.spec.ts#ManageModalComponent (11/11 pass)"
        status: pass
    human_judgment: false
  - id: D2
    description: "CategoryDropdownComponent's required signal input is set before first change detection, and a new spec proves it selects the attachment-categories stream when type='attachment'"
    requirement: "TEST-02"
    verification:
      - kind: unit
        ref: "src/app/components/category-dropdown/category-dropdown.component.spec.ts#CategoryDropdownComponent (2/2 pass)"
        status: pass
    human_judgment: false
  - id: D3
    description: "UploadModalComponent's three failing specs (unique-name, file-selection timing, height-required) resolved per their individual 05-TRIAGE.md verdicts"
    requirement: "TEST-02"
    verification:
      - kind: unit
        ref: "src/app/components/upload-modal/upload-modal.component.spec.ts#UploadModalComponent (31/31 pass)"
        status: pass
    human_judgment: false

duration: 35min
completed: 2026-08-01
status: complete
---

# Phase 5 Plan 06: Mock/DI-Rot Failure Cluster Summary

**Rewired three spec files off the deprecated `UserModelService` and an unset required signal input, resolving 8 of the 29 baseline test failures with zero production changes.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- `ManageModalComponent`'s spec now stands in `IndexedDBUserModelService` (the service the component actually injects) instead of the deprecated `UserModelService`, fixing 4 failures: `should delete user model with confirmation`, `should clear all user models with confirmation`, `should load user models on init`, `should show storage warning when approaching limit`.
- `CategoryDropdownComponent`'s spec now sets the required `type` signal input via `fixture.componentRef.setInput()` before the first change-detection cycle, fixing `should create`, and adds a new spec proving the input actually drives which category stream (`modelCategories$` vs `attachmentCategories$`) the component subscribes to.
- `UploadModalComponent`'s three failures resolved individually per their distinct 05-TRIAGE.md verdicts: the unique-name validator's spy target rewired to the service it actually consults, the file-selection spec awaits the now-async pipeline call instead of racing it, and the height-required spec asserts the real form-group-level `heightRequired` error instead of a nonexistent per-control `required`.
- Full suite: 29 → 21 failures (exactly the expected 8-failure reduction), 592 → 593 specs (one new regression spec added), zero new failures introduced.

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix ManageModalComponent's wrong-service DI mock** - `08208d4` (fix)
2. **Task 2: Fix CategoryDropdownComponent's unset required signal input** - `fbfa5aa` (fix)
3. **Task 3: Resolve the three UploadModalComponent failures per their triage verdicts** - `6ff3f22` (fix)

## Files Created/Modified
- `src/app/components/manage-modal/manage-modal.component.spec.ts` - Swapped `UserModelService` → `IndexedDBUserModelService` mock/provider; added missing `globalSettings$` to the `StateManagementService` spy; awaited two now-async service calls (`getStorageSize`, `clearAllUserModels`); corrected storage-warning threshold test values.
- `src/app/components/category-dropdown/category-dropdown.component.spec.ts` - Added a `CategoryService` stand-in; set the required `type` signal input via `componentRef.setInput()` before first `detectChanges()`; added a stream-selection regression spec.
- `src/app/components/upload-modal/upload-modal.component.spec.ts` - Swapped `UserModelService` → `IndexedDBUserModelService` mock/provider (the real consult target for `UploadFormValidatorsService.uniqueNameValidator()`); made the file-selection spec `async` and mocked the pipeline's resolved result instead of stubbing `FileReader`; rewrote the height-required spec to assert the real group-level `heightRequired` error.

## Decisions Made
- Row #28 (`ManageModalComponent should show storage warning when approaching limit`)'s true root cause was two-fold, not purely the DI mismatch 05-TRIAGE.md's evidence cell named: the test's own threshold values (4.5MB warn / 2MB no-warn) were stale, calibrated to a pre-IndexedDB-migration ~5MB localStorage quota. The live component's threshold is 80% of a 50MB budget (40MB). Fixed both causes in the same edit (new values: 45MB warn / 10MB no-warn) — the verdict (`spec-wrong`) was still correct, only the evidence narrative was incomplete. Did not amend `05-TRIAGE.md`'s evidence text since that file is outside this plan's declared `files_modified` and this correction doesn't change the verdict or the fix location.
- For `should validate unique name`, chose to stand in `IndexedDBUserModelService` (not `UploadFormValidatorsService` itself) — the real, DI-resolved `UploadFormValidatorsService` then naturally picks up the mocked `isNameTaken`, so no change to which validator function actually runs, and the assertion continues testing genuine form-level behavior rather than a hand-rolled substitute validator.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Two ManageModalComponent tests needed `await` added, beyond the plan's stated DI fix**
- **Found during:** Task 1
- **Issue:** `should load user models on init` and `should clear all user models with confirmation` asserted synchronously right after calling an async component method (`getStorageSize()`/`clearAllUserModels()` are genuinely async against `IndexedDBUserModelService`, unlike the deprecated service's implied-synchronous equivalents). After fixing the DI mismatch alone, these two tests still failed because the assertions ran before the awaited promise settled.
- **Fix:** Made both tests `async`, used `.and.resolveTo(10000)` for `getStorageSize`, and awaited `fixture.whenStable()` / `component.clearAllUserModels()` respectively before asserting.
- **Files modified:** `src/app/components/manage-modal/manage-modal.component.spec.ts`
- **Verification:** `ng test --include='**/manage-modal.component.spec.ts'` → 11/11 pass.
- **Committed in:** `08208d4` (Task 1 commit)

**2. [Rule 1 - Bug] Storage-warning test's threshold values didn't match the live component's threshold, independent of the DI issue**
- **Found during:** Task 1
- **Issue:** `should show storage warning when approaching limit` set `totalStorageSize` directly (no service call, no DI dependency) to 4.5MB/2MB, but the live `storageWarning` getter warns only above 80% of a 50MB budget (40MB) — neither test value crossed that threshold, so the test failed regardless of which service was mocked.
- **Fix:** Updated the test values to 45MB (crosses threshold, warns) and 10MB (well under threshold, no warning), preserving the "warns when nearing the limit" assertion intent.
- **Files modified:** `src/app/components/manage-modal/manage-modal.component.spec.ts`
- **Verification:** `ng test --include='**/manage-modal.component.spec.ts'` → passes.
- **Committed in:** `08208d4` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — bugs in test timing/values not fully captured by the plan's stated single-cause diagnosis)
**Impact on plan:** Both fixes were necessary to make the plan's acceptance criteria pass; no scope creep, no production code touched, no assertion intent weakened.

## Issues Encountered
None beyond the two auto-fixed items above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `upload-modal.component.spec.ts` is now on corrected DI wiring (`IndexedDBUserModelService`) — 05-12's TEST-02 gap-fill work on this same file (attachment-preview/upload-modal/attachment-canvas-renderer) can build on it without colliding, per this plan landing first in the wave.
- Full suite failure count is now 21 (down from 29 baseline), all remaining failures belong to the other three assigned clusters (05-07 selector rot, 05-08 stale-default/imperial-formatting, 05-09 geometry/NG0100 ordering) — none touch the three files this plan modified.

## Self-Check: PASSED

- FOUND: src/app/components/manage-modal/manage-modal.component.spec.ts
- FOUND: src/app/components/category-dropdown/category-dropdown.component.spec.ts
- FOUND: src/app/components/upload-modal/upload-modal.component.spec.ts
- FOUND: .planning/phases/05-test-coverage-hardening/05-06-SUMMARY.md
- FOUND commit: 08208d4
- FOUND commit: fbfa5aa
- FOUND commit: 6ff3f22
- FOUND commit: dabf831

---
*Phase: 05-test-coverage-hardening*
*Completed: 2026-08-01*

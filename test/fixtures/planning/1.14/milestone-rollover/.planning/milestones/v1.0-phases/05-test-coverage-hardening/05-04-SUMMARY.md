---
phase: 05-test-coverage-hardening
plan: 04
subsystem: testing
tags: [angular, jasmine, karma, testbed, reactive-forms, attachment-system]

# Dependency graph
requires:
  - phase: 01-component-decomposition
    provides: "attachment-edit-modal decomposed with a manual per-editType verification checklist, on the explicit condition that this checklist becomes automated coverage here"
provides:
  - "attachment-edit-modal.component.spec.ts — the read half of the component's only spec: TestBed harness, form initialization, per-editType form population, display gate getters, and onPointPlaced's three-branch construction"
affects: [05-05, test-coverage-hardening]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "jasmine.createSpyObj with a BehaviorSubject-backed observable property, kept as a describe-scoped reference so specs can .next() new values mid-test (globalSettings$ stand-in)"
    - "Spy only persisting/side-effecting services (D-11); keep stateless pure-logic services real so the spec proves actual wiring rather than a mocked stand-in"
    - "ngOnChanges invoked directly with a synthesized SimpleChange, since Angular does not synthesize one for a directly-assigned @Input in a spec"

key-files:
  created:
    - src/app/components/attachment-edit-modal/attachment-edit-modal.component.spec.ts
  modified: []

key-decisions:
  - "Followed D-11 exactly: spied IndexedDBUserModelService, CustomAttachmentPointService, and StateManagementService; kept MeasurementRulerService and AttachmentPointDefinitionService real. CategoryService was stood in as a transitive dependency of the CategoryDropdownComponent child, not one of the component's own six services, so this does not conflict with D-11."
  - "Never rendered the modal template (isOpen stayed false throughout): every interaction in this plan is a direct method/property call on the component instance, not a DOM-driven event, so there was no need to instantiate the real child components (category-dropdown, attachment-point-picker, measurement-ruler, angle-dial) through detectChanges. This kept the spec focused on the component's own logic per D-11's intent, and avoids the DI weight those children carry."
  - "Used component.editData = {...}; component.ngOnChanges({ isOpen: new SimpleChange(...) }) directly for every form-population case, matching the plan's stated mechanic for triggering the non-signal @Input lifecycle hook in a spec."

patterns-established:
  - "Distinct-object assertions (.not.toBe alongside .toEqual) for measurementLine and attachmentPoint prove the component's defensive spread-copy on population, guarding against future edits leaking into the caller's model (T-05-04-02)."

requirements-completed: [TEST-01]

coverage:
  - id: D1
    description: "TestBed harness spies exactly the three persisting services (IndexedDBUserModelService, CustomAttachmentPointService, StateManagementService) plus the transitive CategoryService dependency, keeping MeasurementRulerService and AttachmentPointDefinitionService real per D-11"
    requirement: "TEST-01"
    verification:
      - kind: unit
        ref: "src/app/components/attachment-edit-modal/attachment-edit-modal.component.spec.ts#AttachmentEditModalComponent form initialization"
        status: pass
    human_judgment: false
  - id: D2
    description: "Form initialization: all ten editForm controls exist, imperial/metric height-control enablement inverts on globalSettings$ emission, and validator bounds hold for name/heightInches/penetrationAngle"
    requirement: "TEST-01"
    verification:
      - kind: unit
        ref: "src/app/components/attachment-edit-modal/attachment-edit-modal.component.spec.ts#AttachmentEditModalComponent form initialization"
        status: pass
    human_judgment: false
  - id: D3
    description: "Per-editType form population (custom_model, custom_attachment, server_custom_point) in both imperial and metric, including the ngOnChanges isOpen guard, distinct-object copies of measurementLine/attachmentPoint, custom_attachment's force-reset of penetration fields, isDickAttachment/circumference derivation, and resetState's transient-state clearing"
    requirement: "TEST-01"
    verification:
      - kind: unit
        ref: "src/app/components/attachment-edit-modal/attachment-edit-modal.component.spec.ts#AttachmentEditModalComponent form population"
        status: pass
    human_judgment: false
  - id: D4
    description: "Display gate getters (modalTitle, imagePath, showMeasurementLine, showSizeFields, showCategoryField, categoryType, canDefineAttachmentPoint, showDeleteButton, isImperialUnit) asserted across every editType that changes their answer, plus onImageLoad producing a measurementLine via the real MeasurementRulerService"
    requirement: "TEST-01"
    verification:
      - kind: unit
        ref: "src/app/components/attachment-edit-modal/attachment-edit-modal.component.spec.ts#AttachmentEditModalComponent display gates"
        status: pass
      - kind: unit
        ref: "src/app/components/attachment-edit-modal/attachment-edit-modal.component.spec.ts#AttachmentEditModalComponent onImageLoad"
        status: pass
    human_judgment: false
  - id: D5
    description: "onPointPlaced's three editType-branched id/name construction paths (custom_model, custom_attachment, server_custom_point with both id sub-cases) independently asserted, plus onDefiningChange/onAngleChange/onCategoryChange child event handlers"
    requirement: "TEST-01"
    verification:
      - kind: unit
        ref: "src/app/components/attachment-edit-modal/attachment-edit-modal.component.spec.ts#AttachmentEditModalComponent onPointPlaced"
        status: pass
      - kind: unit
        ref: "src/app/components/attachment-edit-modal/attachment-edit-modal.component.spec.ts#AttachmentEditModalComponent child event handlers"
        status: pass
    human_judgment: false

# Metrics
duration: 35min
completed: 2026-08-01
status: complete

actuals:
  tokens: 6350
  tasks: 3
  commits: 3
---

# Phase 5 Plan 04: attachment-edit-modal Read-Half Coverage Summary

**New `attachment-edit-modal.component.spec.ts` (36 specs) covering the TestBed harness, form initialization/population for all three editTypes in both unit systems, every display gate getter, and `onPointPlaced`'s three independently-asserted id/name construction branches — paying off the debt Phase 1's decomposition left with no regression net.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 3
- **Files modified:** 1 (new)

## Accomplishments

- `attachment-edit-modal.component.ts` — previously the only component in `src/app` with zero spec coverage — now has a working TestBed harness spying exactly the three persisting services named in D-11, with `MeasurementRulerService` and `AttachmentPointDefinitionService` left real.
- Form initialization is pinned: all ten `editForm` controls exist, imperial/metric height-control enablement inverts correctly on a `globalSettings$` emission, and validator bounds hold for `name` (required, max 50), `heightInches` (rejects 12, accepts 11.99), and `penetrationAngle` (rejects 361, accepts 360).
- Form population is asserted for all three `editType` values in both imperial and metric, including the `ngOnChanges` `isOpen` guard, the distinct-object copy behavior for `measurementLine` and `attachmentPoint` (T-05-04-02's aliasing threat), `custom_attachment`'s force-reset of penetration-zone fields, `isDickAttachment`/`circumference` derivation, and `resetState`'s clearing of transient state including a previously-set error.
- Every display gate getter (`modalTitle`, `imagePath`, `showMeasurementLine`, `showSizeFields`, `showCategoryField`, `categoryType`, `canDefineAttachmentPoint`, `showDeleteButton`, `isImperialUnit`) has an assertion for each answer it can give across `editType`s.
- `onPointPlaced`'s three branches are each independently asserted (no shared loop, per D-10) — `custom_model` and `custom_attachment` both produce the hardcoded `'attachment-point'` id with unmodified pass-through coordinates (the invariant the whole overlay system depends on, T-05-04-01), and `server_custom_point` covers both the verbatim-reuse and fallback-generation id paths plus the name-default fallback.
- `onImageLoad` is exercised against the real `MeasurementRulerService.presetLine('vertical', ...)`, proving the wiring Phase 1's decomposition introduced rather than a mocked stand-in.

## Task Commits

Each task was committed atomically:

1. **Task 1: Build the TestBed harness and cover form initialization** - `612ce6e` (test)
2. **Task 2: Cover per-editType form population and the display gate getters** - `12985d5` (test)
3. **Task 3: Cover onPointPlaced's three branches and the remaining child-event handlers** - `5913c20` (test)

_No production code was modified in this plan — `git diff` on `attachment-edit-modal.component.ts` stayed empty across all three tasks, per its acceptance criteria._

## Files Created/Modified

- `src/app/components/attachment-edit-modal/attachment-edit-modal.component.spec.ts` - New spec file, 36 tests, 592 lines. TestBed harness + full read-half coverage (form init, population, display gates, `onPointPlaced`, child event handlers).

## Decisions Made

- Followed D-11's spy list exactly (`IndexedDBUserModelService`, `CustomAttachmentPointService`, `StateManagementService`), stood in `CategoryService` as a transitive dependency of the `CategoryDropdownComponent` child (not a conflict with D-11 since it isn't one of the component's own six injected services), and left `MeasurementRulerService`/`AttachmentPointDefinitionService` real.
- Never set `isOpen = true` through `fixture.detectChanges()` — all interactions in this plan are direct method/property calls on the component instance (`ngOnChanges`, `onPointPlaced`, `onImageLoad`, etc.), not DOM-driven events, so the modal's `@if (isOpen)`-gated template (which would instantiate `app-category-dropdown`, `app-attachment-point-picker`, `app-measurement-ruler`, `app-angle-dial`) was never rendered. This kept the spec's DI surface exactly as narrow as D-11 intends.
- Used `SimpleChange` constructed directly and passed to `component.ngOnChanges(...)` for every population test, since Angular does not synthesize a `SimpleChanges` object for a directly-assigned `@Input` property in a spec (per the plan's stated mechanic).

## Deviations from Plan

None — plan executed exactly as written. Three TypeScript strict-mode type errors were hit and fixed while writing the `onImageLoad`/measurement-line assertions (control-flow narrowing of `component.measurementLine` to `null` after an intervening literal assignment, before TypeScript's narrowing was cleared by the `onImageLoad` method call); these were resolved with an `as unknown as MeasurementLine` cast at the assertion site — a spec-authoring type-checking fix, not a deviation from the plan's intended behavior or scope.

## Issues Encountered

- `pnpm exec tsc` fails in this worktree because the worktree has no local `node_modules` (only the main repo checkout does); Node's own module resolution for `ng test` walks up to the main repo's `node_modules`, but `pnpm exec` does not. Worked around by invoking the main repo's `node_modules/.bin/tsc --noEmit` directly against this worktree's `tsconfig.json`. This is an environment quirk of the worktree-per-agent execution model, not a plan/code issue — no action needed, but noting it here in case the same quirk affects other Phase 5 worktree agents' `pnpm run lint` step.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The harness, fixtures (`mockCustomModel`, `mockCustomAttachment`, `mockServerModel`, `mockCustomPoint`, and the four `editData*` variants), and the `globalSettingsSubject` pattern are all in place in the same file for 05-05 to extend directly with the save paths (`onSave`/`saveCustomItem`/`saveServerCustomPoint`), `onDelete`, `onClose`, and the `unitSubscription`/`adultModeSubscription` teardown assertions.
- Full suite after this plan: 569 specs, 540 passing, 29 failing — the same 29 pre-existing failures as before this plan (0 new failures introduced, 36 new specs added). This plan did not touch `05-TRIAGE.md` (not present in this isolated worktree at the time of execution — it is Wave 0's artifact from `05-01`, expected to be merged separately); the comparison above is against a fresh full-suite run in this worktree, not the triage file itself.
- No blockers for 05-05.

## Self-Check: PASSED

- FOUND: `src/app/components/attachment-edit-modal/attachment-edit-modal.component.spec.ts`
- FOUND: `.planning/phases/05-test-coverage-hardening/05-04-SUMMARY.md`
- FOUND: commit `612ce6e` (Task 1)
- FOUND: commit `12985d5` (Task 2)
- FOUND: commit `5913c20` (Task 3)

---
*Phase: 05-test-coverage-hardening*
*Completed: 2026-08-01*

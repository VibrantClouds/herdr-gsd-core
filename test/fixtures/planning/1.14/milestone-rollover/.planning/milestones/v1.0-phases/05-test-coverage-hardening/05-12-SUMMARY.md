---
phase: 05-test-coverage-hardening
plan: 12
subsystem: testing
tags: [angular, karma, jasmine, canvas, attachment-preview, upload-modal]

# Dependency graph
requires:
  - phase: 05-01
    provides: "05-TRIAGE.md's TEST-02 coverage audit — the measured per-file gap list this plan closes"
  - phase: 05-03
    provides: "ScalingService.calculateImageDimensions characterization used to derive the onCanvasClick add-path's expected coordinates"
  - phase: 05-06
    provides: "upload-modal.component.spec.ts's DI/timing fixes, preserved and extended (not reverted) by this plan"
provides:
  - "attachment-preview.component.ts's canvas interaction surface (onCanvasClick's three dispatch outcomes, onCanvasMouseMove, getHoveredPointName, full ngOnDestroy teardown) under spec"
  - "upload-modal.component.ts's nine previously-unspec'd methods under spec"
  - "TEST-02 marked complete in REQUIREMENTS.md"
  - "attachment-canvas-renderer.service.ts's remaining coverage gap recorded for 05-13 backlog promotion"
affects: [05-13]

actuals:
  tokens: 8432
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Directly-constructed component instances (bypassing TestBed/DI) with Subject-backed stand-in dependencies, used to prove takeUntil(destroy$) teardown for a subscription whose shared-spec-level mock (a completed `of({})`) cannot emit a second value"
    - "Temporary global `Image` constructor substitution (assign-and-restore in beforeEach/afterEach) to deterministically resolve/reject a private method that constructs `new Image()` internally"

key-files:
  created: []
  modified:
    - src/app/components/attachment-preview/attachment-preview.component.spec.ts
    - src/app/components/upload-modal/upload-modal.component.spec.ts
    - .planning/REQUIREMENTS.md

key-decisions:
  - "TEST-02 marked complete: both named files (upload-modal, attachment-preview) now have specs exercising their core logic paths per the requirement's literal text; attachment-canvas-renderer.service.ts's remaining gap is out of TEST-02's textual scope (it names only the two components) and is deferred to 05-13's backlog per this plan's explicit scope ruling."
  - "Split what was authored as two contiguous edits into two separate atomic commits (Task 1: onCanvasClick; Task 2: onCanvasMouseMove/getHoveredPointName/ngOnDestroy teardown) by resetting the file to its pre-plan state and reapplying each task's slice independently, verifying tests pass after each, rather than committing both tasks' additions in one commit."

patterns-established:
  - "When a shared spec-level service mock's observable property is a completed `of({})` and a later plan needs to prove takeUntil(destroy$) teardown for that specific subscription, construct the component directly with Subject-backed stand-ins rather than reconfiguring the shared TestBed module."

requirements-completed: [TEST-02]

coverage:
  - id: D1
    description: "attachment-preview's onCanvasClick dispatches pointDeleted/attachmentPointClicked/customPointAdded correctly and suppresses each correctly, including the add-path's original-image-space bounds check"
    requirement: "TEST-02"
    verification:
      - kind: unit
        ref: "src/app/components/attachment-preview/attachment-preview.component.spec.ts#onCanvasClick"
        status: pass
    human_judgment: false
  - id: D2
    description: "attachment-preview's onCanvasMouseMove hover-set/clear and its three-way disjunctive re-render skip, plus getHoveredPointName's hit/null/no-model/stale cases"
    requirement: "TEST-02"
    verification:
      - kind: unit
        ref: "src/app/components/attachment-preview/attachment-preview.component.spec.ts#onCanvasMouseMove"
        status: pass
      - kind: unit
        ref: "src/app/components/attachment-preview/attachment-preview.component.spec.ts#getHoveredPointName"
        status: pass
    human_judgment: false
  - id: D3
    description: "attachment-preview's ngOnDestroy tears down all 3 takeUntil(destroy$) subscriptions and is safe with no resizeObserver"
    requirement: "TEST-02"
    verification:
      - kind: unit
        ref: "src/app/components/attachment-preview/attachment-preview.component.spec.ts#destroy-then-emit teardown for every takeUntil(destroy$) subscription"
        status: pass
    human_judgment: false
  - id: D4
    description: "upload-modal's nine audited gap methods (onPointPlaced, onImageLoad, formatFileSize, reprocessCurrentFile, toggleUnit, initializeDefaultRuler, getImageDimensions, updateFormForUnitChange, setDefaultHeightValues) each have dedicated specs"
    requirement: "TEST-02"
    verification:
      - kind: unit
        ref: "src/app/components/upload-modal/upload-modal.component.spec.ts#Coverage gap closure (05-TRIAGE.md TEST-02 audit)"
        status: pass
    human_judgment: false

duration: 45min
completed: 2026-08-01
status: complete
---

# Phase 5 Plan 12: Attachment-Preview Canvas + Upload-Modal Coverage Gap Closure Summary

**Closed 05-TRIAGE.md's TEST-02 coverage audit: attachment-preview's onCanvasClick/onCanvasMouseMove/getHoveredPointName/ngOnDestroy dispatch surface and all nine of upload-modal's audited gap methods now have specs, taking the full suite from 650/650 to 693/693 passing with zero failures.**

## Performance

- **Duration:** 45 min
- **Tasks:** 3
- **Files modified:** 4 (2 spec files, REQUIREMENTS.md, 05-TRIAGE.md)

## Accomplishments

- `attachment-preview.component.ts`'s previously-0%-covered canvas interaction surface (`onCanvasClick`'s three dispatch outcomes and every suppression, `onCanvasMouseMove`'s hover state and its three-way disjunctive re-render skip, `getHoveredPointName`'s hit/null/no-model/stale cases) is now under spec — 21 new `it` blocks across `describe('onCanvasClick')` (11), `describe('onCanvasMouseMove')` (6), and `describe('getHoveredPointName')` (4)
- `ngOnDestroy`'s teardown is now fully asserted: the pre-existing `disconnect()` check is preserved, and a destroy-then-emit assertion was added for each of the component's 3 `takeUntil(destroy$)` subscriptions (`customAttachmentPointService.customPoints`, `stateManagementService.globalSettings$`, `canvasRenderer.imageLoaded$`), plus a no-resizeObserver-yet safety check
- `upload-modal.component.ts`'s nine audit-named gap methods (`onPointPlaced`, `onImageLoad`, `formatFileSize`, `reprocessCurrentFile`, `toggleUnit`, `initializeDefaultRuler`, `getImageDimensions`, `updateFormForUnitChange`, `setDefaultHeightValues`) each closed with a dedicated `describe`/`it` block, none of which existed in the pre-existing 560-line spec
- TEST-02 marked complete in REQUIREMENTS.md; `attachment-canvas-renderer.service.ts`'s remaining, larger gap (69.56% func / 37.23% branch) recorded in 05-TRIAGE.md and below for 05-13 backlog promotion, per this plan's explicit out-of-scope ruling
- Full suite verified at 693/693 passing, 0 failures (up from the 650/650 baseline inherited from waves 1-2)

## Task Commits

Each task was committed atomically:

1. **Task 1: Cover onCanvasClick's three dispatch outcomes** - `5304914` (test)
2. **Task 2: Cover onCanvasMouseMove, getHoveredPointName, and ngOnDestroy teardown** - `10b07ab` (test)
3. **Task 3: Close the audited upload-modal gaps** - `ffd1733` (test)

_Note: Tasks 1 and 2 were authored together in a single editing pass touching the same file (attachment-preview.component.spec.ts); to preserve one-commit-per-task atomicity, the file was reset to its pre-plan state and each task's slice was reapplied and independently test-verified before its own commit — see "Deviations" below._

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified

- `src/app/components/attachment-preview/attachment-preview.component.spec.ts` - Added `describe('onCanvasClick')` (11 specs across 3 nested describes: edit-mode delete, normal-mode selection, edit-mode add), `describe('onCanvasMouseMove')` (6 specs including the 4-way re-render-condition describe), `describe('getHoveredPointName')` (4 specs), and extended the existing `ResizeObserver functionality` describe's `ngOnDestroy` coverage with a no-resizeObserver safety check and 3 destroy-then-emit teardown specs (one per `takeUntil(destroy$)` subscription). 13 -> 38 total specs in this file.
- `src/app/components/upload-modal/upload-modal.component.spec.ts` - Added `describe('Coverage gap closure (05-TRIAGE.md TEST-02 audit)')` with one nested describe per audited gap method (9 methods, 18 new `it` blocks). 31 -> 49 total specs in this file.
- `.planning/REQUIREMENTS.md` - Checked off TEST-02

## Decisions Made

- **TEST-02 completion:** Marked complete. The requirement's text names exactly two files (`upload-modal`, `attachment-preview`), both of which now have specs exercising core logic paths per the audit's own gap list. `attachment-canvas-renderer.service.ts` is a third file the audit flagged with the largest gap of all seven targets, but TEST-02's text does not name it, and this plan's explicit scope ruling (from the orchestrator prompt) excludes it from files_modified — deferred to 05-13's backlog instead of silently absorbed here or used to block TEST-02.
- **REQUIREMENTS.md traceability-table convention:** `gsd-tools query requirements.mark-complete TEST-02` reported `not_found` because the traceability table's `Status` column reads `Mapped` for every requirement in this file (never `Pending`/`Gaps Found`/`Complete` for any of the 21 other requirements either, including the already-`[x]`-checked TEST-01/03/04) — the current tool version's stricter checkbox/table reconciliation rejects a bare checkbox flip when a table row exists but isn't in a recognized pre-completion state. Rather than force the table into a state inconsistent with every other row in this project's history, the checkbox was hand-edited to `[x]`, exactly matching the established pattern already present for 21 of the file's 25 requirements (table stays `Mapped`, checkbox is the actual completion signal).
- **Task 1/2 commit split:** Both tasks were authored in one continuous editing pass since they touch the same file contiguously; to honor one-commit-per-task atomicity, the file was `git checkout --`'d back to its pre-plan state and each task's content was reapplied and independently test-verified (24 specs passing after Task 1 alone, 38 after Task 2) before its own commit. No test or production content differs from what a single combined edit would have produced — confirmed byte-identical via diff against a backup of the combined result.

## Deviations from Plan

None (Rules 1-4) - plan executed exactly as written; no bugs found, no missing functionality added, no blocking issues, no architectural changes. The only departure from a literal reading of the plan was mechanical (the commit-split described above), not a change in scope or behavior.

## Deferred coverage — for 05-13 backlog promotion

Per this plan's explicit out-of-scope ruling, `attachment-canvas-renderer.service.ts` was NOT touched by this plan, even though 05-TRIAGE.md's TEST-02 coverage audit flags it as the **largest gap of all seven audited targets** — larger than either file this plan closed:

| Metric | Value |
|---|---|
| Statements | 41.31% (107/259) |
| Branches | 37.23% (35/94) |
| Functions | 69.56% (16/23) |
| Lines | 42.04% (103/245) |

The public API (`render`, `hitTest`, `hoverTest`) is spec'd. The gap is entirely inside `render()`'s internal private helpers, which collectively span ~450 of the file's 655 lines and are only exercised through 3 basic `render` tests that don't pass the optional params (`pendingAttachmentPosition`, `isDefiningAttachmentPoint`, penetration/angle state) driving most of their conditional branches. Uncovered helpers, named specifically so 05-13 can promote this verbatim:

- `renderOverlays`
- `renderPendingAttachment`
- `renderAttachmentPoints`
- `renderAngleIndicator`
- `renderPendingNewPoint`
- `renderCrosshairs`

Also noted per the scope ruling, as a lower-priority deferral: `upload-image-pipeline.service.ts` sits at 57.14% branch coverage (all 7 functions called at least once; likely the worker-vs-fallback dispatch paths and specific error-path branches inside `processFile` are the gap) — smaller than the renderer gap above but still a real, measured shortfall.

This section transcribes the corresponding entry already present in `05-TRIAGE.md`'s `## TEST-02 Coverage Audit` (written by 05-01) — this plan did not modify `05-TRIAGE.md` itself, only this SUMMARY, per the scope ruling's instruction to record the deferral here for 05-13 to promote.

## Issues Encountered

None.

## Next Phase Readiness

- TEST-02 satisfied; no outstanding work against it.
- 05-13 has a concrete, measured backlog item ready to promote (`attachment-canvas-renderer.service.ts`'s render-helper branch coverage), with the exact uncovered method list already enumerated above and in `05-TRIAGE.md`.
- Full suite is at 693/693 passing, 0 failures — the wave's acceptance bar (no regression from the inherited 650/650 baseline) is met.

---
*Phase: 05-test-coverage-hardening*
*Completed: 2026-08-01*

## Self-Check: PASSED

- FOUND: `src/app/components/attachment-preview/attachment-preview.component.spec.ts`
- FOUND: `src/app/components/upload-modal/upload-modal.component.spec.ts`
- FOUND: `.planning/REQUIREMENTS.md`
- FOUND: `.planning/phases/05-test-coverage-hardening/05-12-SUMMARY.md`
- FOUND commit: `5304914`
- FOUND commit: `10b07ab`
- FOUND commit: `ffd1733`

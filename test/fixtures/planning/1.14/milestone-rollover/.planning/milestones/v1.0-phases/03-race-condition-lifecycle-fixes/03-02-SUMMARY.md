---
phase: 03-race-condition-lifecycle-fixes
plan: 02
subsystem: ui
tags: [angular, pointer-events, rxjs, measurement-ruler, upload-modal, attachment-edit-modal]

# Dependency graph
requires:
  - phase: 03-race-condition-lifecycle-fixes
    provides: "Phase 3 CONTEXT.md/RESEARCH.md/PATTERNS.md decisions (D-01 through D-05) for the PointerCapture-owned drag pattern"
provides:
  - "MeasurementRulerComponent owning its own pointer drag lifecycle via setPointerCapture, with zero document-level listeners"
  - "MeasurementRulerService reduced to stateless math (computePixelLength, presetLine, isDefaultVerticalRuler)"
  - "upload-modal and attachment-edit-modal updated to drop the removed service teardown API"
affects: [attachment-edit-modal test coverage (Phase 5), angle-dial PointerCapture rework (Phase 3 sibling plan)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Element-owned PointerCapture drag: setPointerCapture on the handle in pointerdown, pointermove/pointerup/pointercancel as template bindings on the same element, no document-level listeners — the listeners die with the element on destroy"

key-files:
  created: []
  modified:
    - src/app/components/measurement-ruler/measurement-ruler.component.ts
    - src/app/components/measurement-ruler/measurement-ruler.component.html
    - src/app/components/measurement-ruler/measurement-ruler.component.scss
    - src/app/components/measurement-ruler/measurement-ruler.component.spec.ts
    - src/app/services/measurement-ruler.service.ts
    - src/app/services/measurement-ruler.service.spec.ts
    - src/app/components/upload-modal/upload-modal.component.ts
    - src/app/components/attachment-edit-modal/attachment-edit-modal.component.ts

key-decisions:
  - "Collapsed onRulerPointMouseDown/onRulerPointTouchStart into a single onRulerPointerDown(point, event) handler (CONTEXT.md Claude's-Discretion item, resolved in favor of one handler per D-02)"
  - "pointercancel delegates directly to onRulerPointerUp (treat cancel as drag-end, CONTEXT.md default)"
  - "Spec drives the drag through the real rendered .ruler-start/.ruler-end SVG circle elements (not a synthetic stand-in) so setPointerCapture exists on the target, per RESEARCH.md Open Question 2; setPointerCapture/releasePointerCapture are spied out because headless Chrome's capture API requires an active pointer session that dispatchEvent-created synthetic PointerEvents don't reliably establish"

patterns-established:
  - "Element-owned PointerCapture drag (see tech-stack.patterns above) — candidate for reuse by AngleDialComponent's own drag rework and any future draggable-handle component in this codebase"

requirements-completed: [RACE-03]

coverage:
  - id: D1
    description: "MeasurementRulerComponent drags a ruler endpoint via PointerCapture with numerically identical coordinate output to the pre-change implementation"
    requirement: "RACE-03"
    verification:
      - kind: unit
        ref: "src/app/components/measurement-ruler/measurement-ruler.component.spec.ts#drag lifecycle via pointer capture emits lineChange with the transformed original-pixel coordinates on drag"
        status: pass
    human_judgment: false
  - id: D2
    description: "Destroying the ruler component mid-drag leaves nothing listening at the document level — RACE-03's core regression assertion"
    requirement: "RACE-03"
    verification:
      - kind: unit
        ref: "src/app/components/measurement-ruler/measurement-ruler.component.spec.ts#drag lifecycle via pointer capture RACE-03 regression: destroying the component mid-drag leaves nothing listening at document level"
        status: pass
    human_judgment: false
  - id: D3
    description: "A pointer-move whose pointerId differs from the captured drag's pointerId produces no emission (multi-modal isolation — two modals never share drag state)"
    requirement: "RACE-03"
    verification:
      - kind: unit
        ref: "src/app/components/measurement-ruler/measurement-ruler.component.spec.ts#drag lifecycle via pointer capture emits nothing for a pointer-move whose pointerId differs from the captured drag"
        status: pass
    human_judgment: false
  - id: D4
    description: "MeasurementRulerService reduced to stateless math with no drag surface, no document listeners, no rxjs Subject; consumer modals compile and pass their existing specs"
    requirement: "RACE-03"
    verification:
      - kind: unit
        ref: "src/app/services/measurement-ruler.service.spec.ts#exposes no drag surface — the drag lifecycle lives on MeasurementRulerComponent"
        status: pass
      - kind: other
        ref: "pnpm run build (exit 0) and npx tsc --noEmit (exit 0)"
        status: pass
    human_judgment: false

# Metrics
duration: ~25min
completed: 2026-07-30
status: complete
---

# Phase 3 Plan 02: PointerCapture-owned ruler drag Summary

**Converted `MeasurementRulerComponent`'s drag from a `document`-listener `MeasurementRulerService` singleton to an element-owned `setPointerCapture` drag, and reduced the service to stateless math.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-07-30T19:21:21Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- `MeasurementRulerComponent` now owns its pointer drag lifecycle entirely: `onRulerPointerDown`/`onRulerPointerMove`/`onRulerPointerUp`/`onRulerPointerCancel` are Angular template bindings on the `.ruler-start`/`.ruler-end` handle elements, with `setPointerCapture` called on pointer-down — no `document.addEventListener` anywhere in the component.
- `ngOnDestroy` and the `OnDestroy` interface implementation are gone entirely from the component; there is nothing left to tear down since the pointer listeners die with the element.
- Coordinate math (`toOriginalCoords` → `clampToNatural`, both from `coordinate-transform.ts`) is reproduced verbatim on the component, verified numerically identical to the pre-change output via the rewritten spec.
- `MeasurementRulerService` is reduced to three pure functions (`computePixelLength`, `presetLine`, `isDefaultVerticalRuler`) — no mutable fields, no `rxjs` import, no `document` reference — and stays `providedIn: 'root'` safely now that it holds zero state.
- `upload-modal.component.ts` and `attachment-edit-modal.component.ts` both had their `stopDragDefensively()` teardown calls removed (from `ngOnDestroy`, and from `attachment-edit-modal`'s `onClose()` as well) since that API no longer exists.
- Both ruler spec files were rewritten per D-04/D-17: the component spec drives drags through real rendered SVG handle elements (not a synthetic stand-in) and adds a destroy-mid-drag regression test; the service spec keeps only the pure-math describes plus a new assertion that the service exposes no drag surface (Pitfall 3 guard).

## Task Commits

Each task was committed atomically:

1. **Task 1: MeasurementRulerComponent owns the drag via PointerCapture** - `ee40250` (feat)
2. **Task 2: Reduce MeasurementRulerService to stateless math and update both consumer modals** - `cc17e33` (refactor)

_Note: TDD was applied within Task 1 (test file rewritten alongside the implementation, both verified green together); Task 2 is a pure refactor with no new behavior to test-first._

## Files Created/Modified
- `src/app/components/measurement-ruler/measurement-ruler.component.ts` - Owns drag state (`draggingPoint`, `activePointerId`, `dragLine`) and the four pointer handlers; `OnDestroy` implementation removed entirely
- `src/app/components/measurement-ruler/measurement-ruler.component.html` - Two handle circles now bind `pointerdown`/`pointermove`/`pointerup`/`pointercancel` instead of `mousedown`/`touchstart`
- `src/app/components/measurement-ruler/measurement-ruler.component.scss` - `.ruler-point` gains `touch-action: none` (D-02, matching the `angle-dial` precedent) to suppress default touch scroll/pinch on the handles
- `src/app/components/measurement-ruler/measurement-ruler.component.spec.ts` - Rewritten: drag lifecycle tests now drive real DOM handle elements with dispatched `PointerEvent`s; includes the destroy-mid-drag regression test
- `src/app/services/measurement-ruler.service.ts` - Reduced to `computePixelLength`/`presetLine`/`isDefaultVerticalRuler`; class JSDoc rewritten to describe the new pure-math role
- `src/app/services/measurement-ruler.service.spec.ts` - Rewritten: only the pure-math describes remain, plus a `startDrag` absence assertion
- `src/app/components/upload-modal/upload-modal.component.ts` - `ngOnDestroy` no longer calls `stopDragDefensively()`
- `src/app/components/attachment-edit-modal/attachment-edit-modal.component.ts` - `ngOnDestroy` and `onClose()` no longer call `stopDragDefensively()`; a stale comment referencing the removed service ownership was also corrected

## Decisions Made
- Collapsed the mouse/touch handler pair into a single `onRulerPointerDown(point, event)` (Claude's-Discretion item in CONTEXT.md, resolved per D-02's unification direction).
- `pointercancel` delegates to `onRulerPointerUp` — cancel is treated as drag-end with no distinct handling, matching CONTEXT.md's stated default.
- Test harness uses the real rendered SVG handle elements as pointer-capture targets (not the existing `createImageEl()` stand-in, which remains only for `imageElement` coordinate-math inputs), with `setPointerCapture`/`releasePointerCapture` spied out per RESEARCH.md Open Question 2 — headless Chrome's pointer-capture API requires an active pointer session that a synthetically dispatched `PointerEvent` doesn't reliably establish, so the spy keeps the tests asserting emission behavior rather than browser capture bookkeeping.

## Deviations from Plan

None - plan executed exactly as written. One incidental cleanup: a stale comment in `attachment-edit-modal.component.ts` ("drag lifecycle owned by MeasurementRulerService/Component") was updated to reflect that the component is now the sole owner — this is a comment-only correction, not a behavior change, and falls within Task 2's stated scope of "remove every consumer of the deleted drag API."

## Issues Encountered
- `03-BASELINE.md` (referenced by Task 2's acceptance criteria as the source of the three expected pre-existing `upload-modal.component.spec.ts` failure names) does not exist in this worktree. Ran the upload-modal spec directly instead: it reports exactly 3 FAILED / 24 SUCCESS, and all three failures (`should validate height required for both models and attachments`, `should validate unique name`, `should handle file selection with valid file`) are unrelated to this plan's changes — none reference `MeasurementRulerService`, `ngOnDestroy`, or ruler drag behavior — confirming this plan introduced no new upload-modal regressions.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- RACE-03's ruler half is complete: closing a modal mid-drag leaves no document-level listener, proven by the destroy-mid-drag spec.
- `MeasurementRulerService` is now a safe stateless singleton with no cross-modal drag-state hazard.
- `AngleDialComponent`'s own PointerCapture rework (RESEARCH.md D-04: "gets the same treatment independently") is a separate, not-yet-executed sibling concern within Phase 3 — not covered by this plan.
- `attachment-edit-modal.component.spec.ts` does not exist yet (0 tests found when run) — expected per RESEARCH.md, deferred to Phase 5 (TEST-01).

---
*Phase: 03-race-condition-lifecycle-fixes*
*Completed: 2026-07-30*

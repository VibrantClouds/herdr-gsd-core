---
phase: 03-race-condition-lifecycle-fixes
plan: 03
subsystem: ui
tags: [angular, pointer-events, drag, race-condition, angle-dial, attachment-edit-modal]

# Dependency graph
requires: []
provides:
  - "AngleDialComponent drag ownership moved from document listeners to element-owned Pointer Capture"
  - "Destroy-mid-drag regression test proving no listener escapes the dial component's lifetime"
affects: [03-race-condition-lifecycle-fixes, attachment-edit-modal]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Element-owned PointerCapture drag: setPointerCapture on the interactive element itself removes the need for document-level listeners or an OnDestroy teardown hook"

key-files:
  created: []
  modified:
    - src/app/components/angle-dial/angle-dial.component.ts
    - src/app/components/angle-dial/angle-dial.component.html
    - src/app/components/angle-dial/angle-dial.component.spec.ts

key-decisions:
  - "pointercancel delegates directly to onDialPointerUp (treat cancel as drag-end), per CONTEXT.md's Claude's-Discretion default"
  - "Kept the dial structurally independent of MeasurementRulerComponent/Service per Phase 1's D-01 asymmetry note — no shared drag service introduced"

patterns-established:
  - "Element-owned PointerCapture drag pattern (see angle-dial.component.ts) as the template for any future drag-implementing component in this codebase, in place of document-level mouse/touch listener pairs"

requirements-completed: [RACE-03]

coverage:
  - id: D1
    description: "AngleDialComponent drag ownership converted from document mouse/touch listeners to element-owned PointerCapture (pointerdown/pointermove/pointerup/pointercancel), preserving identical emitted angles"
    requirement: "RACE-03"
    verification:
      - kind: unit
        ref: "src/app/components/angle-dial/angle-dial.component.spec.ts#emits angleChange with 0 when the pointer is directly right of center"
        status: pass
      - kind: unit
        ref: "src/app/components/angle-dial/angle-dial.component.spec.ts#emits angleChange with ~90 (rounded to nearest 5) when the pointer is directly below center"
        status: pass
      - kind: unit
        ref: "src/app/components/angle-dial/angle-dial.component.spec.ts#drag lifecycle via pointer capture > produces the emission sequence [0, 90] across a pointer-down + pointer-move pair"
        status: pass
      - kind: unit
        ref: "src/app/components/angle-dial/angle-dial.component.spec.ts#handles direct numeric entry via onManualAngleInput"
        status: pass
    human_judgment: false
  - id: D2
    description: "Destroying the dial component mid-drag leaves nothing listening at the document level (RACE-03 regression)"
    requirement: "RACE-03"
    verification:
      - kind: unit
        ref: "src/app/components/angle-dial/angle-dial.component.spec.ts#drag lifecycle via pointer capture > RACE-03 regression: destroying the component mid-drag leaves nothing listening at the document level"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-07-30
status: complete
---

# Phase 03 Plan 03: AngleDialComponent Pointer Capture Migration Summary

**Converted `AngleDialComponent` from four `document`-level mouse/touch listeners to element-owned PointerCapture drag, eliminating the RACE-03 leak-on-destroy hazard while preserving identical emitted angle behavior.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-07-30T19:02:00Z
- **Completed:** 2026-07-30T19:17:46Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- `AngleDialComponent` no longer registers or removes any `document`-level listener; drag is captured entirely on the `.angle-dial` element via `setPointerCapture`/`releasePointerCapture`
- Removed the `OnDestroy` implementation entirely — pointer capture ends automatically when the element is destroyed, so there is nothing left to tear down
- `angle-dial.component.spec.ts` rewritten to dispatch real `PointerEvent`s and includes a destroy-mid-drag regression test proving a post-destroy `document` `pointermove` produces no further `angleChange` emission
- Angle math (`calculateAndSetAngle`, `onManualAngleInput`) left completely untouched — emitted angles are numerically identical to the pre-change implementation
- Dial remains structurally independent of `MeasurementRulerComponent`/`MeasurementRulerService` (no import added)

## Task Commits

Each task was committed atomically:

1. **Task 1: AngleDialComponent owns the drag via PointerCapture** - `43f4ca5` (feat)
2. **Task 2: Rewrite angle-dial.component.spec.ts for the pointer-capture lifecycle** - `89b728d` (test)

**Plan metadata:** commit pending (docs: complete plan)

## Files Created/Modified
- `src/app/components/angle-dial/angle-dial.component.ts` - Replaced document-listener drag (`onDialMouseDown`, `onDialTouchStart`, `onDialMove`, `onDialEnd`, `removeDialListeners`, `updateAngleFromTouchEvent`) with `onDialPointerDown`/`onDialPointerMove`/`onDialPointerUp`/`onDialPointerCancel` and `activePointerId`; dropped `OnDestroy`
- `src/app/components/angle-dial/angle-dial.component.html` - Replaced `(mousedown)`/`(touchstart)` bindings on `.angle-dial` with `(pointerdown)`/`(pointermove)`/`(pointerup)`/`(pointercancel)`
- `src/app/components/angle-dial/angle-dial.component.spec.ts` - Rewritten to dispatch `PointerEvent`s on the rendered element; added drag-lifecycle describe block covering emission sequencing, mismatched pointerId, post-pointer-up, pointercancel, and the RACE-03 destroy-mid-drag regression; removed the old `afterEach` teardown and the two document-listener-specific tests

## Decisions Made
- `onDialPointerCancel` delegates directly to `onDialPointerUp` — cancel is treated as drag-end, matching CONTEXT.md's stated default for this ambiguous case
- Used the existing `@ViewChild('angleDial')` element (not `event.currentTarget`) as the capture/release/rect target, per the plan's explicit rationale (stays addressable when a spec invokes the handler directly)
- Stubbed `setPointerCapture`/`hasPointerCapture`/`releasePointerCapture` in the spec since headless Chromium under Karma may reject capture calls on a detached-from-real-input test element; the stub only affects capture bookkeeping, not the emission assertions under test

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. `npx tsc --noEmit` exits 0, `pnpm run build` exits 0 (with only a pre-existing bundle-size budget warning unrelated to this change), and the targeted spec run reports `10 SUCCESS` / `0 FAILED` (exceeding the required minimum of 8 specs).

One verification item from the plan's acceptance criteria could not be checked in this isolated worktree: "The full-suite failing-name set remains a subset of `03-BASELINE.md`'s recorded list." `03-BASELINE.md` is produced by sibling plan 03-01, which executes in a separate parallel worktree in the same wave and had not been merged at the time this plan ran. The targeted spec file itself is fully green (0 FAILED), and no other spec file was touched by this plan, so no new failures were introduced. The orchestrator should re-run the full-suite comparison against `03-BASELINE.md` after all wave-1 worktrees merge.

## Next Phase Readiness
- The dial half of ROADMAP Success Criterion 3 (closing the edit modal mid-drag leaves no document-level listener responding to a subsequent unrelated drag) is satisfied and regression-tested.
- No blockers for downstream plans; `AngleDialComponent`'s public API (`angle` input, `angleChange` output, `onManualAngleInput`) is unchanged, so `attachment-edit-modal` requires no changes.

---
*Phase: 03-race-condition-lifecycle-fixes*
*Completed: 2026-07-30*

## Self-Check: PASSED

All created/modified files verified present on disk; both task commits (`43f4ca5`, `89b728d`) verified present in git history.

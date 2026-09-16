---
phase: 05-test-coverage-hardening
plan: 07
subsystem: testing
tags: [angular, karma, jasmine, compare-modal]

# Dependency graph
requires:
  - phase: 05-test-coverage-hardening (05-01)
    provides: "05-TRIAGE.md — the authoritative 29-row failure disposition table with verdict and evidence per failure"
provides:
  - "CompareModalComponent Horizontal Flip and On Top Toggle specs repointed at the current pod-toggle/on-top-chip DOM, closing 9 of the 29 baseline failures with zero new failures"
affects: [05-test-coverage-hardening]

# Actuals (#2632)
actuals:
  tokens: 1596
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Container-scoped selectors (`.pod.left .pod-toggle`) instead of bare class or index-based queryAll — survives a left/right pod reorder"
    - "spyOn(...).and.callThrough() to assert both that a handler fired and that its real side effect (state mutation) happened, in one spec"

key-files:
  created: []
  modified:
    - src/app/components/compare-modal/compare-modal.component.spec.ts

key-decisions:
  - "Kept flip and on-top-chip active-state specs asserting the template's real bound classes (`is-on`, `.dot.left`/`.dot.right`) rather than the old spec's invented class names (`active`, `left-flip`)"
  - "Did not touch component.ts, compare-modal.component.html, or POSITION_BUFFER logic — 05-TRIAGE.md verdicts for all 9 rows were spec-wrong, not code-wrong"

patterns-established:
  - "Pattern: when a control's side is expressed by which container it lives in (not by a side-specific CSS class on the control itself), scope the selector through the container rather than adding a fabricated class or relying on DOM-order indexing"

requirements-completed: [TEST-02]

coverage:
  - id: D1
    description: "The five Horizontal Flip specs (display, active-class x2, click-handler x2) pass against the current .pod-toggle controls, plus a new negative case for the no-models-selected state"
    requirement: "TEST-02"
    verification:
      - kind: unit
        ref: "src/app/components/compare-modal/compare-modal.component.spec.ts#Horizontal Flip"
        status: pass
    human_judgment: false
  - id: D2
    description: "The four On Top Toggle specs (display, active-state x2, click-handler) pass against the current .on-top-chip control, with the click spec now asserting leftOnTop actually inverts"
    requirement: "TEST-02"
    verification:
      - kind: unit
        ref: "src/app/components/compare-modal/compare-modal.component.spec.ts#On Top Toggle"
        status: pass
    human_judgment: false
  - id: D3
    description: "Both pod-toggle flip controls and the on-top chip are user-visible; D-16's end-of-phase UAT must click each in the running app and confirm the images actually flip / swap z-order, since this plan's fix proves only that the specs match the template"
    human_judgment: true
    rationale: "A spec-side selector fix proves the spec matches the template, not that the template's visual/interactive behavior is correct. Only manual UAT in the running app confirms the flip and z-index swap are visually correct."

duration: 15min
completed: 2026-08-01
status: complete
---

# Phase 05 Plan 07: CompareModalComponent Selector Rot Summary

**Repointed 9 failing `CompareModalComponent` specs from stale `.flip-button`/`.on-top-control` selectors onto the current `.pod-toggle`/`.on-top-chip` DOM, dropping the phase's inherited failure count from 29 to 20 with zero new failures.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-08-01T21:35:00Z (approx)
- **Completed:** 2026-08-01T21:50:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- All five Horizontal Flip specs now query `.pod.left .pod-toggle` / `.pod.right .pod-toggle` (container-scoped, not index-based), asserting the template's real `is-on` class, plus a new negative-case spec confirming the toggles are absent when no models are selected
- All four On Top Toggle specs now query the single `.on-top-chip` control and its `.dot` state, restating the old two-button active-state claims in terms of the current single-chip design; the click spec uses `spyOn(...).and.callThrough()` to assert both the handler call and the resulting `leftOnTop` inversion
- Full suite run confirms exactly the expected math: 592 baseline specs + 1 new spec = 593 total; 29 failing − 9 fixed = 20 failing; 563 passing + 9 fixed + 1 new = 573 passing — no regressions introduced

## Task Commits

Each task was committed atomically:

1. **Task 1: Repoint the Horizontal Flip specs at the pod toggle controls** - `b57bae6` (test)
2. **Task 2: Repoint the On Top Toggle specs at the on-top chip** - `018c750` (test)

_Note: both tasks were pure spec-side fixes per 05-TRIAGE.md's `spec-wrong` verdicts; no `feat`/`fix` commits were needed since no production code changed._

## Files Created/Modified
- `src/app/components/compare-modal/compare-modal.component.spec.ts` - Repointed 9 selectors from removed classes (`.flip-button`, `.flip-button.left-flip`, `.flip-button.right-flip`, `.on-top-control`, `.label-left`, `.label-right`, `.slide-toggle`) onto the current pod-toggle and on-top-chip DOM; added one new negative-case spec for the no-models-selected state

## Decisions Made
- Used the template's actual bound classes (`is-on`, `.dot.left`/`.dot.right`) instead of carrying forward the old spec's fabricated class names (`active`, `left-flip`) — per the plan's explicit instruction to read the exact bound class from the template
- Scoped flip-toggle queries through `.pod.left`/`.pod.right` rather than indexing into a `queryAll('.pod-toggle')` result, so a future pod reorder fails the test instead of silently passing (mitigates T-05-07-02 from the plan's threat model)
- Used `spyOn(component, 'toggleOnTop').and.callThrough()` for the on-top click spec so a single spec could assert both "the handler was invoked" and "the handler's real effect (leftOnTop inversion) occurred" — addresses the plan's note that the original spec asserted only the call, not the effect

## Deviations from Plan

None - plan executed exactly as written. Both tasks matched their described `<action>` and `<acceptance_criteria>` blocks; no template or component-code changes were required since 05-TRIAGE.md had already adjudicated all 9 rows as `spec-wrong`.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Both fixed control clusters (pod flip toggles, on-top chip) are user-visible and are flagged in this summary's `coverage: D3` entry for D-16's end-of-phase UAT — click each in the running app and confirm the image actually flips / the z-order actually swaps.
- The `POSITION_BUFFER` / image-dimension specs in this same file were read but not modified, and remain green.
- Remaining phase-level failure count after this plan: 20 (down from the 29-row baseline in 05-TRIAGE.md), consistent with this plan's 9-row assignment.

---
*Phase: 05-test-coverage-hardening*
*Completed: 2026-08-01*

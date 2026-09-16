---
phase: 03-race-condition-lifecycle-fixes
plan: 07
subsystem: state
tags: [angular, rxjs, race-condition, auto-save, model-attachment-defaults]

# Dependency graph
requires:
  - phase: 03-race-condition-lifecycle-fixes
    provides: "03-05's cached-dimension ResizeObserver rewrite of compare-modal.component.ts, which left applyDefaultOverlays as the file's one remaining setTimeout for this plan to remove"
provides:
  - "ModelAttachmentDefaultsService.applyDefaults(apply) — a callback-window API that suppresses auto-save for exactly the duration of apply(), closing deterministically via queueMicrotask instead of a guessed millisecond delay"
  - "Both applyDefaultOverlays call sites (compare-modal, comparison-panel) migrated off the hand-rolled setApplyingDefaults/setTimeout(...,100) pattern"
affects: [03-08 (phase close-out reconciliation)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "queueMicrotask-bounded suppression window: raise a flag, run a caller callback synchronously (all its BehaviorSubject.next() emissions run inline), then clear the flag from a finally-scheduled microtask — closes at the first provably-safe moment instead of guessing a duration, and stays exception-safe because the clear lives in `finally`"

key-files:
  created: []
  modified:
    - src/app/services/model-attachment-defaults.service.ts
    - src/app/services/model-attachment-defaults.service.spec.ts
    - src/app/components/compare-modal/compare-modal.component.ts
    - src/app/components/compare-modal/compare-modal.component.spec.ts
    - src/app/components/comparison-panel/comparison-panel.component.ts

key-decisions:
  - "Reworded the applyDefaults JSDoc to avoid literally quoting the filter(() => !this.isApplyingDefaults) guard expression — the docstring's original wording made the acceptance-criteria grep count 2 instead of 1 for that guard string. Rewording (filter-on-isApplyingDefaults instead of the literal code) preserves the explanatory value while keeping the guard's canonical occurrence unique to the actual guard line."

patterns-established:
  - "queueMicrotask-bounded suppression window for BehaviorSubject-driven auto-save guards"

requirements-completed: [RACE-02]

coverage:
  - id: D1
    description: "ModelAttachmentDefaultsService.applyDefaults(apply) raises isApplyingDefaults for the callback, stays raised synchronously after apply() returns, and clears only after the microtask queue drains"
    requirement: "RACE-02"
    verification:
      - kind: unit
        ref: "src/app/services/model-attachment-defaults.service.spec.ts#applyDefaults should raise the flag inside the callback"
        status: pass
      - kind: unit
        ref: "src/app/services/model-attachment-defaults.service.spec.ts#applyDefaults should leave the flag raised immediately after returning (same synchronous turn)"
        status: pass
      - kind: unit
        ref: "src/app/services/model-attachment-defaults.service.spec.ts#applyDefaults should lower the flag after the microtask queue drains"
        status: pass
    human_judgment: false
  - id: D2
    description: "The suppression window is exception-safe: a throwing callback still propagates to the caller AND the flag lowers after the microtask drain — it can never get stuck raised"
    requirement: "RACE-02"
    verification:
      - kind: unit
        ref: "src/app/services/model-attachment-defaults.service.spec.ts#applyDefaults should propagate a thrown error AND still lower the flag after the drain"
        status: pass
    human_judgment: false
  - id: D3
    description: "Calling applyDefaults twice in a row leaves the flag lowered after each drain (no leak across repeated calls)"
    requirement: "RACE-02"
    verification:
      - kind: unit
        ref: "src/app/services/model-attachment-defaults.service.spec.ts#applyDefaults should leave the flag lowered after the drain when called twice in a row"
        status: pass
    human_judgment: false
  - id: D4
    description: "Both applyDefaultOverlays call sites (compare-modal.component.ts, comparison-panel.component.ts) use the new applyDefaults API; no deferred-timer call or raw setApplyingDefaults reference remains anywhere under src/app"
    requirement: "RACE-02"
    verification:
      - kind: unit
        ref: "src/app/components/compare-modal/compare-modal.component.spec.ts (34 total, 9 pre-existing FAILED, 25 SUCCESS — 0 new failures)"
        status: pass
      - kind: other
        ref: "grep -c 'setTimeout' compare-modal.component.ts and comparison-panel.component.ts both return 0; grep -rn 'setApplyingDefaults' src/app returns no matches"
        status: pass
    human_judgment: false

duration: 10min
completed: 2026-07-30
status: complete
---

# Phase 3 Plan 07: Deterministic applyDefaults Window for ModelAttachmentDefaultsService Summary

**Replaced two duplicate `setApplyingDefaults(true)`/`setTimeout(...,100)`/`setApplyingDefaults(false)` auto-save suppression windows with a single service-owned `applyDefaults(apply)` API that closes deterministically via `queueMicrotask`, verified with `fakeAsync`/`tick(0)` instead of wall-clock timing.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-07-30T15:31:31-04:00 (base commit)
- **Completed:** 2026-07-30T15:39:29-04:00
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- `ModelAttachmentDefaultsService.applyDefaults(apply: () => void)` raises `isApplyingDefaults`, runs `apply()` inside a `try`, and clears the flag from a `finally`-scheduled `queueMicrotask` — the window closes at the first moment every synchronous `BehaviorSubject.next()` emission the callback triggers has already passed through `setupAutoSave`'s guard, with no guessed duration
- Deleted the raw `setApplyingDefaults` setter now that both callers have migrated — no remaining path for a future caller to raise the flag without scheduling a clear
- Both `applyDefaultOverlays` call sites (`compare-modal.component.ts`, `comparison-panel.component.ts`) now wrap their overlay-application loop in `attachmentDefaultsService.applyDefaults(() => { ... })`; loop bodies are byte-identical to before
- `compare-modal.component.ts` now has zero `setTimeout` calls — the file's last deferred-timer call (flagged as remaining work by 03-05-SUMMARY) is gone
- 5 new specs on `applyDefaults` (raised-inside-callback, still-raised-synchronously-after-return, lowered-after-drain, throwing-callback-still-clears, called-twice-leaves-lowered) drive the microtask boundary with `fakeAsync`/`tick(0)`

## Task Commits

1. **Task 1: Add the deterministic applyDefaults window to ModelAttachmentDefaultsService** - `5807343` (feat)
2. **Task 2: Migrate both applyDefaultOverlays call sites to the new API** - `2c97a85` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `src/app/services/model-attachment-defaults.service.ts` - New `applyDefaults(apply)` public method; `setApplyingDefaults` setter removed
- `src/app/services/model-attachment-defaults.service.spec.ts` - `describe('setApplyingDefaults')` replaced with `describe('applyDefaults')` (5 specs using `fakeAsync`/`tick(0)`)
- `src/app/components/compare-modal/compare-modal.component.ts` - `applyDefaultOverlays` rewritten to call `attachmentDefaultsService.applyDefaults(() => { ... })`; raised-flag call, `try`/`finally`, and `setTimeout` deferred-lower all removed
- `src/app/components/compare-modal/compare-modal.component.spec.ts` - `jasmine.createSpyObj('ModelAttachmentDefaultsService', [...])` method list updated: `'setApplyingDefaults'` → `'applyDefaults'`
- `src/app/components/comparison-panel/comparison-panel.component.ts` - Identical `applyDefaultOverlays` transformation, preserving this method's own loop shape (scale update inside each `panelSide` branch)

## Decisions Made
- Reworded one sentence of the `applyDefaults` JSDoc so it no longer literally quotes `filter(() => !this.isApplyingDefaults)` — the plan's acceptance criterion expects that exact string to appear exactly once (the real guard line in `setupAutoSave`), and quoting it verbatim in the new method's docstring would have produced a second match. The explanatory content (which RxJS stage the microtask closes ahead of) is preserved with `filter-on-isApplyingDefaults` phrasing instead.

## Deviations from Plan

None - plan executed exactly as written. The JSDoc rewording above was caught and corrected before verification, not a deviation from delivered behavior — it's a documentation-only tweak to satisfy the plan's own acceptance-criteria grep pattern.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `npx tsc --noEmit` exits 0.
- `pnpm run build` exits 0 (777.27 kB initial bundle — same pre-existing 27.27 kB budget-overage warning as the 03-BASELINE.md/03-05-SUMMARY.md baseline, not a new regression).
- `model-attachment-defaults.service.spec.ts`: 21/21 SUCCESS (17 pre-existing + new `applyDefaults` block).
- `compare-modal.component.spec.ts` (isolation run): 34 total, 9 FAILED, 25 SUCCESS — all 9 failures are the pre-existing `Horizontal Flip`/`On Top Toggle` DOM-selector-drift specs already catalogued in `03-BASELINE.md`'s 50-name list and `03-05-SUMMARY.md`'s deferred-items log; not touched by this plan.
- Full suite: 444 total, 29 FAILED, 415 SUCCESS. All 29 failing names cross-checked as an exact subset of `03-BASELINE.md`'s 50-name baseline list — no new regressions. (444 = the base's 440 total + 4 new `applyDefaults` specs; 415 = 411 + 4; failed count unchanged at 29.)
- No `setTimeout` calls remain in `compare-modal.component.ts` or `comparison-panel.component.ts`; no `setApplyingDefaults` references remain anywhere under `src/app`.
- This plan touches no serialized structure (`ExportedState`/`AppState`/`ImageModel`/etc.) — `state-export.service.ts`'s `CURRENT_VERSION` intentionally left at `1.0.11` per `.claude/rules/state-serialization.md`'s "changes to how already-serialized data is applied... do not owe a bump" test; `applyDefaults` only changes when an in-memory guard flag clears, not any persisted shape.

---
*Phase: 03-race-condition-lifecycle-fixes*
*Completed: 2026-07-30*

## Self-Check: PASSED

- FOUND: .planning/phases/03-race-condition-lifecycle-fixes/03-07-SUMMARY.md
- FOUND: src/app/services/model-attachment-defaults.service.ts
- FOUND: src/app/components/compare-modal/compare-modal.component.ts
- FOUND commit: 5807343
- FOUND commit: 2c97a85

---
phase: 03-race-condition-lifecycle-fixes
plan: 04
subsystem: ui
tags: [angular, rxjs, signals, penetration-modal, race-condition, toObservable]

# Dependency graph
requires: []
provides:
  - "PenetrationModalComponent driven by a signal `isOpen` input instead of `@Input() isOpen` + `ngOnChanges`"
  - "Single source of panel state (state service) inside PenetrationModalComponent — no dual @Input/internal-state fallback"
  - "Reference implementation of toObservable(signal) -> switchMap -> state-service RxJS chain with custom distinctUntilChanged, torn down via takeUntil(destroy$)"
affects: [03-race-condition-lifecycle-fixes]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "toObservable(input signal) built in the constructor (injection context), piped through switchMap to a service Observable, deduped with a field-level distinctUntilChanged comparator, torn down with takeUntil(destroy$)"

key-files:
  created: []
  modified:
    - src/app/components/penetration-modal/penetration-modal.component.ts
    - src/app/components/penetration-modal/penetration-modal.component.html
    - src/app/components/penetration-modal/penetration-modal.component.spec.ts
    - src/app/app.component.html

key-decisions:
  - "isOpen migrated to input(false); showContent, transforms, and dimension fields intentionally NOT migrated to signals (D-13's stated scope)"
  - "distinctUntilChanged placed on the inner (post-switchMap) observable, not chained after switchMap, so the dedupe window resets on each reopen"
  - "leftPanelState/rightPanelState @Inputs deleted entirely; app.component.html's <app-penetration-modal> binding trimmed to isOpen/close only"

patterns-established:
  - "Signal input -> toObservable -> switchMap -> state-service Observable, deduped with a custom field-level comparator, torn down via takeUntil(destroy$) — second in-repo instance of this pattern (first: model-attachment-defaults.service.ts's panelDataEqual for a plain state.pipe() subscription, not a signal-input-driven one)"

requirements-completed: [RACE-01]

coverage:
  - id: D1
    description: "Modal content becomes visible immediately on isOpen becoming true (no 300ms timer gating the read)"
    requirement: "RACE-01"
    verification:
      - kind: unit
        ref: "src/app/components/penetration-modal/penetration-modal.component.spec.ts#shows content immediately when isOpen becomes true"
        status: pass
    human_judgment: false
  - id: D2
    description: "Modal follows state changes made while open (overlay/model/scale changes) instead of freezing at open-time state"
    requirement: "RACE-01"
    verification:
      - kind: unit
        ref: "src/app/components/penetration-modal/penetration-modal.component.spec.ts#follows state changes made while open"
        status: pass
    human_judgment: false
  - id: D3
    description: "Closing the modal (isOpen -> false) tears down the state subscription and clears internal panel state"
    requirement: "RACE-01"
    verification:
      - kind: unit
        ref: "src/app/components/penetration-modal/penetration-modal.component.spec.ts#clears content and internal state when isOpen becomes false"
        status: pass
    human_judgment: false
  - id: D4
    description: "Destroying the component stops all further state-service-driven work (no leaked subscription)"
    requirement: "RACE-01"
    verification:
      - kind: unit
        ref: "src/app/components/penetration-modal/penetration-modal.component.spec.ts#stops responding to state emissions after destroy"
        status: pass
    human_judgment: false
  - id: D5
    description: "Custom distinctUntilChanged comparator suppresses redundant recalculation for structurally-equal (but referentially distinct) state emissions"
    requirement: "RACE-01"
    verification:
      - kind: unit
        ref: "src/app/components/penetration-modal/penetration-modal.component.spec.ts#does not re-run calculatePositions for an equivalent state emission"
        status: pass
    human_judgment: false
  - id: D6
    description: "Panel state has exactly one source (state service) — leftPanelState/rightPanelState @Inputs removed structurally"
    requirement: "RACE-01"
    verification:
      - kind: unit
        ref: "src/app/components/penetration-modal/penetration-modal.component.spec.ts#does not declare leftPanelState / rightPanelState inputs"
        status: pass
      - kind: other
        ref: "pnpm run build (AOT compile) — proves app.component.html no longer binds the removed inputs"
        status: pass
    human_judgment: false

# Metrics
duration: 35min
completed: 2026-07-30
status: complete
---

# Phase 3 Plan 4: Penetration Modal Signal-Input Lifecycle Summary

**Replaced `PenetrationModalComponent`'s 300ms-timer-gated one-shot state fetch with a `toObservable(isOpen signal) -> switchMap -> state service` RxJS chain, deduped with a field-level `distinctUntilChanged` comparator and torn down via `takeUntil(destroy$)`.**

## Performance

- **Duration:** 35 min
- **Started:** 2026-07-30T18:47:00Z
- **Completed:** 2026-07-30T19:22:05Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- `isOpen` is now a signal input (`input(false)`); the two-source `@Input() leftPanelState`/`@Input() rightPanelState` fallback is deleted entirely — the state service is the component's single source of panel state
- Modal content becomes visible in the same change-detection turn `isOpen` flips true (D-10) instead of after an arbitrary 300ms
- While open, the modal now follows live state changes (overlay added/removed, scale changed) instead of freezing at open-time state (D-11)
- Closing the modal or destroying the component tears down the state subscription via `switchMap`-to-`EMPTY` / `takeUntil(destroy$)` — no leaked subscription
- Expanded `penetration-modal.component.spec.ts` from 1 test (construction only) to 7 tests covering immediate visibility, live-follow, teardown-on-close, teardown-on-destroy, dedupe, and the structural removal of the two `@Input`s

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace ngOnChanges + timer with a signal input and a live, torn-down state subscription** - `caf2ef0` (feat)
2. **Task 2: Expand penetration-modal.component.spec.ts to cover the new lifecycle** - `65c7810` (test)

**Plan metadata:** committed together with this SUMMARY (worktree mode — orchestrator handles the final metadata commit after merge)

## Files Created/Modified
- `src/app/components/penetration-modal/penetration-modal.component.ts` - `isOpen` signal input, constructor-built `toObservable`/`switchMap`/`distinctUntilChanged`/`takeUntil` chain, `panelStateEqual`/`singlePanelStateEqual` comparators, deleted `getEffectiveLeftState`/`getEffectiveRightState` and the dual-source fallback in all five consumers
- `src/app/components/penetration-modal/penetration-modal.component.html` - `isOpen` template reads changed from property to signal-call syntax (`isOpen()`)
- `src/app/components/penetration-modal/penetration-modal.component.spec.ts` - expanded from 1 to 7 tests covering the new lifecycle
- `src/app/app.component.html` - `<app-penetration-modal>` binding trimmed to `[isOpen]`/`(close)`; the identically-named bindings on the neighboring `<app-compare-modal>` element were left untouched (that component still declares those inputs)

## Decisions Made
- `distinctUntilChanged` is placed on the *inner* observable returned from `switchMap` (bound to `this.stateManagementService.state`), not chained after `switchMap` on the whole chain — per RESEARCH.md, this resets the dedupe window each time the modal reopens rather than suppressing the first emission of a new session.
- Per D-13, only `isOpen` was migrated to a signal; `showContent`, the transform/dimension fields, and everything else stayed as plain component fields — no broader signals migration was attempted.
- The measurement-unit subscription (previously set up conditionally inside `ngOnChanges`) was moved into the constructor as an unconditional `takeUntil(destroy$)`-scoped subscription, replacing the manual `unitSubscription` field/`unsubscribe()` pair.

## Deviations from Plan

None - plan executed exactly as written. All acceptance criteria (grep checks, `tsc --noEmit`, `pnpm run build`, isolated spec run) passed without needing any Rule 1-3 auto-fixes.

## Issues Encountered

**Missing `03-BASELINE.md`.** The plan's Task 2 acceptance criteria and `<verification>` section reference `.planning/phases/03-race-condition-lifecycle-fixes/03-BASELINE.md`'s recorded failing-test list as the subset check for the full suite. That file does not exist anywhere in `.planning/` for this phase (only `01-component-decomposition/01-BASELINE.md` exists, for a different phase). Since a subset comparison against a nonexistent file isn't possible, I instead ran the full suite (`347 passing / 50 pre-existing failures`) and confirmed by grepping the failure output that none of the 50 failures reference `PenetrationModalComponent`, `app.component`, or any file this plan touched — the pre-existing failures are `HttpClient` DI gaps in `compare-modal` specs, `NG0100` in `image-display` specs, and IndexedDB `QuotaExceededError` in `user-model` specs, all unrelated to RACE-01. The isolated `penetration-modal.component.spec.ts` run is 7/7 green.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `PenetrationModalComponent` now has exactly one source of panel state and no timer-gated reads, satisfying ROADMAP Success Criterion 1 for RACE-01.
- No blockers for other wave-1 plans in this phase; this plan's changes are isolated to `penetration-modal` and the single `<app-penetration-modal>` binding site in `app.component.html`.

---
*Phase: 03-race-condition-lifecycle-fixes*
*Completed: 2026-07-30*

## Self-Check: PASSED

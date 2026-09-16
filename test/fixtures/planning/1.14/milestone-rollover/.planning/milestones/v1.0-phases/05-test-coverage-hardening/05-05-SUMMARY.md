---
phase: 05-test-coverage-hardening
plan: 05
subsystem: testing
tags: [angular, jasmine, karma, reactive-forms, attachment-system, adult-mode]

# Dependency graph
requires:
  - phase: 05-test-coverage-hardening
    provides: "attachment-edit-modal.component.spec.ts's TestBed harness, fixtures, and BehaviorSubject-backed globalSettings$ stand-in (05-04)"
provides:
  - "attachment-edit-modal.component.spec.ts — the write half: all three onSave editType paths with exact-payload assertions, onDelete/onClose, adult-mode-gated branches, and destroy-then-emit subscription teardown proof"
affects: [test-coverage-hardening]

actuals:
  tokens: 6608
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Call-order tracking via callFake pushing markers into a shared array, used to prove updateUserModel runs before updateOverlaysForAttachment (two independent toHaveBeenCalled assertions can't establish ordering)."
    - "Destroy-then-emit assertion for manual Subscription teardown: push a value, assert the bound field changed; call ngOnDestroy(); push another value; assert the field did NOT change. Spying on Subscription.prototype.unsubscribe would pass even if the handler still fired."
    - "spyOn(window, 'confirm') rather than direct reassignment, so Jasmine auto-restores the global always-true stub from src/test-setup.ts at spec end instead of leaking a false-returning override into later spec files in the same Karma run."

key-files:
  created: []
  modified:
    - src/app/components/attachment-edit-modal/attachment-edit-modal.component.spec.ts

key-decisions:
  - "Drove every save case through the real sequence (ngOnChanges to populate, onPointPlaced/onImageLoad where the branch needs it, patchValue for the specific scenario, then await onSave()) rather than calling private save methods directly — matches D-10/D-11's intent that these assertions prove the three editType branches construct the right payload, not merely that they dispatch to the right method."
  - "Adult-mode-dependent form values are always set via globalSettingsSubject.next(...) BEFORE the ngOnChanges population call in each test, because ngOnInit's unitSubscription rebuilds editForm (via initializeForm()) on every globalSettings$ emission — patching form values before that rebuild would be silently discarded."
  - "Read circumference-undefined-but-present via Object.prototype.hasOwnProperty.call rather than toEqual, since the component's saveCustomItem always explicitly assigns updates.circumference = undefined in that branch (never omits the key) — hasOwnProperty is what actually distinguishes 'assigned undefined' from 'omitted'."

patterns-established:
  - "Fresh TestBed.createComponent(...) instance (no detectChanges) reused across three specs — isDickAttachmentChecked/isPenetrationZoneChecked-before-ngOnInit, and ngOnDestroy-before-ngOnInit — to exercise the optional-chained getter/lifecycle-safety guards without needing to fabricate a half-initialized component by hand."

requirements-completed: [TEST-01]

coverage:
  - id: D1
    description: "All three onSave editType paths (custom_model, custom_attachment, server_custom_point) driven end-to-end with exact-payload assertions against the service each one persists to, including the hardcoded attachment-point-id substitution surviving a differing incoming id, the measurement-line default-vs-custom branch via the real MeasurementRulerService, and updateUserModel-before-updateOverlaysForAttachment call ordering"
    requirement: "TEST-01"
    verification:
      - kind: unit
        ref: "src/app/components/attachment-edit-modal/attachment-edit-modal.component.spec.ts#AttachmentEditModalComponent onSave"
        status: pass
    human_judgment: false
  - id: D2
    description: "custom_attachment's adult-classification matrix (checked+adult-on, checked+null-circumference, unchecked, checked+adult-off) proves the adult-mode gate, not just the checkbox; cross-cutting onSave invalid-form/success/rejected-persistence paths"
    requirement: "TEST-01"
    verification:
      - kind: unit
        ref: "src/app/components/attachment-edit-modal/attachment-edit-modal.component.spec.ts#AttachmentEditModalComponent onSave custom_attachment"
        status: pass
      - kind: unit
        ref: "src/app/components/attachment-edit-modal/attachment-edit-modal.component.spec.ts#AttachmentEditModalComponent onSave cross-cutting behavior"
        status: pass
    human_judgment: false
  - id: D3
    description: "onDelete (confirmed, cancelled via spyOn(window,'confirm'), named-point and unnamed-point-fallback prompt wording, serverModelId/customPoint absence guards) and onClose (emits closeModal, touches no persistence spy)"
    requirement: "TEST-01"
    verification:
      - kind: unit
        ref: "src/app/components/attachment-edit-modal/attachment-edit-modal.component.spec.ts#AttachmentEditModalComponent onDelete"
        status: pass
      - kind: unit
        ref: "src/app/components/attachment-edit-modal/attachment-edit-modal.component.spec.ts#AttachmentEditModalComponent onClose"
        status: pass
    human_judgment: false
  - id: D4
    description: "showAdultClassification/showPenetrationZoneOption truth tables (including the adult-on + custom_model + null-attachmentPoint false case), isDickAttachmentChecked/isPenetrationZoneChecked safety before ngOnInit, and the penetration-zone save branch (enabled, suppressed by adult mode off, suppressed by unchecked checkbox)"
    requirement: "TEST-01"
    verification:
      - kind: unit
        ref: "src/app/components/attachment-edit-modal/attachment-edit-modal.component.spec.ts#AttachmentEditModalComponent adult mode gating"
        status: pass
    human_judgment: false
  - id: D5
    description: "Both manual Subscription fields (unitSubscription, adultModeSubscription) proven torn down via destroy-then-emit assertions (not an unsubscribe spy), including editForm object-reference stability, double-destroy, never-inited, and destroy-mid-point-definition safety"
    requirement: "TEST-01"
    verification:
      - kind: unit
        ref: "src/app/components/attachment-edit-modal/attachment-edit-modal.component.spec.ts#AttachmentEditModalComponent subscription teardown"
        status: pass
    human_judgment: false

duration: 40min
completed: 2026-08-01
status: complete
---

# Phase 5 Plan 05: attachment-edit-modal Write-Half Coverage Summary

**Extended `attachment-edit-modal.component.spec.ts` from 36 to 75 specs, closing TEST-01 by adding exact-payload assertions for all three `onSave` editType paths, delete/close, every adult-mode-gated branch, and destroy-then-emit proof for both manual `Subscription` fields — with zero changes to the production component.**

## Performance

- **Duration:** ~40 min
- **Tasks:** 3
- **Files modified:** 1 (existing spec file, extended)

## Accomplishments

- `onSave` is driven end-to-end for all three `editType`s (`custom_model`, `custom_attachment`, `server_custom_point`): populate via `ngOnChanges`, place a point via `onPointPlaced` (or drive `onImageLoad` where the measurement-line branch needs real image dimensions), patch the scenario-specific form values, then `await component.onSave()` — never shortcutting to the private save methods.
- The hardcoded `'attachment-point'` id substitution (T-05-05-01) is proven against a case where the populated point's incoming id differs from the hardcoded value, and the persisted id is still `'attachment-point'` — the specific regression this invariant exists to catch.
- The measurement-line branch is proven both ways through the real `MeasurementRulerService`: a custom line is persisted, and a line matching `presetLine('vertical', imageEl)` for the same loaded image dimensions is omitted from `defaultSizeInches`.
- `updateUserModel` is proven to run before `updateOverlaysForAttachment` via call-order tracking (a shared array populated by `callFake` on each spy), not two independent `toHaveBeenCalled` assertions that can't establish ordering.
- The `custom_attachment` adult-classification matrix covers all four combinations named in the plan — checked+adult-on, checked+null-circumference (asserting `circumference` is explicitly `undefined` via `hasOwnProperty`, not omitted), unchecked, and checked+adult-off — with the last case proving the gate itself, not just the checkbox (T-05-05-03).
- `server_custom_point` save asserts `updateCustomPoint` received exactly `{ name, x, y }` and that `updateUserModel` was never called for this type, plus both guard cases (`attachmentPoint` null, `serverModelId` absent) where `onSave` still emits `saved` because `saveServerCustomPoint` returns silently.
- Cross-cutting `onSave` paths: invalid form (neither persistence spy called, no `saved` emission), success (both `saved`/`closeModal` emit, `error` null, `loading` false), and rejected persistence (`error` populated, `loading` false, `closeModal` not emitted).
- `onDelete` covers confirmed/cancelled paths using `spyOn(window, 'confirm')` (T-05-05-02) rather than reassigning the global, both prompt-wording cases (named point and the unnamed-point fallback), and both guard cases (`serverModelId`/`customPoint` absent) where `confirm` is never invoked at all.
- `onClose` asserts it emits `closeModal` and touches none of the four persistence spies — a guard against a future refactor quietly adding save-on-close.
- `showAdultClassification`/`showPenetrationZoneOption` truth tables are asserted across all relevant combinations, explicitly including the adult-mode-on + `custom_model` + null-`attachmentPoint` false case flagged as most likely to be dropped in a refactor. `isDickAttachmentChecked`/`isPenetrationZoneChecked` are proven to return `false` rather than throw on a component whose `ngOnInit` never ran (`editForm` undefined).
- The penetration-zone save branch (T-05-05-04's sibling invariant) is covered as three cases: enabled (adult mode on + checkbox checked), suppressed by adult mode off, and suppressed by the checkbox unchecked.
- Both manual `Subscription` fields (`unitSubscription`, `adultModeSubscription`) are proven torn down with a destroy-then-emit assertion — push a value, observe the bound field change; call `ngOnDestroy()`; push another value; assert the field did NOT change — including `editForm` object-reference stability across a post-destroy emission (T-05-05-04: proves a leaked subscription isn't silently rebuilding the form). Double-destroy, never-inited, and destroy-mid-point-definition safety round out the block.

## Task Commits

Each task was committed atomically:

1. **Task 1: Cover the three editType save paths with exact-payload assertions** - `c7b5e43` (test)
2. **Task 2: Cover onDelete, onClose, and the adult-mode-gated display branches** - `8256310` (test)
3. **Task 3: Prove both subscriptions are torn down with a destroy-then-emit assertion** - `a91120d` (test)

_No production code was modified in this plan — `git diff` on `attachment-edit-modal.component.ts` stayed empty across all three tasks, per its acceptance criteria._

## Files Created/Modified

- `src/app/components/attachment-edit-modal/attachment-edit-modal.component.spec.ts` - Extended from 36 to 75 specs (1125 lines total). Added `describe('onSave', ...)` (17 specs), `describe('onDelete', ...)`/`describe('onClose', ...)`/`describe('adult mode gating', ...)` (17 specs), and `describe('subscription teardown', ...)` (5 specs).

## Decisions Made

- Drove every save case through the real component sequence (`ngOnChanges` → `onPointPlaced`/`onImageLoad` → `patchValue` → `await onSave()`) rather than calling `saveCustomItem`/`saveServerCustomPoint` directly, matching D-10/D-11's intent that these assertions prove the branch constructs the right payload, not merely that `onSave` dispatches to the right private method.
- Always called `globalSettingsSubject.next(...)` to set adult mode BEFORE the `ngOnChanges` population call in every adult-mode-dependent test, because `ngOnInit`'s `unitSubscription` rebuilds `editForm` via `initializeForm()` on every `globalSettings$` emission — patching form values before that rebuild would be silently discarded by the next emission.
- Asserted the "circumference explicitly undefined but present" case via `Object.prototype.hasOwnProperty.call(updates, 'circumference')` rather than `toEqual`, since `saveCustomItem` always explicitly assigns `updates.circumference = undefined` in that branch (never omits the key) — `hasOwnProperty` is what actually distinguishes "assigned `undefined`" from "omitted", which `toEqual` cannot.
- Reused a bare `TestBed.createComponent(AttachmentEditModalComponent)` instance (no `detectChanges()`, so `ngOnInit` never runs) across three separate specs — `isDickAttachmentChecked`/`isPenetrationZoneChecked` returning `false` before init, and `ngOnDestroy()` being safe before init — rather than fabricating a half-initialized component by hand.

## Deviations from Plan

None - plan executed exactly as written. All acceptance criteria across all three tasks were met on first implementation; no auto-fixes, no architectural questions, no scope changes.

## Issues Encountered

None. The 05-04 harness (BehaviorSubject-backed `globalSettings$`, describe-scoped fixtures) worked exactly as designed for the write-half's teardown assertions — no rework of the harness was needed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `attachment-edit-modal.component.ts` — previously the highest-risk untested component in the codebase — now has 75 passing specs covering its full read/write surface: form init/population, display gates, `onPointPlaced`, all three `onSave` paths, `onDelete`/`onClose`, adult-mode gating, and subscription teardown. TEST-01 is closed.
- Full suite after this plan (this worktree, base = wave-1-merged commit `00c0c6a`): 631 specs, 602 passing, 29 failing — the same 29 pre-existing failures documented in `05-TRIAGE.md`'s disposition table (0 new failures introduced, 39 new specs added across this plan's three tasks: 17 + 17 + 5). `git diff --exit-code src/app/components/attachment-edit-modal/attachment-edit-modal.component.ts` stayed clean across every task.
- Type-check (`/home/user/Development/SizeComparisonSite/node_modules/.bin/tsc --noEmit -p tsconfig.spec.json`, run against this worktree's `tsconfig.spec.json` from the main repo's installed compiler, per the same worktree quirk noted in 05-04's summary) exits 0 with zero errors.
- No blockers for downstream Phase 5 plans.

## Self-Check: PASSED

- FOUND: `src/app/components/attachment-edit-modal/attachment-edit-modal.component.spec.ts`
- FOUND: `.planning/phases/05-test-coverage-hardening/05-05-SUMMARY.md`
- FOUND: commit `c7b5e43` (Task 1)
- FOUND: commit `8256310` (Task 2)
- FOUND: commit `a91120d` (Task 3)

---
*Phase: 05-test-coverage-hardening*
*Completed: 2026-08-01*

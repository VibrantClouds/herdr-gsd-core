---
phase: 04-subscription-render-performance-hardening
plan: "02"
subsystem: ui
tags: [rxjs, angular, subscription-lifecycle, take, takeUntil]

requires:
  - phase: 04-subscription-render-performance-hardening
    provides: "04-01 established the destroy$ + take(1)/takeUntil(destroy$) pattern on AppComponent"
provides:
  - "ModelSelectorComponent and AttachmentSelectorComponent no longer leak one permanent subscription per dropdown change"
  - "Both components implement OnDestroy with a destroy$ Subject torn down on ngOnDestroy"
  - "Regression coverage proving a second emission on the same getModelById stream is a no-op, and no emission is processed after destroy"
affects: [04-03, 04-verification]

tech-stack:
  added: []
  patterns:
    - "take(1) before takeUntil(destroy$) on one-shot service calls against an infinite (shareReplay) observable"

key-files:
  created: []
  modified:
    - src/app/components/model-selector/model-selector.component.ts
    - src/app/components/model-selector/model-selector.component.spec.ts
    - src/app/components/attachment-selector/attachment-selector.component.ts
    - src/app/components/attachment-selector/attachment-selector.component.spec.ts

key-decisions:
  - "D-04 behavior delta accepted: uploading or deleting a model no longer re-applies an earlier dropdown selection to the panel/attachment output, because take(1) structurally closes the subscription after its first emission."

patterns-established:
  - "One-shot service calls against ImageMetadataService.getModelById (infinite due to shareReplay over a BehaviorSubject) must be piped through take(1) then takeUntil(destroy$), in that order."

requirements-completed: [PERF-01]

coverage:
  - id: D1
    description: "model-selector's getModelById subscription is take(1) + takeUntil(destroy$); a second stream emission after the first no longer re-invokes updateLeftPanelModel/updateRightPanelModel"
    requirement: "PERF-01"
    verification:
      - kind: unit
        ref: "src/app/components/model-selector/model-selector.component.spec.ts#subscription teardown (PERF-01) does not re-invoke updateLeftPanelModel on a second emission from the same getModelById stream (D-04)"
        status: pass
    human_judgment: false
  - id: D2
    description: "model-selector does not run its update handler if the only stream emission arrives after ngOnDestroy"
    requirement: "PERF-01"
    verification:
      - kind: unit
        ref: "src/app/components/model-selector/model-selector.component.spec.ts#subscription teardown (PERF-01) does not run the handler when the only emission arrives after ngOnDestroy (D-05)"
        status: pass
    human_judgment: false
  - id: D3
    description: "attachment-selector's getModelById subscription is take(1) + takeUntil(destroy$); a second stream emission after the first no longer re-emits attachmentSelected"
    requirement: "PERF-01"
    verification:
      - kind: unit
        ref: "src/app/components/attachment-selector/attachment-selector.component.spec.ts#subscription teardown (PERF-01) does not re-emit attachmentSelected on a second emission from the same getModelById stream (D-04)"
        status: pass
    human_judgment: false
  - id: D4
    description: "attachment-selector does not emit attachmentSelected if the only stream emission arrives after ngOnDestroy"
    requirement: "PERF-01"
    verification:
      - kind: unit
        ref: "src/app/components/attachment-selector/attachment-selector.component.spec.ts#subscription teardown (PERF-01) does not emit attachmentSelected when the only emission arrives after ngOnDestroy (D-05)"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-07-30
status: complete
---

# Phase 04 Plan 02: Selector Subscription Teardown Summary

**Both dropdown-change selectors (`model-selector`, `attachment-selector`) now pipe their `getModelById` subscription through `take(1)` then `takeUntil(destroy$)`, closing the two remaining accumulating-subscription leak sites against the infinite `imageModels$` stream in `image-metadata.service.ts`.**

## Performance

- **Started:** 2026-07-30T23:23:48Z
- **Completed:** 2026-07-30T23:33:14Z
- **Tasks:** 2 completed
- **Files modified:** 4

## Accomplishments
- `ModelSelectorComponent` implements `OnDestroy`, holds a `destroy$` field, and `onModelChange`'s `getModelById` subscription is piped `take(1), takeUntil(this.destroy$)`.
- `AttachmentSelectorComponent` implements `OnDestroy`, holds a `destroy$` field, and `onAttachmentChange`'s `getModelById` subscription is piped identically.
- Four new regression specs (two per component) prove: (1) a stale re-emission on the still-open `getModelById` stream (simulating a `userModels$` upload/delete churn) does not re-invoke the state update / re-emit the output after the first emission has already been consumed by `take(1)`; (2) an emission arriving after `ngOnDestroy()` is never processed.
- `image-metadata.service.ts` — the root-cause infinite-stream service — is untouched (`git diff` empty), as required by the plan's acceptance criteria.

## Task Commits

Each task was committed atomically:

1. **Task 1: model-selector — take(1) + takeUntil(destroy$) and destroy-then-emit regression spec** - `e3d2871` (fix)
2. **Task 2: attachment-selector — take(1) + takeUntil(destroy$) and destroy-then-emit regression spec** - `4d82658` (fix)

**Plan metadata:** committed alongside this SUMMARY (worktree mode — orchestrator applies final metadata commit after wave merge).

## Files Created/Modified
- `src/app/components/model-selector/model-selector.component.ts` - Added `OnDestroy`, `destroy$` Subject, `take(1)/takeUntil(destroy$)` pipe on the `getModelById` subscription in `onModelChange`.
- `src/app/components/model-selector/model-selector.component.spec.ts` - Added controllable `ImageMetadataService`/`StateManagementService` stubs and a `subscription teardown (PERF-01)` describe block with no-re-fire and destroy-then-emit cases.
- `src/app/components/attachment-selector/attachment-selector.component.ts` - Mirror-image fix: `OnDestroy`, `destroy$` Subject, `take(1)/takeUntil(destroy$)` pipe on the `getModelById` subscription in `onAttachmentChange`.
- `src/app/components/attachment-selector/attachment-selector.component.spec.ts` - Mirror-image spec additions, spying on `attachmentSelected.emit`.

## Decisions Made
- Followed the plan's locked D-04 fix exactly: `take(1)` first, then `takeUntil(destroy$)` — operator order matters because `take(1)` is what structurally prevents re-firing on a `userModels$` churn emission, while `takeUntil` alone would not (the stream never completes on its own).
- **D-04 behavior delta (intentional, not a regression):** after this change, uploading or deleting a user model while a dropdown selection is pending no longer causes that earlier selection to be silently re-applied to the panel (model-selector) or re-emitted as an attachment pick (attachment-selector). This was the described defect being fixed, and is called out here per the plan's verification requirement.

## Deviations from Plan

None - plan executed exactly as written. `image-metadata.service.ts` was read-only reference material and was not modified (confirmed via empty `git diff`).

## Issues Encountered

None. `pnpm run typecheck` / `pnpm exec ng test` do not resolve `tsc` / `ng` binaries directly inside this worktree (no local `node_modules/.bin`); per orchestrator notes, `node_modules` resolves via upward lookup to the repo root, so verification was run via `node <repo-root>/node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json` (and `tsconfig.spec.json`) and `node <repo-root>/node_modules/@angular/cli/bin/ng.js test ...` with the same `--include` scoping the plan specified. Both scoped Karma runs (model-selector, attachment-selector) executed 3 of 3 SUCCESS. The full suite was also run: 452 total / 423 SUCCESS / 29 FAILED, which is exactly the pre-phase baseline's 29 failures (448 total / 419 SUCCESS / 29 FAILED) plus the 4 new specs added by this plan, all passing. No new failures were introduced.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Both selector components are now safe against the D-03 infinite-stream hazard; this closes 2 of the 3 genuine subscription-leak sites identified in D-01 for this phase (04-01 covered `AppComponent`).
- `image-metadata.service.ts` remains untouched and available as-is for any other consumer in this phase's remaining plans.
- No blockers for subsequent 04-xx plans in this wave.

## Self-Check: PASSED

- FOUND: src/app/components/model-selector/model-selector.component.ts
- FOUND: src/app/components/attachment-selector/attachment-selector.component.ts
- FOUND: .planning/phases/04-subscription-render-performance-hardening/04-02-SUMMARY.md
- FOUND commit: e3d2871
- FOUND commit: 4d82658
- FOUND commit: 113fdee

---
*Phase: 04-subscription-render-performance-hardening*
*Completed: 2026-07-30*

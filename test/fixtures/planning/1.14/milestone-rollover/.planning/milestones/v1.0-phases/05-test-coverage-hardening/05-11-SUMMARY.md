---
phase: 05-test-coverage-hardening
plan: 11
subsystem: testing
tags: [angular, karma, jasmine, indexeddb, integration-test, upload-pipeline, attachment-points]

# Dependency graph
requires:
  - phase: 05-test-coverage-hardening
    provides: "src/app/integration/ directory with README.md conventions, and the src/app/testing/ fixture pattern (05-02)"
provides:
  - "src/app/integration/upload-attach-use.integration.spec.ts -- the upload -> attachment-point -> overlay-usage integration spec (TEST-04)"
affects: []

# Actuals (#2632)
actuals:
  tokens: 4315
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Scoped FileReader stub-and-restore within a single test (reuse the same jasmine.Spy via jasmine.isSpy() rather than re-spyOn) so a preview-generation stub doesn't leak into an unrelated read-back call later in the same test."

key-files:
  created:
    - src/app/integration/upload-attach-use.integration.spec.ts
  modified:
    - .planning/REQUIREMENTS.md

key-decisions:
  - "Scoped the FileReader.readAsDataURL stub to only the upload-processing call, restoring it (`.and.callThrough()`) before any IndexedDB read-back. IndexedDBUserModelService.getUserModel() also calls FileReader.readAsDataURL internally (via UserModelStorageUtils.blobToBase64), so leaving the plan's suggested global stub in place for the whole test would make the base64<->Blob round-trip assertion pass unconditionally regardless of what IndexedDB actually stored -- exactly the 'mocked storage layer could never catch' failure mode the plan's acceptance criteria warns against. Fed the pipeline a File containing genuinely decoded PNG bytes (via atob) rather than an arbitrary string, so the stub and the real FileReader agree on the same data URL."
  - "Used ImageModel.originalDimensions of 400x600 for test-constructed models (rather than the tiny PNG's real 1x1 dimensions) so the custom attachment point's 'well inside the model's originalDimensions' requirement has a realistic coordinate space to assert against. This is legitimate because ImageModel's metadata is independent of imagePath's actual decoded pixel size in this pipeline (dimensions are only derived from real decoding when auto-crop is enabled, which these specs keep disabled for determinism)."

patterns-established:
  - "Reuse an already-active jasmine.Spy via jasmine.isSpy() rather than re-spyOn()'ing the same prototype method within one test -- Jasmine throws 'has already been spied upon' on a second spyOn() call, which matters whenever a single integration-scenario test needs to drive the same stubbed browser API (here, FileReader.readAsDataURL) more than once."

requirements-completed: [TEST-04]

coverage:
  - id: D1
    description: "An uploaded model travels the real chain -- UploadImagePipelineService -> IndexedDBUserModelService -> CustomAttachmentPointService -> StateManagementService.addOverlayToLeftPanel -- with real IndexedDB persistence, and the base64<->Blob round trip is proven end-to-end rather than assumed."
    requirement: "TEST-04"
    verification:
      - kind: integration
        ref: "src/app/integration/upload-attach-use.integration.spec.ts#persists an uploaded model to real IndexedDB and reads it back with the base64 round trip intact"
        status: pass
      - kind: integration
        ref: "src/app/integration/upload-attach-use.integration.spec.ts#runs upload -> persist -> add custom point -> build overlay -> addOverlayToLeftPanel as one scenario, proving the sourceAttachmentPointId and original-coordinate invariants end-to-end"
        status: pass
    human_judgment: false
  - id: D2
    description: "The overlay's sourceAttachmentPointId invariant ('attachment-point') and the attachment-point original-pixel-coordinate invariant both hold across the whole upload -> persist -> point-definition -> attach chain, not just at a single unit boundary."
    requirement: "TEST-04"
    verification:
      - kind: integration
        ref: "src/app/integration/upload-attach-use.integration.spec.ts#runs upload -> persist -> add custom point -> build overlay -> addOverlayToLeftPanel as one scenario, proving the sourceAttachmentPointId and original-coordinate invariants end-to-end"
        status: pass
    human_judgment: false
  - id: D3
    description: "Full test suite failure count did not rise above the 05-TRIAGE.md baseline (29), confirming the new spec's mandatory IndexedDB/localStorage cleanup does not leak into other spec files run in the same Karma session."
    verification:
      - kind: other
        ref: "CHROME_BIN=... pnpm exec ng test --no-watch --browsers=ChromeHeadless (600 total, 571 passing, 29 failing -- identical failure count to the 592-test baseline's 29, with the 8 new specs added to the passing total)"
        status: pass
    human_judgment: false

# Metrics
duration: 35min
completed: 2026-08-01
status: complete
---

# Phase 05 Plan 11: Upload-Attach-Use Integration Spec Summary

**`upload-attach-use.integration.spec.ts` drives the real upload -> IndexedDB persistence -> custom attachment point -> overlay attachment chain end-to-end, standing in only `ImageProcessingService` to resolve D-08's Web Worker determinism question.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-08-01T17:48:00Z (approx)
- **Completed:** 2026-08-01T18:23:00Z (approx)
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments
- Created `src/app/integration/upload-attach-use.integration.spec.ts` with 8 specs covering the full TEST-04 flow: the upload leg (successful processing, real-IndexedDB persistence with a genuine base64<->Blob round trip, and a non-image rejection case with no persistence side effect), plus the attachment-point + overlay chain (a single end-to-end scenario proving `sourceAttachmentPointId === 'attachment-point'` and coordinate fidelity across upload -> persist -> point-definition -> attach, and four targeted specs for `addCustomPoint`'s id/type generation, localStorage persistence, `canDeletePoint`'s occupied/unoccupied cases, and left/right panel independence).
- `ImageProcessingService` is the sole stand-in in the file, resolving D-08's open worker question exactly as the plan specified; every other collaborator (`UploadImagePipelineService`, `IndexedDBUserModelService`, `CustomAttachmentPointService`, `StateManagementService`) runs for real against real IndexedDB and real `localStorage`.
- Full suite run after the change: 600 total specs (592 baseline + 8 new), 571 passing, 29 failing -- an identical failure count to the pre-existing `05-TRIAGE.md` baseline, confirming no leakage from this file's real-persistence writes.
- Marked `TEST-04` complete in `.planning/REQUIREMENTS.md` -- this plan is TEST-04's sole owner (05-10 owns TEST-03 separately), and the spec genuinely delivers the requirement's stated flow.
- `package.json` and `pnpm-lock.yaml` are unchanged; no dependency was added (`fake-indexeddb` was explicitly rejected in `05-RESEARCH.md`, and the test uses real headless-Chrome IndexedDB per D-08).

## Task Commits

Each task was committed atomically:

1. **Task 1: Drive the upload leg into real IndexedDB persistence** - `f5de1f8` (test)
2. **Task 2: Complete the chain -- custom attachment point, overlay attachment, and the invariant** - `6011e58` (test)

**Plan metadata:** committed together with this SUMMARY (worktree mode -- orchestrator handles the shared-file metadata commit after merge).

## Files Created/Modified
- `src/app/integration/upload-attach-use.integration.spec.ts` - New. 8 specs: 3 for the upload leg (processFile success, real-persistence round trip, non-image rejection), 5 for the attachment-point + overlay chain (the end-to-end scenario plus 4 targeted link specs).
- `.planning/REQUIREMENTS.md` - Modified. `TEST-04` checkbox marked complete via `requirements.mark-complete`.

## Decisions Made
- **Scoped the `FileReader.readAsDataURL` stub to only the upload-processing call, restoring it before any IndexedDB read-back.** The plan's `read_first` section pointed to `upload-image-pipeline.service.spec.ts`'s global-for-the-whole-test stub idiom, but `IndexedDBUserModelService.getUserModel()` also calls `FileReader.readAsDataURL` internally (via `UserModelStorageUtils.blobToBase64`, used to reassemble the stored Blob back into a data URL). A stub left active for the whole test would make that call return the same fixed string regardless of what IndexedDB actually stored, silently defeating the very assertion ("proving the Blob split round trips") the plan's acceptance criteria calls out as the one that matters. Instead, the spec feeds the pipeline a `File` built from genuinely decoded PNG bytes (`atob()` over the tiny-PNG base64 payload) so the real, unstubbed `FileReader` and the stub agree on the same data URL, and restores the real `FileReader` (`.and.callThrough()`) immediately after `processFile()` resolves, before any persistence call. This preserves the plan's determinism goal for preview generation while keeping the round-trip assertion honest.
- **Reused the same `jasmine.Spy` across multiple upload calls within the end-to-end scenario** (via `jasmine.isSpy()` before deciding whether to `spyOn()` again), because Jasmine throws `"readAsDataURL has already been spied upon"` on a second `spyOn()` call within one test. This was discovered when the Task 2 end-to-end scenario (which uploads two models) first failed with exactly that error; reconfiguring the existing spy's behavior instead of re-spying resolved it without changing the stub's semantics.
- **Used `originalDimensions: { width: 400, height: 600 }` for test-constructed `ImageModel`s** rather than the tiny PNG's real 1x1 dimensions, so the custom attachment point's "well inside the model's original dimensions" requirement (per the plan's action text and the attachment-system invariant) has a realistic coordinate space. This is legitimate here because the pipeline only derives dimensions from real image decoding when auto-crop is enabled (kept disabled throughout this spec for determinism per D-08); with it disabled, `ImageModel.originalDimensions` is metadata the test constructs directly, independent of the file's actual byte content.

## Deviations from Plan

None requiring a rule invocation. The two decisions above are exercises of the plan's own explicit guidance under genuine ambiguity it left open (how to keep the FileReader stub from also intercepting the read-back call, and how to drive two uploads with one stubbed browser API within one test) rather than departures from what the plan asked for.

## Issues Encountered
- Initial version of the Task 2 end-to-end scenario failed with `Error: <spyOn> : readAsDataURL has already been spied upon` when uploading a second model within the same `it`. Resolved by making the `stubFileReaderForUpload()` helper reuse the existing spy (via `jasmine.isSpy()`) instead of calling `spyOn()` unconditionally on every invocation. See Decisions Made above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- TEST-04 is now fully satisfied: upload, attachment-point definition, and attachment usage are exercised as one flow against real persistence, with the `sourceAttachmentPointId` and original-coordinate invariants proven end-to-end.
- Both members of `src/app/integration/` named in the directory's README (`share-link-import.integration.spec.ts` for TEST-03, owned by 05-10; `upload-attach-use.integration.spec.ts` for TEST-04, this plan) now exist.
- Per D-15, `IndexedDBUserModelService`'s dedicated unit-spec coverage remains a real gap: this spec exercises `saveUserModel()` and `getUserModel()` incidentally through the real, unspied service, but that is not a substitute for a dedicated spec covering the service's other methods (`deleteUserModel`, `updateUserModel`, `getStorageInfo`, migration status, etc.). That gap is already tracked in `.planning/REQUIREMENTS.md`'s v2 section per D-15 -- this plan does not change that disposition.
- No blockers identified for downstream plans in this phase.

## Self-Check: PASSED

- FOUND: src/app/integration/upload-attach-use.integration.spec.ts
- FOUND: .planning/phases/05-test-coverage-hardening/05-11-SUMMARY.md
- FOUND commit: f5de1f8
- FOUND commit: 6011e58

---
*Phase: 05-test-coverage-hardening*
*Completed: 2026-08-01*

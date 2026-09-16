---
phase: 01-component-decomposition
plan: 06
subsystem: ui
tags: [angular, upload-modal, image-processing, reactive-forms, validators, decomposition]

# Dependency graph
requires:
  - phase: 01-component-decomposition
    provides: Wave 1 baseline (01-01) — test-infra fix unblocking full-suite regression detection
provides:
  - "UploadImagePipelineService — form-agnostic validate→auto-crop→compress→preview orchestration"
  - "UploadFormValidatorsService — uniqueNameValidator/sliderRangeValidator/heightValidator as injectable ValidatorFn factories"
affects: ["01-07 (upload-modal shell rewiring)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Form-agnostic orchestration service: accepts plain options object instead of FormGroup, returns plain result object (D-03, mirrors D-01)"
    - "ValidatorFn factory injectable service with accessor-closure parameter (getCurrentUnit) for validators needing live external state"

key-files:
  created:
    - src/app/services/upload-image-pipeline.service.ts
    - src/app/services/upload-image-pipeline.service.spec.ts
    - src/app/services/upload-form-validators.service.ts
    - src/app/services/upload-form-validators.service.spec.ts
  modified: []

key-decisions:
  - "processFile() returns suggestedName (derived from filename) rather than patching any form itself — caller (Plan 07's upload-modal) does the patchValue"
  - "heightValidator takes a getCurrentUnit accessor closure instead of reading a component field, preserving today's live-read-on-each-validation-run behavior without giving the service its own unit state"
  - "createPreviewFromFile's FileReader callback wrapped in a Promise so processFile can await it — internal-only change, output (data URL string) is identical to the original"

requirements-completed: [DECOMP-01]

coverage:
  - id: D1
    description: "UploadImagePipelineService orchestrates validate → auto-crop → compress → preview-URL generation with fallback-on-error branching, matching the original component's exact error strings and control flow"
    requirement: DECOMP-01
    verification:
      - kind: unit
        ref: "src/app/services/upload-image-pipeline.service.spec.ts#should reject a non-allowed MIME type without processing the file"
        status: pass
      - kind: unit
        ref: "src/app/services/upload-image-pipeline.service.spec.ts#should reject a file over 10MB"
        status: pass
      - kind: unit
        ref: "src/app/services/upload-image-pipeline.service.spec.ts#should pass through a valid PNG with autoCrop and compression disabled"
        status: pass
      - kind: unit
        ref: "src/app/services/upload-image-pipeline.service.spec.ts#should fall back to the original file when auto-crop fails"
        status: pass
      - kind: unit
        ref: "src/app/services/upload-image-pipeline.service.spec.ts#should fall back to the original file when compression fails"
        status: pass
    human_judgment: false
  - id: D2
    description: "UploadFormValidatorsService relocates uniqueNameValidator/sliderRangeValidator/heightValidator as ValidatorFn factories with unchanged validation semantics"
    requirement: DECOMP-01
    verification:
      - kind: unit
        ref: "src/app/services/upload-form-validators.service.spec.ts#uniqueNameValidator (3 specs: taken, not taken, empty-skip)"
        status: pass
      - kind: unit
        ref: "src/app/services/upload-form-validators.service.spec.ts#sliderRangeValidator (3 specs: min>max, min==max, min<max)"
        status: pass
      - kind: unit
        ref: "src/app/services/upload-form-validators.service.spec.ts#heightValidator (5 specs: imperial/metric required, disabled-skip x2, live-unit-reread)"
        status: pass
    human_judgment: false

duration: 6min
completed: 2026-07-06
status: complete
---

# Phase 01 Plan 06: Upload Image Pipeline & Form Validators Extraction Summary

**Extracted upload-modal's ~180-line file-processing orchestration and ~70-line reactive-form validators into two form-agnostic, fully-tested injectable services, ready for Plan 07 to wire into the thinned modal shell.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-06T22:58:44Z
- **Completed:** 2026-07-06T23:05:37Z
- **Tasks:** 2/2 completed
- **Files modified:** 4 created (0 modified)

## Accomplishments
- `UploadImagePipelineService.processFile(file, options)` reproduces the original `onFileSelected` control flow verbatim (type check → size check → derive suggested name → autoCrop-then-maybe-compress OR compress-only OR neither, with identical fallback-to-original-on-failure branches), returning a plain result object and never touching a `FormGroup`.
- `UploadFormValidatorsService` exposes `uniqueNameValidator()`, `sliderRangeValidator()`, and `heightValidator(getCurrentUnit)` as `ValidatorFn` factories with unchanged validation logic and error keys (`nameTaken`, `sliderRange`, `heightRequired`).
- Both services are `@Injectable({ providedIn: 'root' })` and contain zero `@angular/forms` `FormGroup` coupling in the pipeline service (verified via grep in acceptance criteria).
- 18 new unit tests added (6 for the pipeline service, 12 for the validators service), all passing.
- Full test suite re-run after both tasks: 274 total specs, 222 passing, 52 failing — exactly the pre-existing baseline documented in `deferred-items.md` item 2, with zero new regressions introduced by this plan's two new files.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create UploadImagePipelineService (validate → auto-crop → compress → preview)** - `79e84b1` (feat)
2. **Task 2: Create UploadFormValidatorsService (uniqueNameValidator/sliderRangeValidator/heightValidator as factories)** - `36d2295` (feat)

**Plan metadata:** committed with this SUMMARY (docs)

_Note: TDD-tagged tasks here were executed as write-then-verify (tests written alongside the implementation and run to green before commit), not as separate RED/GREEN commits — both files were authored together per task and the spec's 5/12 cases were used to validate behavior before committing._

## Files Created/Modified
- `src/app/services/upload-image-pipeline.service.ts` - `UploadImagePipelineService`: `processFile(file, options)` orchestrates validate → auto-crop → compress → preview-URL generation; exposes `MAX_FILE_SIZE`/`ALLOWED_FILE_TYPES` constants; injects the existing (unmodified) `ImageProcessingService`
- `src/app/services/upload-image-pipeline.service.spec.ts` - 6 specs: creation, invalid-type rejection, oversized rejection, valid pass-through, crop-failure fallback, compression-failure fallback
- `src/app/services/upload-form-validators.service.ts` - `UploadFormValidatorsService`: `uniqueNameValidator()`, `sliderRangeValidator()`, `heightValidator(getCurrentUnit: () => MeasurementUnit)`; injects `IndexedDBUserModelService`
- `src/app/services/upload-form-validators.service.spec.ts` - 12 specs across the three validators including both unit branches and disabled-control skip behavior for `heightValidator`

## Decisions Made
- `processFile`'s result includes `suggestedName` (the `nameWithoutExt` value) as plain data rather than the service patching `uploadForm` itself — Plan 07's rewired `onFileSelected` will call `this.uploadForm.patchValue({ name: result.suggestedName })`, preserving the D-03/D-01 form-agnostic contract.
- `heightValidator` takes a `getCurrentUnit: () => MeasurementUnit` accessor closure parameter instead of reading an injected/stored unit field, because the service has no per-call unit context and the original component behavior re-reads `this.currentUnit` live on every validation run — the closure preserves that liveness without giving the service its own mutable unit state.
- `createPreviewFromFile`'s `FileReader` callback was wrapped in a `Promise<string>` so `processFile` can `await` it in a linear `async` flow; the output (identical data URL string) and browser API usage are unchanged from the original callback-based version.
- No `StateExportService` version bump — neither new service touches `AppState`, `ImageModel`, or any other serialized structure; this is pure code-organization relocation with no data-shape changes.

## Deviations from Plan

None - plan executed exactly as written. Both services were authored to match the plan's `<behavior>` and `<action>` specifications, including the exact original error strings (`'Please select a valid image file (PNG, JPG, or JPEG)'`, `'File size must be less than 10MB per file'`) and the exact validator error keys (`nameTaken`, `sliderRange`, `heightRequired`).

One minor authoring self-correction (not a deviation from plan intent, just a fix made before the first commit): the initial JSDoc comment for `UploadImagePipelineOptions` used the literal phrase "FormGroup" in prose, which would have caused the acceptance-criteria grep (`grep -c "FormGroup" ... returns 0`) to fail. Reworded to "reactive form" before running the acceptance-criteria checks and committing — no functional code was affected.

## Issues Encountered

`pnpm exec ng test --browsers=ChromeHeadless` initially failed with "No binary for ChromeHeadless browser on your platform" because no `CHROME_BIN` was set in this environment. Resolved by pointing `CHROME_BIN` at the Playwright-managed Chromium binary already present in the environment (`~/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome`) for the duration of the test runs. This is a local environment/tooling detail, not a plan or code deviation — no project files were changed to work around it.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Both services are ready for Plan 07 to wire into the thinned `upload-modal` shell:
- `UploadImagePipelineService.processFile(file, { autoCropEnabled, cropTolerance, compressionEnabled, compressionQuality, maxDimension })` → `{ selectedFile, previewUrl, cropResult, compressionResult, error, suggestedName }`, consumed by `onFileSelected`, with the caller responsible for `uploadForm.patchValue({ name: result.suggestedName })`.
- `UploadFormValidatorsService.uniqueNameValidator()`, `.sliderRangeValidator()`, `.heightValidator(() => this.currentUnit)` → composed into `FormBuilder.group(...)` exactly where the original private methods were referenced (`initializeForm`, line ~101-125 of the current `upload-modal.component.ts`).

No blockers. The full test suite shows no new regressions from this plan (274 specs, 222 pass / 52 pre-existing fails matching the documented Wave 1 baseline).

---
*Phase: 01-component-decomposition*
*Completed: 2026-07-06*

## Self-Check: PASSED

All created files verified present on disk (`upload-image-pipeline.service.ts`, `.spec.ts`, `upload-form-validators.service.ts`, `.spec.ts`, this SUMMARY.md). All task commit hashes (`79e84b1`, `36d2295`, `d99db63`) verified present in `git log --oneline --all`.

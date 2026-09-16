---
phase: 04-subscription-render-performance-hardening
plan: "07"
subsystem: infra
tags: [image-processing, canvas, karma, jasmine, refactor]

requires:
  - phase: 04-subscription-render-performance-hardening
    provides: "04-05 image-processing-core.ts — pure crop/resize/transparency/output-format module"
provides:
  - "ImageProcessingService rewired onto image-processing-core.ts: every geometry/format/filename decision now routes through the shared pure module instead of private duplicates (D-12)"
  - "image-processing.service.spec.ts — first-ever spec for this service, 10 cases covering both public entry points and their failure contracts"
  - "Dead getCropPreview method removed (repo-wide grep confirmed zero callers)"
affects: [04-09]

tech-stack:
  added: []
  patterns:
    - "Main-thread service becomes a thin decode/encode shell over the shared core module — geometry decisions can no longer drift between this path and 04-08's Worker path because both call the same functions"
    - "Real canvas-derived File fixtures via toBlob in Karma (real Chrome) rather than mocking the canvas stack, mirroring upload-image-pipeline.service.spec.ts's TestBed idiom"

key-files:
  created:
    - src/app/services/image-processing.service.spec.ts
  modified:
    - src/app/services/image-processing.service.ts

key-decisions:
  - "Kept the facade route: autoCropImage/compressImage signatures, result shapes, and error strings are byte-identical, since upload-image-pipeline.service.spec.ts mocks exactly those two method names and upload-image-pipeline.service.ts imports the four option/result types from this file's path"
  - "Added a type-only re-export (`export type { CropBounds, CropOptions, CompressionOptions } from '../utils/image-processing-core'`) so the downstream import path keeps compiling under isolatedModules"
  - "Collapsed canvasToFile's redundant double toBlob call into a single conversion using the already-computed output mime type and quality — a dead-code removal with no observable output change, per the plan's explicit instruction"
  - "canvasToCompressedFile's quality parameter type widened to `number | undefined` to accept decideOutputFormat's OutputFormatDecision.quality directly, rather than re-deriving the jpeg/undefined split a second time"

patterns-established:
  - "Cross-plan geometry parity: both this service (main-thread) and 04-08's OffscreenCanvas path import planCrop/calculateResizedDimensions/hasTransparentPixels/decideOutputFormat from the same core module, so 04-09's parity test has a structural guarantee to verify rather than a coincidence to hope for"

requirements-completed: [PERF-03]

coverage:
  - id: D1
    description: "ImageProcessingService's autoCropImage rewired to load the image, draw to canvas, and delegate the crop decision (needsCrop, contentPercentage, bounds, dimensions) to image-processing-core's planCrop instead of private duplicate logic"
    requirement: "PERF-03"
    verification:
      - kind: unit
        ref: "src/app/services/image-processing.service.spec.ts#autoCropImage (4 cases: transparent-margin crop, full-bleed passthrough, undersized-content rejection, decode failure)"
        status: pass
      - kind: unit
        ref: "src/app/services/upload-image-pipeline.service.spec.ts (6 cases, unchanged, still green against the rewired service)"
        status: pass
    human_judgment: false
  - id: D2
    description: "ImageProcessingService's compressImage rewired to delegate resize arithmetic, transparency detection, and output-format decisions to calculateResizedDimensions/hasTransparentPixels/decideOutputFormat instead of private duplicate logic"
    requirement: "PERF-03"
    verification:
      - kind: unit
        ref: "src/app/services/image-processing.service.spec.ts#compressImage (5 cases: oversized resize, small-image passthrough, transparency-blocked conversion, opaque PNG->JPEG conversion, decode failure fallback)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Dead getCropPreview method removed after a repo-wide grep confirmed zero callers outside its own definition"
    requirement: "PERF-03"
    verification:
      - kind: other
        ref: "grep -rn 'getCropPreview' src/ --include='*.ts' returns no matches"
        status: pass
    human_judgment: false

duration: 35min
completed: 2026-07-30
status: complete
---

# Phase 04 Plan 07: Rewire ImageProcessingService onto the Shared Core Summary

**Rewired `ImageProcessingService`'s main-thread crop/compress path onto `image-processing-core.ts` (04-05), removed the dead `getCropPreview` method, and added the service's first-ever spec (10 cases) — the main-thread path is now a thin decode/encode shell that provably makes the same geometry decisions 04-08's Worker path will.**

## Performance

- **Duration:** 35 min
- **Tasks:** 2/2 completed
- **Files modified:** 2 (1 modified, 1 created)

## Accomplishments
- `ImageProcessingService.autoCropImage` now loads the image, draws to canvas, reads pixels once, and delegates the entire crop decision to `planCrop` from the shared core module — the "content too small" error message and its `toFixed(1)` formatting are preserved verbatim
- `ImageProcessingService.compressImage` now delegates resize arithmetic to `calculateResizedDimensions`, transparency detection to `hasTransparentPixels`, and format/quality decisions to `decideOutputFormat`
- Deleted four private duplicate helpers (`calculateResizedDimensions`, `checkImageTransparency`, `analyzeImageBounds`, `isEmptyPixel`) whose logic now lives solely in the core module
- Deleted the dead `getCropPreview` method (repo-wide grep confirmed zero callers before removal)
- Collapsed `canvasToFile`'s redundant double `toBlob` call into a single conversion (the outer call's result was always discarded)
- Re-exported `CropBounds`, `CropOptions`, `CompressionOptions` as types from the core module (`export type { ... }`) so `upload-image-pipeline.service.ts`'s existing import path keeps compiling under `isolatedModules`
- Created `image-processing.service.spec.ts` (first spec this service has ever had): 10 cases across `autoCropImage` and `compressImage`, built on real canvas-derived `File` fixtures via `toBlob` in real headless Chrome — no canvas-stack mocking
- Service file shrank from 475 to 275 lines

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewire the main-thread path onto the shared core and drop the dead preview method** - `9da3b72` (feat)
2. **Task 2: Create image-processing.service.spec.ts with main-thread crop and compress coverage** - `050b260` (test)

**Plan metadata:** (this commit) - `docs(04-07): complete plan`

## Files Created/Modified
- `src/app/services/image-processing.service.ts` - Rewired to import types, defaults, and geometry/format functions from `../utils/image-processing-core`; `autoCropImage` and `compressImage` keep their exact public signatures, result shapes, and error strings; dead `getCropPreview` removed; 475 → 275 lines.
- `src/app/services/image-processing.service.spec.ts` - New spec, 10 `it(` cases across two `describe` blocks (`autoCropImage`, `compressImage`), using real canvas `toBlob`-derived `File` fixtures rather than mocked canvas APIs.

## Decisions Made
- Preserved the facade route exactly as the plan specified: `autoCropImage`/`compressImage` signatures and result contracts are unchanged, verified by an empty `git diff` on `upload-image-pipeline.service.ts` and its spec (both untouched).
- Widened `canvasToCompressedFile`'s `quality` parameter to `number | undefined` so it can accept `decideOutputFormat`'s `OutputFormatDecision.quality` directly instead of re-deriving the jpeg/undefined split inside the helper a second time.
- Test fixtures for the oversized-image case use 2200×1100 (just over the default 2048px `maxDimension`) rather than a much larger image, to keep canvas encode/decode fast while still exceeding the default threshold as the plan required. The expected resized dimensions are computed at test time via the same `calculateResizedDimensions` the service calls, so the assertion is against the shared function's actual output, not a hand-derived number.
- The transparent-margin crop test computes its expected `planCrop` result directly from the same `ImageData` used to paint the fixture canvas (before PNG-encoding it), so the assertion in the test is against the exact function the service now calls, not an independently hand-computed value.

## Deviations from Plan

None - plan executed exactly as written. All acceptance criteria (grep-based structural checks, signature checks, `git diff` emptiness on the downstream pipeline files, line-count reduction) were verified directly.

## Issues Encountered

- This worktree has no local `node_modules` (by design, per orchestrator notes). Typecheck was run via `/home/user/Development/SizeComparisonSite/node_modules/.bin/tsc --noEmit` against `tsconfig.json`, `tsconfig.app.json`, and `tsconfig.spec.json` — all exit 0. Karma was run via `node /home/user/Development/SizeComparisonSite/node_modules/@angular/cli/bin/ng.js test`.
- Full-suite baseline check: baseline at this worktree's base commit (`b2b13ec`, post-wave-1) was 491 total / 462 SUCCESS / 29 FAILED, all pre-existing (documented in the orchestrator notes as inherited from phase 3, unrelated to this plan's files). After this plan's changes: **501 total / 472 SUCCESS / 29 FAILED — the identical 29 pre-existing failures**, plus all 10 new `image-processing.service.spec.ts` cases passing and the existing 6 `upload-image-pipeline.service.spec.ts` cases still green. No new failures introduced. Confirmed the 29 failures are unrelated to this plan's files by grepping the failure log for `image-processing`/`upload-image-pipeline` — the only matches were expected `console.warn`/`console.error` stack traces from this plan's own passing failure-path test cases, not new test failures.

## Next Phase Readiness
- `ImageProcessingService`'s main-thread path is a thin decode/encode shell over `image-processing-core.ts`, giving 04-08's OffscreenCanvas Worker implementation and 04-09's cross-path parity test a structurally-guaranteed-identical geometry source to build against.
- No blockers. No serialization version bump owed (`CURRENT_VERSION` stays at `1.0.11` — this plan touches no `ExportedState`/`AppState`/`PanelState`/`GlobalSettings`/`image-model.interface.ts` structure).

---
*Phase: 04-subscription-render-performance-hardening*
*Completed: 2026-07-30*

## Self-Check: PASSED

- FOUND: src/app/services/image-processing.service.ts
- FOUND: src/app/services/image-processing.service.spec.ts
- FOUND: .planning/phases/04-subscription-render-performance-hardening/04-07-SUMMARY.md
- FOUND commit: 9da3b72 (Task 1)
- FOUND commit: 050b260 (Task 2)

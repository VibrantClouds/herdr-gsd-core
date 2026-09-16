---
phase: 04-subscription-render-performance-hardening
plan: "05"
subsystem: infra
tags: [image-processing, canvas, worker-ready, pure-functions, karma, jasmine]

requires:
  - phase: 04-subscription-render-performance-hardening
    provides: "04-04 Worker-spike verdict record confirming a Worker-based image-processing path is viable"
provides:
  - "src/app/utils/image-processing-core.ts — a pure, environment-independent module holding every crop/resize/transparency/output-format decision the image pipeline makes"
  - "16 exported symbols (types, constants, functions) both the main-thread fallback (04-07) and the Worker path (04-08) will import against"
  - "src/app/utils/image-processing-core.spec.ts — 29 synthetic-fixture unit tests covering threshold boundaries"
affects: [04-07, 04-08, 04-09]

tech-stack:
  added: []
  patterns:
    - "Pure-module extraction with provenance JSDoc (mirrors coordinate-transform.ts): a single shared implementation makes cross-path fidelity a structural guarantee (D-12) instead of a tested-after-the-fact property"
    - "Environment-independent modules take already-decoded ImageData, leaving decode/encode to environment-specific callers so the module can cross the Worker boundary unchanged (D-10)"

key-files:
  created:
    - src/app/utils/image-processing-core.ts
    - src/app/utils/image-processing-core.spec.ts
  modified: []

key-decisions:
  - "planCrop reports the crop decision (bounds, dimensions, needsCrop, contentPercentage) but does not throw on undersized content — the caller (image-processing.service.ts, to be rewired in 04-07) keeps ownership of that rejection so the existing error message text is preserved"
  - "hasTransparentPixels is synchronous even though the original checkImageTransparency was async — the original never awaited anything, so the async was incidental, not required"

patterns-established:
  - "Default option constants (DEFAULT_CROP_OPTIONS, DEFAULT_COMPRESSION_OPTIONS) live in the shared module so both consumer paths cannot drift on defaults independently"

requirements-completed: [PERF-03]

coverage:
  - id: D1
    description: "Pure image-processing-core module extracted with 16 exported symbols (CropBounds, CropOptions, CompressionOptions, CropPlan, ResizePlan, OutputFormatDecision, DEFAULT_CROP_OPTIONS, DEFAULT_COMPRESSION_OPTIONS, isEmptyPixel, analyzeImageBounds, planCrop, calculateResizedDimensions, hasTransparentPixels, decideOutputFormat, croppedFileName, compressedFileName), no Angular/browser API coupling"
    requirement: "PERF-03"
    verification:
      - kind: unit
        ref: "pnpm exec tsc --noEmit (typecheck, exits 0)"
        status: pass
      - kind: unit
        ref: "grep-based acceptance criteria (exported symbol names, zero @angular refs, zero document./FileReader/getContext/new Image( refs, zero CropResult/CompressionResult refs)"
        status: pass
    human_judgment: false
  - id: D2
    description: "29 synthetic ImageData fixture tests covering crop-bounds detection, empty-pixel threshold behavior, resize arithmetic, transparency detection, output-format decisions, and filename helpers, including threshold boundaries"
    requirement: "PERF-03"
    verification:
      - kind: unit
        ref: "src/app/utils/image-processing-core.spec.ts (29 it() blocks, scoped Karma run: 29 SUCCESS)"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-07-30
status: complete
---

# Phase 04 Plan 05: Extract Shared Pure Image-Processing Core Summary

**Extracted crop/resize/transparency/output-format math out of `ImageProcessingService` into a pure `image-processing-core.ts` module (16 exported symbols) with 29 synthetic-fixture unit tests, so 04-07's main-thread rewire and 04-08's OffscreenCanvas Worker path share one implementation by construction (D-12).**

## Performance

- **Duration:** 25 min
- **Tasks:** 2/2 completed
- **Files modified:** 2 (both new files; `image-processing.service.ts` untouched as required)

## Accomplishments
- Created `src/app/utils/image-processing-core.ts`: all environment-independent crop/resize/transparency/output-format math extracted verbatim from `image-processing.service.ts`, re-typed to take `ImageData` directly instead of a canvas element
- `planCrop` returns the complete crop decision (`bounds`, `width`, `height`, `needsCrop`, `contentPercentage`) so both the Worker path and the main-thread fallback make identical geometry decisions by construction
- `DEFAULT_CROP_OPTIONS` and `DEFAULT_COMPRESSION_OPTIONS` moved into the shared module so both paths cannot drift on defaults
- Created `src/app/utils/image-processing-core.spec.ts` with 29 pure-function test cases (no `TestBed`) against synthetic `ImageData` fixtures, including boundary assertions for the white tolerance, alpha threshold, and `maxDimension` clamp

## Task Commits

Each task was committed atomically:

1. **Task 1: Create the shared pure image-processing core module** - `d6b93f4` (feat)
2. **Task 2: Spec the core module against synthetic ImageData fixtures** - `f48bb33` (test)

**Plan metadata:** (this commit) - `docs(04-05): complete plan`

## Files Created/Modified
- `src/app/utils/image-processing-core.ts` - Pure module: 16 exported symbols (types, constants, functions) for crop-bounds detection, resize arithmetic, transparency detection, and output-format/filename decisions. No Angular imports, no browser-document/canvas/FileReader/Image usage.
- `src/app/utils/image-processing-core.spec.ts` - 29 synthetic-`ImageData`-fixture unit tests, no `TestBed`, covering all 7 exported functions plus threshold boundaries.

## Decisions Made
- `planCrop` reports rather than throws on undersized content — the "content too small" rejection stays in `image-processing.service.ts` (owned by 04-07) so the existing user-facing error message is preserved unchanged.
- `hasTransparentPixels` is synchronous (the original `checkImageTransparency` was `async` but never awaited anything — the `async` keyword was incidental, not a real asynchronous dependency).

## Deviations from Plan

None - plan executed exactly as written. All 16 required symbols exported, all specified verbatim-copy bodies preserved, `image-processing.service.ts` left untouched (`git diff` against it is empty).

## Issues Encountered

- `pnpm run typecheck` failed with `tsc: command not found` because this worktree has no local `node_modules` (by design — see orchestrator notes). Verified type-safety instead via `/home/user/Development/SizeComparisonSite/node_modules/.bin/tsc --noEmit` (both root and `tsconfig.app.json` configs), which exited cleanly with no diagnostics. This is a worktree-execution detail, not a plan deviation — no code was changed to work around it.
- Full suite baseline check: pre-phase baseline on `main` @ `07d38b3` was 448 total / 419 SUCCESS / 29 FAILED (all pre-existing, unrelated to this plan). After this plan's changes, the full suite reports 477 total / 448 SUCCESS / 29 FAILED — the same 29 pre-existing failures, plus all 29 new tests passing. **No new failures introduced.**

## Next Phase Readiness
- `src/app/utils/image-processing-core.ts` is ready to be imported by both 04-07 (rewiring `ImageProcessingService` onto this module) and 04-08 (building the OffscreenCanvas Worker path on it).
- Exported symbol names for downstream plans to import against verbatim: `CropBounds`, `CropOptions`, `CompressionOptions`, `CropPlan`, `ResizePlan`, `OutputFormatDecision`, `DEFAULT_CROP_OPTIONS`, `DEFAULT_COMPRESSION_OPTIONS`, `isEmptyPixel`, `analyzeImageBounds`, `planCrop`, `calculateResizedDimensions`, `hasTransparentPixels`, `decideOutputFormat`, `croppedFileName`, `compressedFileName`.
- No blockers. No serialization version bump owed (`CURRENT_VERSION` stays at `1.0.11` — this module carries no serialized state).

---
*Phase: 04-subscription-render-performance-hardening*
*Completed: 2026-07-30*

## Self-Check: PASSED

- FOUND: src/app/utils/image-processing-core.ts
- FOUND: src/app/utils/image-processing-core.spec.ts
- FOUND: .planning/phases/04-subscription-render-performance-hardening/04-05-SUMMARY.md
- FOUND commit: d6b93f4 (Task 1)
- FOUND commit: f48bb33 (Task 2)
- FOUND commit: d9afbfb (docs: complete plan)

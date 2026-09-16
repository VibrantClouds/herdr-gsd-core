---
phase: 04-subscription-render-performance-hardening
plan: "08"
subsystem: infra
tags: [image-processing, offscreen-canvas, web-worker, karma, jasmine, esbuild]

requires:
  - phase: 04-subscription-render-performance-hardening
    provides: "04-04 Worker-spike verdict (real-worker-supported) and the builderMode: application Karma change it proved safe"
  - phase: 04-subscription-render-performance-hardening
    provides: "04-05 pure image-processing-core.ts module (CropOptions, CompressionOptions, planCrop, calculateResizedDimensions, hasTransparentPixels, decideOutputFormat, croppedFileName, compressedFileName, DEFAULT_CROP_OPTIONS, DEFAULT_COMPRESSION_OPTIONS)"
provides:
  - "src/app/utils/offscreen-image-processor.ts — cropImageOffscreen/compressImageOffscreen: OffscreenCanvas + createImageBitmap + convertToBlob implementation, delegating every geometry/format decision to image-processing-core.ts"
  - "src/app/workers/image-processing.protocol.ts — type-only ImageWorkerRequest/ImageWorkerResponse discriminated unions with correlating id + kind"
  - "src/app/workers/image-processing.worker.ts — 26-line thin message binding, no geometry logic"
  - "src/app/utils/offscreen-image-processor.spec.ts — 8 direct-import cases, no Worker instantiated"
  - "src/app/workers/image-processing.worker.spec.ts — real-worker round-trip spec (written because verdict: real-worker-supported)"
affects: [04-09, 04-10]

tech-stack:
  added: []
  patterns:
    - "Algorithm-in-a-plain-module, worker-as-thin-binding: offscreen-image-processor.ts is an ordinary importable module; image-processing.worker.ts only wires postMessage/onmessage to it. This lets 04-09's parity test exercise the real OffscreenCanvas code path by direct import, with no Worker instantiation required, regardless of the Karma worker verdict."
    - "Blob-based result types (not File-based) so results cross a postMessage boundary via structured clone without extra wrapping."

key-files:
  created:
    - src/app/utils/offscreen-image-processor.ts
    - src/app/utils/offscreen-image-processor.spec.ts
    - src/app/workers/image-processing.protocol.ts
    - src/app/workers/image-processing.worker.ts
    - src/app/workers/image-processing.worker.spec.ts
  modified: []

key-decisions:
  - "verdict quoted verbatim from 04-WORKER-SPIKE.md: `real-worker-supported`, `builder_mode_changed: yes`. Because of this verdict, a real-worker round-trip spec was written (image-processing.worker.spec.ts) using new Worker(new URL('./image-processing.worker', import.meta.url), { type: 'module' }) — this is the strategy the plan calls for when the spike records real-worker-supported, rather than the mock-only fallback."
  - "Crop output MIME rule mirrors the main-thread path's retained canvasToFile helper exactly: PNG input stays PNG, everything else encodes as JPEG at quality 0.95 (CROP_JPEG_QUALITY constant), independent of the compress path's decideOutputFormat decision (which governs compressImageOffscreen instead)."
  - "Both cropImageOffscreen and compressImageOffscreen always close() their decoded ImageBitmap in a finally block, and never reject — every failure path resolves success: false with an error string, matching the main-thread service's contract so a future dispatch layer (04-10) can treat both paths identically."

patterns-established:
  - "Worker entry points in this repo delegate 100% of algorithmic logic to a plain, non-Angular module; the entry point itself is only a postMessage/onmessage binding with a try/catch that turns any escaping error into an error-kind response."

requirements-completed: [PERF-03]

coverage:
  - id: D1
    description: "OffscreenCanvas-based cropImageOffscreen and compressImageOffscreen implemented via createImageBitmap + OffscreenCanvas + convertToBlob, consuming image-processing-core.ts for every geometry/format decision, with the D-11 byte-fidelity carve-out documented in the module header"
    requirement: "PERF-03"
    verification:
      - kind: unit
        ref: "pnpm exec tsc --noEmit (typecheck, exits 0)"
        status: pass
      - kind: unit
        ref: "grep-based acceptance criteria (exported symbols, 1x core-module import, 2x createImageBitmap, 2x convertToBlob, 0x @angular, 0x document./FileReader/new Image(, 0x reference-lib, 2x .close())"
        status: pass
      - kind: unit
        ref: "src/app/utils/offscreen-image-processor.spec.ts (8 it() blocks, scoped Karma run: 8 SUCCESS)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Type-only image-processing.protocol.ts (ImageWorkerRequest/ImageWorkerResponse with correlating id + kind) and a 26-line image-processing.worker.ts thin binding containing no geometry logic and no build-config additions"
    requirement: "PERF-03"
    verification:
      - kind: unit
        ref: "grep-based acceptance criteria (0 runtime declarations in protocol.ts, 26 lines in worker.ts, 1x offscreen-image-processor import, 1x self.onmessage, 3x self.postMessage, 0x geometry-function names, 0x reference-lib, no tsconfig.worker.json, no webWorkerTsConfig)"
        status: pass
      - kind: unit
        ref: "pnpm exec tsc --noEmit (typecheck, exits 0)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Real-worker round-trip spec exercising image-processing.worker.ts end-to-end via new Worker(new URL(...), { type: 'module' }), written because 04-WORKER-SPIKE.md records verdict: real-worker-supported"
    requirement: "PERF-03"
    verification:
      - kind: unit
        ref: "src/app/workers/image-processing.worker.spec.ts (scoped Karma run: 1 SUCCESS)"
        status: pass
      - kind: unit
        ref: "grep -c '^verdict: real-worker-supported$' 04-WORKER-SPIKE.md returns 1, confirming the file's existence is correct per the plan's conditional rule"
        status: pass
    human_judgment: false
  - id: D4
    description: "No regression to the rest of the suite: full headless Karma run adds exactly the 9 new tests from this plan with 0 new failures, and pnpm run build succeeds with the new worker file present"
    requirement: "PERF-03"
    verification:
      - kind: unit
        ref: "Full suite: 500 total / 471 SUCCESS / 29 FAILED — same 29 failure names as the phase's documented baseline (see Issues Encountered)"
        status: pass
      - kind: other
        ref: "ng build (exit 0)"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-07-30
status: complete
---

# Phase 04 Plan 08: Off-Main-Thread OffscreenCanvas Image Processing Summary

**Built the OffscreenCanvas crop/compress implementation (`offscreen-image-processor.ts`), the typed worker message protocol, and a 26-line thin worker entry point — all consuming the shared `image-processing-core.ts` module so worker and main-thread geometry match by construction, plus a real `new Worker(...)` round-trip spec since the 04-04 spike proved that path works under this repo's headless Karma.**

## Performance

- **Duration:** 12 min
- **Tasks:** 3/3 completed
- **Files modified:** 5 (all new files)

## Accomplishments
- `offscreen-image-processor.ts`: `cropImageOffscreen` and `compressImageOffscreen`, decoding with `createImageBitmap` and encoding with `OffscreenCanvas.convertToBlob`, delegating every crop-bounds, resize, transparency, and output-format decision to `image-processing-core.ts` (D-10, D-12). Documents the D-11 byte-fidelity carve-out inline: encoded bytes are not expected to match the main-thread `HTMLCanvasElement.toBlob` path byte-for-byte.
- `image-processing.protocol.ts`: type-only `ImageWorkerRequest`/`ImageWorkerResponse` discriminated unions on a `kind` field, each carrying a correlating `id` so a stray or duplicated worker message is detectable (T-04-23).
- `image-processing.worker.ts`: a 26-line thin message binding — `self.onmessage` switches on `kind`, awaits the matching processor function, posts back the response, and wraps everything in `try`/`catch` so a thrown failure always produces an `error`-kind response (T-04-22). Contains zero geometry-function references.
- `offscreen-image-processor.spec.ts`: 8 direct-import test cases (crop with padding, no-crop-needed, under-threshold rejection, undecodable input; compress with dimension clamping, transparency-preserving vs. format-converting, undecodable input) — no `TestBed`, no `Worker` instantiated.
- `image-processing.worker.spec.ts`: a real-worker round-trip test using `new Worker(new URL('./image-processing.worker', import.meta.url), { type: 'module' })`, written because `04-WORKER-SPIKE.md` records `verdict: real-worker-supported`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create the OffscreenCanvas crop and compress implementation** - `9263356` (feat)
2. **Task 2: Define the worker message protocol and the thin worker entry point** - `23e011f` (feat)
3. **Task 3: Spec the OffscreenCanvas processor, and the worker round-trip only if the spike allows it** - `c1d898d` (test)

**Plan metadata:** (this commit) - `docs(04-08): complete plan`

## Files Created/Modified
- `src/app/utils/offscreen-image-processor.ts` - Angular-free module exporting `cropImageOffscreen`, `compressImageOffscreen`, `OffscreenCropResult`, `OffscreenCompressResult`. Decode via `createImageBitmap`, encode via `OffscreenCanvas.convertToBlob`; all geometry from `image-processing-core.ts`. Always closes decoded bitmaps; never rejects.
- `src/app/utils/offscreen-image-processor.spec.ts` - 8 `it()` cases against real canvas-backed `Blob` fixtures (built via `OffscreenCanvas`/`convertToBlob`), run in real headless Chrome with no Worker and no `TestBed`.
- `src/app/workers/image-processing.protocol.ts` - Type-only `ImageWorkerRequest`/`ImageWorkerResponse`, imported by both the worker and (in 04-10) the driving service.
- `src/app/workers/image-processing.worker.ts` - 26-line thin binding over the processor module; no algorithm, no option-merging, no geometry logic.
- `src/app/workers/image-processing.worker.spec.ts` - Real-worker round-trip: posts a crop request, asserts the response's geometry matches a direct call to `cropImageOffscreen` on the identical fixture.

## Decisions Made
- **Spike verdict quoted verbatim:** `verdict: real-worker-supported`, `builder_mode_changed: yes` (from `04-WORKER-SPIKE.md`). Per the plan's conditional rule, this means `image-processing.worker.spec.ts` **was created** with a genuine `new Worker(...)` instantiation rather than being skipped in favor of the mock-only fallback.
- Crop-path output MIME rule (PNG stays PNG, everything else → JPEG at quality 0.95) is a separate, simpler rule than the compress path's `decideOutputFormat` decision — this exactly mirrors the asymmetry already present in the pre-existing main-thread `canvasToFile` vs. `canvasToCompressedFile` helpers, so the crop path was not forced through the compress path's format-decision function.
- Both processor functions resolve `success: false` on any error rather than rejecting, and always `close()` the decoded `ImageBitmap` in a `finally` block — matching the main-thread service's error contract exactly so a future dispatch layer can treat both paths uniformly.

## Deviations from Plan

None - plan executed exactly as written. All three tasks match their `<action>` and `<acceptance_criteria>` blocks; the worker-spec conditional was resolved per the recorded spike verdict as the plan specifies.

## Issues Encountered

- **`pnpm run typecheck` / `pnpm exec ng test` could not resolve their binaries** because this worktree has no local `node_modules` (by design, per orchestrator notes). Worked around by invoking the resolved binaries directly: `/home/user/Development/SizeComparisonSite/node_modules/.bin/tsc --noEmit` and `node /home/user/Development/SizeComparisonSite/node_modules/@angular/cli/bin/ng.js test ...`. This is a worktree-execution detail, not a plan deviation.
- **Full-suite baseline interpretation:** the orchestrator's documented baseline at this worktree's base commit (`b2b13ec`) is 491 total / 462 SUCCESS / 29 FAILED, all 29 pre-existing and inherited from Phase 3. After this plan's 9 new tests (8 in `offscreen-image-processor.spec.ts`, 1 in `image-processing.worker.spec.ts`), the full suite reports **500 total / 471 SUCCESS / 29 FAILED** — the exact same 29 failing test names, verified by diffing the full list (`AttachmentSidebarComponent Scale Slider Settings` x2, `CategoryDropdownComponent should create` x1, `CompareModalComponent Horizontal Flip` x5, `CompareModalComponent On Top Toggle` x4, `ComparisonPanelComponent Integration with Size Slider` x5, `ImageDisplayComponent Overlay Positioning` x1, `ImageDisplayComponent Scaling Constraints and Container Positioning` x2, `ManageModalComponent` x4, `SizeSliderComponent Measurement Formatting` x2, `UploadModalComponent` x3). **Zero new failures introduced.** The `ng test` process itself exits 1 (Karma's exit code reflects the pre-existing 29 failures), which is expected and does not indicate a regression from this plan — per orchestrator guidance, "0 FAILED" verification criteria are interpreted as "no new failures vs. the 29-failure baseline."
- `pnpm run build` succeeds (exit 0). The new worker file is **not** included in the production bundle output as a lazy chunk, because no service imports `image-processing.worker.ts` yet — 04-09/04-10 are the plans that wire a driving service to it. This matches the plan's stated scope ("This plan adds no dispatch logic to `ImageProcessingService`").

## Next Phase Readiness
- `src/app/utils/offscreen-image-processor.ts` exports `cropImageOffscreen`, `compressImageOffscreen`, `OffscreenCropResult`, `OffscreenCompressResult` — ready for 04-09's parity test to import directly (no Worker needed) and compare against the main-thread path from 04-07.
- `src/app/workers/image-processing.protocol.ts` exports `ImageWorkerRequest`, `ImageWorkerResponse` — ready for 04-10's `ImageProcessingService` dispatch layer to import and drive `image-processing.worker.ts`.
- `src/app/workers/image-processing.worker.ts` is proven to bundle and round-trip a real message under this repo's headless Karma command (`image-processing.worker.spec.ts`, 1 SUCCESS) and under the production esbuild `build` target (once a future plan references it).
- No blockers. No serialization version bump owed (`CURRENT_VERSION` stays at `1.0.11` — this module carries no serialized state).

---
*Phase: 04-subscription-render-performance-hardening*
*Completed: 2026-07-30*

## Self-Check: PASSED

- FOUND: src/app/utils/offscreen-image-processor.ts
- FOUND: src/app/utils/offscreen-image-processor.spec.ts
- FOUND: src/app/workers/image-processing.protocol.ts
- FOUND: src/app/workers/image-processing.worker.ts
- FOUND: src/app/workers/image-processing.worker.spec.ts
- FOUND: .planning/phases/04-subscription-render-performance-hardening/04-08-SUMMARY.md
- FOUND commit: 9263356 (Task 1)
- FOUND commit: 23e011f (Task 2)
- FOUND commit: c1d898d (Task 3)

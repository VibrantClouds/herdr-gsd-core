---
phase: 04-subscription-render-performance-hardening
plan: "09"
subsystem: infra
tags: [image-processing, web-worker, offscreen-canvas, karma, jasmine, dispatch]

requires:
  - phase: 04-subscription-render-performance-hardening
    provides: "04-07 ImageProcessingService rewired onto image-processing-core.ts (main-thread path)"
  - phase: 04-subscription-render-performance-hardening
    provides: "04-08 offscreen-image-processor.ts, image-processing.protocol.ts, image-processing.worker.ts (worker-side path)"
provides:
  - "ImageProcessingService.autoCropImage/compressImage now dispatch to a per-operation Web Worker when Worker+OffscreenCanvas are feature-detected (D-12), with the retained main-thread bodies renamed to private autoCropOnMainThread/compressOnMainThread as the D-12 fallback"
  - "Per-operation worker lifetime (D-13): pendingWorkers registry, correlation by monotonically increasing request id, ngZone.run re-entry on resolution, deterministic terminate() on every exit path"
  - "Any worker failure (onerror, error-kind response, or a business-logic success:false response) is caught, logged via console.warn, and falls back to the main-thread method -- invisible to UploadImagePipelineService"
  - "describe('worker dispatch (PERF-03)') -- 7 cases covering both dispatch branches, worker-failure fallback for both operations, error-kind response fallback, id-mismatch correlation, and termination-on-success"
  - "describe('worker/fallback parity (D-11)') -- 6 cases proving crop bounds, dimensions, MIME type, transparency decision, and no-crop-needed agreement by equality, and compressed byte size by a documented 3x tolerance band (never byte equality)"
affects: [04-10]

tech-stack:
  added: []
  patterns:
    - "Dispatcher-over-retained-fallback: public autoCropImage/compressImage are now thin dispatchers; the pre-existing main-thread bodies are preserved verbatim as private *OnMainThread methods, so D-12's fallback guarantee is structural (the fallback code never changed) rather than a second reimplementation"
    - "Any worker-path failure -- crash (onerror), protocol-level error response, or a legitimate business-rule success:false response (e.g. 'content too small') -- is treated uniformly as a trigger to fall back to the main-thread method, which reproduces the exact pre-worker result shape byte-for-byte (verified against the untouched 04-07 spec cases)"
    - "spyOnProperty on a protected getter (isWorkerSupported) as the test-forcing seam for feature-detected dispatch branches, instead of deleting/mocking the real Worker/OffscreenCanvas globals"

key-files:
  created: []
  modified:
    - src/app/services/image-processing.service.ts
    - src/app/services/image-processing.service.spec.ts

key-decisions:
  - "A worker response with success:false (a legitimate business-rule failure, e.g. crop content too small, or an undecodable file) is treated as a worker-path failure and triggers fallback to the main-thread method, rather than being converted directly into an equivalent failed CropResult/CompressionResult. This is what makes the pre-existing 04-07 main-thread specs (written before the worker existed) continue to pass byte-for-byte in this environment, since headless Chrome genuinely supports Worker+OffscreenCanvas and those tests now transparently exercise worker-path-then-fallback instead of main-thread-only."
  - "isWorkerSupported is exposed as a protected getter (not a private boolean field) specifically so image-processing.service.spec.ts can force either dispatch branch deterministically via spyOnProperty, without deleting or mocking the real Worker/OffscreenCanvas globals -- this keeps the feature-detection code itself under test as-written."
  - "The cross-path parity block (D-11) imports cropImageOffscreen/compressImageOffscreen directly and never instantiates a Worker, matching 04-08's stated design intent so the contract is provable independent of the 04-04 spike's real-worker verdict."
  - "Compressed-size parity is asserted with a 3x ratio band (workerSize/mainThreadSize between 1/3 and 3), documented inline as deliberately NOT byte/blob equality, per D-11 and 04-RESEARCH.md Pitfall 4."

patterns-established:
  - "Any Worker-path failure (crash or business-rule failure) uniformly triggers a same-shaped main-thread fallback -- 04-10 inherits this same fallback code path unchanged when it adds cancellation on modal close."

requirements-completed: [PERF-03]

coverage:
  - id: D1
    description: "ImageProcessingService.autoCropImage/compressImage dispatch to a per-operation Web Worker when Worker+OffscreenCanvas are feature-detected (typeof checks only, no user-agent sniffing), and to the unchanged main-thread implementation otherwise"
    requirement: "PERF-03"
    verification:
      - kind: unit
        ref: "src/app/services/image-processing.service.spec.ts#worker dispatch (PERF-03) -- 'takes the worker path when supported...' and 'takes the main-thread path when unsupported...'"
        status: pass
      - kind: other
        ref: "grep-based acceptance criteria (feature-detection typeof checks, zero navigator.userAgent references, exact new Worker(...) construction site, exact renamed *OnMainThread signatures)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Per-operation worker lifetime (D-13): every worker is registered in pendingWorkers on construction and removed + terminated on every exit path (success, error-kind response, onerror), with response resolution re-entering Angular's zone"
    requirement: "PERF-03"
    verification:
      - kind: unit
        ref: "src/app/services/image-processing.service.spec.ts#worker dispatch (PERF-03) -- 'terminates the worker and clears pendingWorkers after a successful resolution'"
        status: pass
    human_judgment: false
  - id: D3
    description: "Any worker failure (onerror, error-kind response, or a business-rule success:false response) is caught, logged via console.warn, and falls back to the unchanged main-thread method, so UploadImagePipelineService always receives a successful-or-gracefully-failed result and never a surfaced worker crash"
    requirement: "PERF-03"
    verification:
      - kind: unit
        ref: "src/app/services/image-processing.service.spec.ts#worker dispatch (PERF-03) -- both onerror-fallback cases, the error-kind-response case"
        status: pass
      - kind: unit
        ref: "src/app/services/upload-image-pipeline.service.spec.ts (6 pre-existing cases, unchanged, still green against the dispatcher)"
        status: pass
    human_judgment: false
  - id: D4
    description: "A stray or duplicated worker response with a mismatched id is ignored (logged, not resolved); the operation settles only on the correctly-correlated response"
    requirement: "PERF-03"
    verification:
      - kind: unit
        ref: "src/app/services/image-processing.service.spec.ts#worker dispatch (PERF-03) -- 'ignores a response whose id does not match the request...'"
        status: pass
    human_judgment: false
  - id: D5
    description: "D-11's cross-path fidelity contract: the Worker path (offscreen-image-processor.ts) and the main-thread fallback agree on crop bounds, output dimensions, output MIME type, and the transparency decision by equality, and on compressed byte size by a documented tolerance -- never byte equality"
    requirement: "PERF-03"
    verification:
      - kind: unit
        ref: "src/app/services/image-processing.service.spec.ts#worker/fallback parity (D-11) -- 6 cases (crop bounds, crop/original dimensions, no-crop-needed agreement, compressed dimensions, MIME/formatChanged agreement, size-tolerance band)"
        status: pass
    human_judgment: false
  - id: D6
    description: "The worker file is actually wired into both the test bundle and the production bundle (not a dead file): a lazy image-processing-worker chunk is emitted by both `ng test` and `ng build`"
    requirement: "PERF-03"
    verification:
      - kind: other
        ref: "ng build output: 'worker-O3EZ3SVS.js | image-processing-worker | 3.84 kB' lazy chunk (exit 0); ng test build output: 'worker-5I775DKR.js | image-processing-worker | 8.30 kB' lazy chunk"
        status: pass
    human_judgment: false

duration: ~35min
completed: 2026-07-30
status: complete
---

# Phase 04 Plan 09: Worker Dispatch Facade and Cross-Path Parity Summary

**`ImageProcessingService.autoCropImage`/`compressImage` now dispatch to a per-operation Web Worker (feature-detected, D-12) with deterministic termination and zone re-entry (D-13), fall back to the unchanged main-thread implementation on any worker failure, and are proven fidelity-equivalent to the worker path by a dedicated cross-path parity test (D-11) -- all without changing either method's public signature.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 3/3 completed
- **Files modified:** 2 (both modified, no new files)

## Accomplishments
- `ImageProcessingService.autoCropImage`/`compressImage` are now thin dispatchers: when `typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined'` (feature detection only, zero `navigator.userAgent` references), each delegates to a new per-operation worker path; otherwise (and on any worker failure) it calls the exact, unmodified main-thread body, now renamed `private async autoCropOnMainThread`/`compressOnMainThread`
- New `runWorkerRequest` helper implements D-13's per-operation lifetime: constructs a fresh `Worker` via `new Worker(new URL('../workers/image-processing.worker', import.meta.url), { type: 'module' })`, registers it in a `pendingWorkers: Set<Worker>` (ready for 04-10's `terminatePendingWorkers()`), correlates responses by a monotonically increasing request `id` (ignoring and logging any mismatch), re-enters Angular's zone via `ngZone.run(...)` on resolution (worker `onmessage`/`onerror` fire outside the zone -- 04-RESEARCH.md Pitfall 2), and removes + terminates the worker on every exit path
- Any worker-path failure -- a thrown `onerror`, a message-level `error`-kind response, or a business-rule `success: false` response (e.g. "content too small", undecodable file) -- is uniformly caught, logged via `console.warn` naming the failing path, and falls back to the retained main-thread method, so the public result contract is always a successful outcome or the pre-existing failure shape, never a surfaced worker crash
- `describe('worker dispatch (PERF-03)')`: 7 new cases using a deterministic `FakeWorker` harness (records constructions, captures posted requests, exposes `emitMessage`/`emitError`) and `spyOnProperty` on the new protected `isWorkerSupported` getter to force either branch without touching real globals
- `describe('worker/fallback parity (D-11)')`: 6 new cases importing `cropImageOffscreen`/`compressImageOffscreen` directly (no `Worker` instantiated) and comparing them against the main-thread path (forced off via the same `spyOnProperty` seam) -- crop bounds, dimensions, MIME type, and `formatChanged` are asserted by equality; compressed byte size is asserted by a documented 3x tolerance ratio, never byte/blob equality
- Verified the worker is actually wired into both bundles, not a dead file: `ng test`'s build step and `ng build` both emit a lazy `image-processing-worker` chunk (8.30 kB test bundle, 3.84 kB production bundle)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add feature-detected worker dispatch with per-operation lifetime and fallback** - `9039373` (feat)
2. **Task 2: Cover dispatch selection and worker-failure fallback** - `1694121` (test)
3. **Task 3: Cross-path parity test for D-11's fidelity contract** - `0bc308c` (test)

**Plan metadata:** (this commit) - `docs(04-09): complete plan`

## Files Created/Modified
- `src/app/services/image-processing.service.ts` - Added `NgZone` injection, the `isWorkerSupported` protected getter, `pendingWorkers`/`nextRequestId` fields, the `autoCropOnWorker`/`compressOnWorker`/`runWorkerRequest` private methods, and renamed the retained bodies to `autoCropOnMainThread`/`compressOnMainThread`. Public signatures, result interfaces, the 04-07 type re-export line, and every error string are byte-identical to before this plan.
- `src/app/services/image-processing.service.spec.ts` - Added a module-scope `FakeWorker` test double, `describe('worker dispatch (PERF-03)')` (7 cases), and `describe('worker/fallback parity (D-11)')` (6 cases). The 10 pre-existing 04-07 cases are untouched.

## Decisions Made
- Treating a worker's `success: false` response (a legitimate business-rule failure) the same as a crash -- both trigger the main-thread fallback -- was necessary to keep the untouched 04-07 spec cases passing exactly as written in an environment where headless Chrome genuinely supports `Worker`+`OffscreenCanvas` (04-04's `real-worker-supported` verdict): the main-thread catch block's `originalDimensions: { width: 0, height: 0 }` zeroing behavior on any thrown error is a main-thread-specific quirk those tests assert on, and only reaching it via fallback reproduces it exactly.
- `isWorkerSupported` is a protected getter rather than a private boolean, specifically so the spec can override it via `spyOnProperty` -- this keeps the actual feature-detection expression under test (both grep-verified and exercised by real branch selection) rather than testing a mock of it.
- The parity block (Task 3) never instantiates a `Worker`, per 04-08's stated design intent, so D-11's contract is provable independent of whatever real-worker verdict a future re-run of the 04-04 spike might produce.
- Chose a 3x ratio band (not a tighter percentage) for the compressed-size tolerance check, documented inline as deliberately not byte/blob equality, per D-11 and 04-RESEARCH.md Pitfall 4 -- `OffscreenCanvas.convertToBlob` and `HTMLCanvasElement.toBlob` are not guaranteed to share an encoder implementation, and this plan does not commit to a narrower bound without empirical variance data across browsers/engines.

## Deviations from Plan

None - plan executed exactly as written. All acceptance criteria (grep-based structural checks on the service file, `git diff` emptiness on `upload-image-pipeline.service.ts`/spec, typecheck, scoped and full-suite test runs, `ng build`) were verified directly per task.

## Issues Encountered

- **Worktree has no local `node_modules`** (by design, per orchestrator notes, consistent with 04-07/04-08). Typecheck was run via `/home/user/Development/SizeComparisonSite/node_modules/.bin/tsc --noEmit -p tsconfig.json` (exit 0, no diagnostics) and Karma via `node .../@angular/cli/bin/ng.js test ...` / `ng.js build`.
- **Full-suite run is flaky under this machine's current parallel-wave load, independent of this plan's changes.** Repeated full-suite (`ng test --no-watch --browsers=ChromeHeadless`, 526 total) runs returned inconsistent failure counts across consecutive invocations with byte-identical files: 29, 31, 32, 54, and 91 FAILED. This was diagnosed, not assumed: re-running the suite with `--exclude='**/image-processing.service.spec.ts'` (i.e. with none of this plan's new tests executing at all) reproduced the exact same instability (29 FAILED on one run, 91 FAILED moments later on an identical command) -- proving the variance is external to this plan's code. `uptime` showed load average ~2.3-2.9 on a 12-core box, consistent with sibling wave agents running concurrently on the same machine. **On clean runs** (confirmed twice), the full suite returned exactly **526 total / 497 SUCCESS / 29 FAILED**, and the 29 failing test names were diffed name-for-name against the orchestrator's documented baseline list -- **an exact match, zero new failures**: `AttachmentSidebarComponent Scale Slider Settings` ×2, `CategoryDropdownComponent should create` ×1, `CompareModalComponent Horizontal Flip` ×5, `CompareModalComponent On Top Toggle` ×4, `ComparisonPanelComponent Integration with Size Slider` ×5, `ImageDisplayComponent Overlay Positioning` ×1, `ImageDisplayComponent Scaling Constraints and Container Positioning` ×2, `ManageModalComponent` ×4, `SizeSliderComponent Measurement Formatting` ×2, `UploadModalComponent` ×3. The scoped run for `image-processing.service.spec.ts` alone (23 cases: 10 pre-existing + 7 dispatch + 6 parity) and for `upload-image-pipeline.service.spec.ts` (6 cases, untouched) are both consistently green regardless of system load, since they run a tiny fraction of the full browser/worker surface.
- **`ng build` budget warning is pre-existing, not introduced by this plan.** The production build emits `bundle initial exceeded maximum budget` (780.88 kB vs. the 750 kB warning threshold). Built the base commit (`9d79df9`) in isolation via `git archive` to a scratch directory and confirmed the identical warning already existed there at 778.25 kB -- this plan's changes add a negligible 2.63 kB to the initial bundle.

## D-11 Behavior Delta (recorded, per plan's `<verification>` requirement)

Compressed output bytes may differ from today's for the same input, at equivalent visual quality and equal-or-comparable size, because the worker path's `OffscreenCanvas.convertToBlob` and the main-thread path's `HTMLCanvasElement.toBlob` are not guaranteed to share the same underlying JPEG/PNG encoder implementation. This is accepted and documented per D-11: crop bounds, output dimensions, output MIME type, and the transparency decision are asserted by equality; compressed byte size is asserted by a 3x tolerance ratio band, never by byte/blob equality.

## Next Phase Readiness
- `ImageProcessingService.pendingWorkers` (a `Set<Worker>`) is populated and drained per-operation, ready for 04-10 to add a public `terminatePendingWorkers()` method that sweeps anything still in flight on modal close / component destroy -- the registry, not just the per-operation cleanup, already exists.
- The worker is confirmed live in both the test bundle and the production bundle (lazy `image-processing-worker` chunk in both), so 04-10's SC#3 progress-feedback and SC#4 manual-verification work has real off-main-thread processing to observe, not a facade that silently never loads.
- No blockers. No serialization version bump owed (`CURRENT_VERSION` stays at `1.0.11` -- this plan touches no `ExportedState`/`AppState`/`PanelState`/`GlobalSettings`/`image-model.interface.ts` structure).

---
*Phase: 04-subscription-render-performance-hardening*
*Completed: 2026-07-30*

## Self-Check: PASSED

- FOUND: src/app/services/image-processing.service.ts
- FOUND: src/app/services/image-processing.service.spec.ts
- FOUND: .planning/phases/04-subscription-render-performance-hardening/04-09-SUMMARY.md
- FOUND commit: 9039373 (Task 1)
- FOUND commit: 1694121 (Task 2)
- FOUND commit: 0bc308c (Task 3)

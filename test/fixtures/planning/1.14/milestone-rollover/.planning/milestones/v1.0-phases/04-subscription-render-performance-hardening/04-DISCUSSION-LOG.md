# Phase 4: Subscription & Render Performance Hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-30
**Phase:** 4-Subscription & Render Performance Hardening
**Areas discussed:** Teardown scope & pattern, Shared resize service shape, Worker port & output fidelity, Progress feedback granularity

---

## Teardown scope & pattern

### Q1 — How wide should the PERF-01 fix go?

| Option | Description | Selected |
|--------|-------------|----------|
| Genuine leaks only | Fix the three sites with no teardown at all: AppComponent (7 subs, no ngOnDestroy), model-selector.component.ts:48, attachment-selector.component.ts:82. Leave the 8 manually-unsubscribing components alone. Smallest diff, lowest regression risk — but two cleanup styles remain. | ✓ |
| Leaks + standardize components | Above, plus converting the 8 manual-Subscription components to the same declarative pattern. One idiom everywhere; larger mechanical diff across modals Phase 5 will then test. | |
| Leaks + root services too | Above, plus root-provided services that subscribe forever (viewport, seo, site-mode, model-attachment-defaults). They live for the app lifetime by design, so this is arguably churn — but closes the audit completely. | |

**User's choice:** Genuine leaks only
**Notes:** Scouting established that 8 components already clean up correctly via manual `Subscription` fields, so "similarly leaking" resolves to three sites, not a codebase sweep.

### Q2 — Which teardown mechanism?

| Option | Description | Selected |
|--------|-------------|----------|
| takeUntil(destroy$) | Roadmap and PERF-01 word it this way literally; already the in-repo pattern (image-display:42-55, comparison-panel, compare-modal, penetration-modal, manage-modal). Matches SC#1 verbatim. Costs a destroy$ Subject + ngOnDestroy per component. | ✓ |
| takeUntilDestroyed() | Angular 16+ rxjs-interop; no Subject or ngOnDestroy boilerplate, cleanup structural rather than disciplinary. Deviates from SC#1's wording, and needs an injection context — AppComponent subscribes in async ngOnInit, so those 7 would move to field initializers or need an explicit DestroyRef. | |
| takeUntil + async pipe | takeUntil for the two selectors; delete AppComponent's subscriptions entirely and bind `| async` instead, since they only mirror observables into fields. Nothing to tear down — but a large template diff, and app.component.html:142-147 was just touched in Phase 3. | |

**User's choice:** takeUntil(destroy$)
**Notes:** Chosen for literal SC#1 compliance and consistency with the existing pattern.

### Q3 — How to fix the two selector sites?

Context surfaced during the question: `getAllModels()` is `combineLatest([http, userModels$])` + `shareReplay(1)`, so it never completes. Each dropdown change adds a permanent subscription that re-fires on every model upload/delete.

| Option | Description | Selected |
|--------|-------------|----------|
| take(1) + takeUntil | Each dropdown change consumes exactly one emission, plus takeUntil for the in-flight case. Kills both accumulation and the stale re-fire. A named, deliberate behavior fix. | ✓ |
| takeUntil only | Literal PERF-01 compliance and strictly behavior-preserving: leak stops at destroy, but subscriptions still accumulate per change and the stale re-fire remains. Leaves a known bug for later. | |
| take(1) only | Self-terminating, nothing accumulates, no destroy$ needed. Smallest diff — but a subscription opened just before destroy can still fire once into a dead component, and it misses SC#1's literal wording. | |

**User's choice:** take(1) + takeUntil
**Notes:** Accepted behavior delta — a model upload no longer re-applies a previous dropdown selection.

### Q4 — How should PERF-01 be verified?

| Option | Description | Selected |
|--------|-------------|----------|
| Per-component regression specs | Destroy the fixture, push a new emission, assert the handler didn't run. Mirrors Phase 3's destroy-mid-drag regression test. Note the three spec files may need DI scaffolding. | ✓ |
| Specs + selector behavior test | Above, plus an explicit test that a userModels$ emission does NOT re-set the panel model / re-emit attachmentSelected. Covers the named behavior delta, not just the leak. | |
| Audit only, defer tests | Verify by code review against SC#1; leave coverage to Phase 5. Keeps the phase focused; risks silent regression. | |

**User's choice:** Per-component regression specs
**Notes:** The selector behavior test was not folded in — noted in CONTEXT.md as a small optional add-on, otherwise Phase 5.

---

## Shared resize service shape

### Q1 — Which of the 5 ResizeObserver sites join?

| Option | Description | Selected |
|--------|-------------|----------|
| image-display only | Literal PERF-02/SC#2 scope. Ceiling is 2 concurrent instances, so the measurable win is small — but it's exactly what the criterion asks. | |
| image-display + comparison-panel | Adds comparison-panel:262, which observes the same imageContainer family and does near-identical padding math — the closest true duplicate. Leaves compare-modal's two observers and attachment-preview alone. | ✓ |
| All 5 sites | Best consistency, but compare-modal:172 is the #comparisonCanvas mark-pending observer Phase 3 just built for RACE-02, and attachment-preview:195 drives Canvas redraws. Re-plumbing risks regressing fresh race fixes for no SC#2 credit. | |

**User's choice:** image-display + comparison-panel

### Q2 — What API shape?

| Option | Description | Selected |
|--------|-------------|----------|
| observe(el) → Observable<rect> | One root-provided service, single ResizeObserver, element→Subject map. Consumers pipe with takeUntil and unobserve on teardown. Fits the `$`-suffixed convention; comparison-panel already pushes into a containerDimensions$ Subject. | ✓ |
| observe(el, callback) | Imperative registration returning an unsubscribe handle. Closest to current code, smallest behavioral diff — but non-idiomatic here and no composability for debounce/distinctUntilChanged. | |
| Directive-based | Attribute directive with automatic cleanup and declarative opt-in. Cleanest ergonomics, but a brand-new pattern (no directives in src/app today) and both consumers need the rect in TypeScript. | |

**User's choice:** observe(el) → Observable<rect>

### Q3 — How should emissions be coalesced?

| Option | Description | Selected |
|--------|-------------|----------|
| rAF batch + distinctUntilChanged | Callback runs outside Angular; entries from one tick flush in a single requestAnimationFrame inside one ngZone.run(), duplicates dropped. Real consolidation (one CD cycle instead of N) with no perceptible lag. | ✓ |
| distinctUntilChanged only | Strictly synchronous, zero timing risk, trivially behavior-preserving — but "consolidated" reduces to "one observer instead of N" with no change-detection saving. Weakest reading of SC#2. | |
| debounceTime(~16ms) | Literal reading of "debounced", same idiom as viewport.service (200/100ms). Delays every resize by a frame, and a sustained drag keeps resetting the timer so the image visibly trails. Highest regression risk vs. mobile-first/no-jank. | |

**User's choice:** rAF batch + distinctUntilChanged

### Q4 — How should SC#2's multi-display claim be proven?

| Option | Description | Selected |
|--------|-------------|----------|
| Service spec + instance-count assert | Unit-spec the service (single observer, per-element streams, rAF batching, unobserve on teardown) plus a compare-modal test spying on the ResizeObserver constructor asserting exactly one instance across both displays. | ✓ |
| Service spec only | Lighter; leaves the multi-display claim verified by inspection. | |
| Spec + manual multi-display check | Adds a recorded human check for rAF-timing regressions a unit test can't catch, at the cost of a manual step. | |

**User's choice:** Service spec + instance-count assert

---

## Worker port & output fidelity

### Q1 — What must "same output as before" mean?

| Option | Description | Selected |
|--------|-------------|----------|
| Same geometry, not same bytes | Identical crop bounds, output dimensions, MIME type and transparency decision; compressed size within a stated tolerance. Byte-identity explicitly not claimed, reason documented. Testable and honest — the scan/crop math ports exactly, only the encoder differs. | ✓ |
| Byte-identical required | Safest literal reading, but likely forces encoding back onto the main thread (worker scans/crops, main thread encodes), weakening the off-main-thread goal for the compression half. | |
| Visually equivalent | Loosest bar, easiest to satisfy — but not mechanically testable in Karma, so SC#3 would rest on visual inspection. | |

**User's choice:** Same geometry, not same bytes

### Q2 — What happens on browsers without OffscreenCanvas (iOS Safari <16.4)?

**User initially responded:** "What do you recommend?"

**Claude's recommendation:** Keep the main-thread fallback, but only after extracting the geometry math into one shared pure module. Reasoning given: the algorithm (`analyzeImageBounds`, `isEmptyPixel`, `calculateResizedDimensions`, `checkImageTransparency`) is already pure over pixel buffers and numbers — only decode and encode are environment-specific. With the math shared, crop bounds are identical by construction, making the D-11 fidelity contract mechanically guaranteed. Worker-only + shim was ruled out because the shim still decodes/encodes on the main thread, so the responsiveness benefit evaporates while a two-mode protocol is added. Worker-only with no fallback was ruled out because dropping upload for any iOS slice is a user-facing regression in a behavior-preserving milestone. Phase 3's D-01 dual-code-path objection targets duplicated *logic*; this duplicates ~15 lines of plumbing over one shared algorithm.

| Option | Description | Selected |
|--------|-------------|----------|
| Fallback + shared core (recommended) | Extract crop/compress geometry math into one shared pure module consumed by both worker and DOM-canvas fallback; runtime OffscreenCanvas detection. Geometry identical by construction; only plumbing differs. Upload keeps working everywhere. | ✓ |
| Worker-only, no fallback | One code path, simplest structure — accepting a user-facing regression on older iOS. | |
| Worker-only + shim | Always route through the worker; main thread decodes/encodes and transfers ImageData in where OffscreenCanvas is missing. Two-mode message protocol, little responsiveness benefit on the degraded path. | |

**User's choice:** Fallback + shared core (Claude's recommendation, accepted)

### Q3 — Worker lifetime and wiring?

| Option | Description | Selected |
|--------|-------------|----------|
| Per-operation worker | Spawn on processFile(), terminate on resolve and on modal close / destroy so a mid-upload cancel can't leak one. Structurally leak-proof; ~5-20ms spawn cost is negligible against multi-hundred-ms work. | ✓ |
| Lazy long-lived singleton | One worker reused for the app lifetime. Avoids repeat spawn cost, matters for multi-file uploads — but creates exactly the never-torn-down long-lived resource PERF-01 exists to remove. | |
| Worker pool | Sized to hardwareConcurrency for parallel multi-file processing. Most machinery for the least certain benefit. | |

**User's choice:** Per-operation worker

### Q4 — How should the Worker port be tested?

| Option | Description | Selected |
|--------|-------------|----------|
| Core specs + parity test | Exhaustive unit tests of the shared pure core against synthetic ImageData fixtures, plus a parity test running one fixture through worker and fallback paths asserting identical geometry. Directly proves the SC#3 contract; needs confirmation that a real worker instantiates under the Karma builder. | ✓ |
| Core specs + mocked worker | Same core specs, worker mocked at the service boundary. Avoids the Karma-worker question; leaves worker execution verified only by manual upload. | |
| Core specs only | Fallback path exercises the core in-suite; worker shell and parity claim left to manual verification. | |

**User's choice:** Core specs + parity test
**Notes:** No worker infrastructure exists in the repo today (no src/app/workers, no tsconfig.worker.json, no webWorkerTsConfig). Flagged in CONTEXT.md as something the planner must validate early rather than assume.

---

## Progress feedback granularity

### Q1 — What replaces or extends the existing indeterminate indicator?

| Option | Description | Selected |
|--------|-------------|----------|
| Staged labels | Worker posts a stage message at each boundary ('Decoding…' → 'Cropping…' → 'Compressing…' → 'Generating preview…'), shown in the existing indicator. Honest, small protocol, no fake interpolation. | |
| True percentage | Instrument the pixel-scan loop to post progress every N rows. Genuinely granular — but only the scan phase reports meaningfully; encode is one opaque convertToBlob call, so the bar jumps then stalls. Adds postMessage overhead in the hot loop. | |
| Keep indeterminate | Argue the existing spinner already satisfies "visible progress feedback" and that the real deliverable is SC#4 (UI stays responsive), which the worker provides. Zero new UI work — but a reviewer reading SC#3 literally could call it unmet. | ✓ |

**User's choice:** Keep indeterminate

### Q2 — How should the resulting SC#3 gap be reconciled?

| Option | Description | Selected |
|--------|-------------|----------|
| Document interpretation in CONTEXT | Record that "visible progress feedback" is deemed satisfied by the existing isProcessingImage indicator, with rationale (crop and encode are opaque; a percentage would be fabricated). The verifier reads CONTEXT.md, so it's explicit rather than an apparent oversight. No roadmap edit. | ✓ |
| Amend ROADMAP SC#3 | Edit the criterion to match what will be built. Cleanest for verification, but rewrites a milestone criterion mid-flight. | |
| Minimal upgrade: disable + label | Keep it indeterminate but ensure the submit button stays disabled and the indicator carries explicit text. Near-zero cost; gives the verifier something concrete that changed. | |

**User's choice:** Document interpretation in CONTEXT
**Notes:** Recorded in CONTEXT.md as D-16 with an explicit "live risk the verifier must weigh" flag.

### Q3 — How should SC#4 (UI responsiveness) be proven?

| Option | Description | Selected |
|--------|-------------|----------|
| Manual verification, recorded | Upload a large image, confirm scrolling, name-field typing, and the close button stay responsive during processing — desktop and touch. Fits the existing end-of-phase human_verify gate. Responsiveness is inherently perceptual. | ✓ |
| Manual + main-thread assertion | Above, plus an automated check that the main thread isn't doing the heavy work. Catches a silent regression to main-thread processing a human on a fast machine might miss. | |
| Manual only, no fixture | Same as the first, but the tester supplies their own image. Avoids committing a multi-megabyte binary; less reproducible. | |

**User's choice:** Manual verification, recorded
**Notes:** Whether the large test image is committed to the repo was left open for the planner.

---

## Claude's Discretion

- Name and location of the shared resize service and the shared image-processing core module (`src/app/utils/` follows the `coordinate-transform.ts` / `category-normalization.ts` precedent).
- Whether the padding / `getComputedStyle` math moves into the shared resize service or stays per-consumer (the two consumers subtract different amounts today).
- Whether `image-display.component.ts:72`'s existing `setTimeout(0)` initial update survives the migration.
- The exact worker message protocol shape (envelope, transferable usage).
- Whether `ImageProcessingService` survives as a thin facade over worker + core, or is replaced outright.
- Disposition of `getCropPreview()` — dead code with no callers outside its own file: port or delete.
- How a worker crash or unsupported-format failure surfaces (today: fallback to original with `console.warn` or a user-visible error string).

## Deferred Ideas

- Standardizing the 8 manual-`Subscription` components on `takeUntil` — consistency pass, ideally after Phase 5 puts those modals under test.
- Root-service subscription lifetimes (`viewport`, `seo`, `site-mode`, `model-attachment-defaults`) — no destroy point exists to hang teardown on.
- Consolidating the remaining 3 ResizeObserver sites (`compare-modal:118`, `compare-modal:172`, `attachment-preview:195`) — `:172` is freshly-landed RACE-02 machinery.
- Staged or percentage progress UI for image processing — revisit if processing ever gains a genuinely chunked phase.
- An automated main-thread-responsiveness assertion for SC#4.
- An explicit behavior test for the selector re-fire fix.
- `indexeddb-user-model.service.ts` still has no spec file (carried forward from Phases 2 and 3).

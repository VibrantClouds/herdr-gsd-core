---
phase: 4
slug: subscription-render-performance-hardening
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-30
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `04-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Karma 6.4.0 + Jasmine 5.6.0 |
| **Config file** | None standalone — configured inline in `angular.json` under `projects.size-comparison-tool.architect.test` |
| **Quick run command** | `pnpm exec ng test --no-watch --browsers=ChromeHeadless --include='**/{file}.spec.ts'` |
| **Full suite command** | `CHROME_BIN=<playwright-chromium-path> pnpm exec ng test --no-watch --browsers=ChromeHeadless` (matches `.planning/config.json` `workflow.test_command`) |
| **Estimated runtime** | ~60 seconds (full suite, headless) |

---

## Sampling Rate

- **After every task commit:** Run the quick command scoped to the spec file(s) for the changed source file
- **After every plan wave:** Run the full suite command
- **Before `/gsd-verify-work`:** Full suite must be green, plus the D-17 manual large-upload verification (desktop + touch)
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

Task IDs are assigned by the planner; this table is populated per plan during execution. The
requirement→test contract below is fixed and every task must map into one of these rows.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | PERF-01 | — | `AppComponent` unsubscribes all long-lived subscriptions on destroy; post-destroy emissions are no-ops | unit (regression) | `ng test --include='**/app.component.spec.ts'` | ❌ W0 (extend) | ⬜ pending |
| TBD | TBD | TBD | PERF-01 | — | `model-selector` / `attachment-selector` use `take(1)` + `takeUntil`; do not re-fire on `userModels$` emission | unit (regression) | `ng test --include='**/model-selector.component.spec.ts'` · `**/attachment-selector.component.spec.ts'` | ❌ W0 (extend) | ⬜ pending |
| TBD | TBD | TBD | PERF-02 | — | Shared `ResizeObserverService` constructs exactly one `ResizeObserver`, delivers per-element streams, batches via rAF, unobserves on teardown | unit | `ng test --include='**/resize-observer.service.spec.ts'` | ❌ W0 (new) | ⬜ pending |
| TBD | TBD | TBD | PERF-02 | — | `compare-modal`'s two `image-display` instances share one `ResizeObserver` (constructor spy asserts a single construction) | integration | `ng test --include='**/compare-modal.component.spec.ts'` | ✅ (extend) | ⬜ pending |
| TBD | TBD | TBD | PERF-03 | — | Pure core module produces correct crop bounds / resize dims / transparency handling for synthetic `ImageData` | unit | `ng test --include='**/image-processing-core.spec.ts'` | ❌ W0 (new) | ⬜ pending |
| TBD | TBD | TBD | PERF-03 | — | Worker path and main-thread fallback produce identical geometry for the same fixture (D-11 fidelity contract) | unit (parity) | `ng test --include='**/image-processing.service.spec.ts'` | ❌ W0 (new) | ⬜ pending |
| TBD | TBD | TBD | PERF-03 | — | UI stays responsive (no frozen input/scroll) during a large-image upload — SC#4 | manual | End-of-phase human verification per D-17 | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/app/app.component.spec.ts` — extend with destroy-then-emit regression cases for every long-lived subscription (D-05)
- [ ] `src/app/components/model-selector/model-selector.component.spec.ts` — extend with `take(1)` / no-re-fire regression case (D-05)
- [ ] `src/app/components/attachment-selector/attachment-selector.component.spec.ts` — extend with `take(1)` / no-re-fire regression case (D-05)
- [ ] `src/app/services/resize-observer.service.spec.ts` — new file, new service (D-09)
- [ ] `src/app/utils/image-processing-core.ts` + `.spec.ts` — new pure module extracted from `image-processing.service.ts` (D-12, D-14)
- [ ] `src/app/services/image-processing.service.spec.ts` — **new file; none exists today** (D-14; corrects CONTEXT.md's assumption)
- [ ] `src/app/workers/image-processing.worker.ts` + Karma-instantiation spike — the spike must run and pass **before** the PERF-03 parity test is planned as a hard dependency (D-14, RESEARCH Open Question 1: Karma `builderMode` defaults to `browser`/webpack while the project builds with `application`/esbuild)

*No framework install needed — Karma/Jasmine already configured.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| UI remains responsive (input + scroll unfrozen) during a large-image upload | PERF-03 (SC#4) | D-17 explicitly rejected an automated main-thread-blocking assertion as unreliable in Karma | Upload a ~10MB image via the upload modal on desktop and on a touch device. During processing: type in a text input, scroll the page, and confirm progress feedback advances. Record pass/fail in the phase verification checklist. Do not commit the test image — document its required characteristics (≥10MB, large pixel dimensions, contains transparent margins to exercise auto-crop) instead. |

---

## Validation Sign-Off

- [ ] All tasks have an `<automated>` verify or a declared Wave 0 dependency
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all ❌ MISSING references above
- [ ] Worker-in-Karma spike resolved before PERF-03 parity test is treated as a hard gate
- [ ] No watch-mode flags in any verify command
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

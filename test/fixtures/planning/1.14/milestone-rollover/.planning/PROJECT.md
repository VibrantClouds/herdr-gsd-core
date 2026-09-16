# Size✦Lab

## What This Is

Size✦Lab is an Angular 20 single-page app for comparing object sizes with real-world measurements: a dual-panel interface with advanced scaling, attachment/overlay support with pixel-perfect attachment points, custom user models, and shareable state links.

## Current State

**Shipped: v1.0 Code Health & Hardening (2026-09-08)** — 6 phases, 48 plans. A hardening-only milestone that remediated the technical concerns catalogued in `.planning/codebase/CONCERNS.md`. User-facing behavior is unchanged except where a fix was inherently a behavior fix (race conditions, mixed-case categories dropping models, `horizontalFlip` never restoring on import).

The codebase now has: no modal file over ~600 lines (the three worst were 979/909/856), a named migration registry with per-version fixture coverage for serialized state, no `setTimeout`-based timing guesses in the modal layer, element-owned PointerCapture drags, `takeUntil(destroy$)` teardown on all long-lived subscriptions, a single shared `ResizeObserver`, image processing on a Web Worker with a main-thread fallback, and a 711/711 green test suite (from 336 specs / 52 failures at milestone start).

See `.planning/MILESTONES.md` for the full record and `.planning/milestones/v1.0-*` for archived scope and phase artifacts.

## Current Milestone: v1.1 Measurement Ruler

**Goal:** A ruler can be placed on any rendered model or overlay to read the true size of a span — an arm, a leg — and every ruler reconstructs identically for anyone opening the share link, on any screen size.

**Target features:**

- Viewport ruler placement that hit-tests to detect which model or overlay it landed on
- Both endpoints individually draggable, stored in the target's original-image pixel space
- Multiple rulers per panel, persisted into app state and carried by share links
- True-size readout honoring the global imperial/metric setting and the panel's scale multiplier
- Overlay-aware inches-per-pixel derivation through the `overlayScales` / `scaleRelativeToParent` chain
- One ruler concept in the app — the existing upload/edit calibration ruler becomes the same component in its calibration context rather than a separate tool
- `.planning/codebase/` re-mapped, retiring the spent CONCERNS.md and refreshing structural docs that predate Phase 1's decomposition and Phase 4's service extractions

**What the ruler is not.** It never writes model size. Base size stays an upload-time concern and the
scale slider stays the resize control; a viewport ruler only ever reports. This was the central
correction during milestone scoping — an earlier framing had viewport rulers able to recalibrate a
model, and that design is explicitly not wanted.

**The arithmetic, for reference.** With `L` = the model's `measurementLine` length in original px (or
`originalDimensions.height` when absent, today's documented default):

```
inchesPerOriginalPixel = (defaultSizeInches.height × panelState.scale) / L
measuredLength         = rulerSpanInOriginalPx × inchesPerOriginalPixel
```

Consistent with `ScalingService.calculateImageDimensions()` by construction. Every input is stored or
state-derived and none is viewport-derived, which is what makes cross-screen share-link parity
structural rather than something to test for.

**Still carried forward, not in v1.1:**

- **Coverage debt (`TESTV2-01..05`)** — dedicated specs for `indexeddb-user-model.service.ts` and `state-management.service.ts`; `attachment-canvas-renderer.service.ts` render helpers (41% stmt / 37% branch, the largest remaining gap); `upload-image-pipeline.service.ts` worker-dispatch branches (57% branch); the dropdown re-fire regression test.
- **User features (`FEAT-01..04`)** — undo/redo, model search/filter, attachment import/export between models, multi-device sync. Net-new, deliberately excluded from v1.0 and still deferred.
- **Anchor-point scaling** — noted in `.claude/skills/feature-planning/`; does not exist today (scaling is uniform/center-based).

## Core Value

Show true-size scale — the height in feet and inches, not pixel measurements — for any two objects side by side, including attachments positioned at pixel-perfect points.

v1.0's core value was a scoped variant of this: *the app behaves identically, but the codebase is materially safer to change*. That was achieved and is now a property of the codebase rather than a goal, so it no longer competes for priority. v1.1 restates core value in product terms and serves it directly: a ruler that reports a span's height in feet and inches is the core value applied to part of an object rather than the whole of one.

## Requirements

### Validated

<!-- v1.0 hardening requirements (all 21, with phase reference) followed by pre-existing product behavior
     that had to survive the milestone intact. Everything below is shipped and verified. -->

- ✓ Decompose `upload-modal` (978 lines) into focused sub-components/services — Phase 1
- ✓ Decompose `attachment-edit-modal` (909 lines) into focused sub-components/services — Phase 1
- ✓ Decompose `attachment-preview` (856 lines) into focused sub-components/services — Phase 1
- ✓ Named version-migration layer in `state-export.service` (ordered `MIGRATIONS` registry + gap-tolerant walker) replacing version-equality-only gating — Phase 2
- ✓ Documented version-deprecation policy in `.claude/rules/state-serialization.md` — Phase 2
- ✓ Per-version fixture regression suite (12 fixtures, one per supported version) proving existing share links still load — Phase 2
- ✓ `CategoryService` reaches `IndexedDBUserModelService` by typed constructor injection, no lazy `Injector` or `any` — Phase 2
- ✓ `penetration-modal` state chain is a signal input + `takeUntil`/`distinctUntilChanged` RxJS lifecycle with no `setTimeout` in `ngOnChanges` — Phase 3
- ✓ `compare-modal` default positions derive from a `ResizeObserver` on the measured element (mark-pending recalculation), 40px POSITION_BUFFER preserved — Phase 3
- ✓ Ruler and angle-dial drags are element-owned via PointerCapture; closing a modal mid-drag leaves no document-level listeners — Phase 3
- ✓ Category strings normalized through a single shared `normalizeCategory` helper at every read/write boundary — Phase 3
- ✓ Auto-save suppression uses a service-owned `applyDefaults()` window closing via `queueMicrotask`, replacing two `setTimeout(…,100)` guesses — Phase 3
- ✓ `AppComponent`, `model-selector` and `attachment-selector` tear down long-lived subscriptions via `takeUntil(destroy$)` on `ngOnDestroy`, with destroy-then-emit regression specs — Phase 4
- ✓ Root-provided `ResizeObserverService` (single rAF-batched `ResizeObserver`) replaces per-instance observers in `image-display` and `comparison-panel`, proven in the compare-modal multi-display scenario — Phase 4
- ✓ Upload auto-crop and compression run off the main thread in a Web Worker (OffscreenCanvas), with a retained main-thread fallback and worker/fallback output-parity specs — Phase 4
- ✓ `attachment-edit-modal.component.spec.ts` covers form population per `editType`, all three save paths with exact-payload assertions, delete/close, adult-mode gating, and subscription teardown — Phase 5
- ✓ `upload-modal` and `attachment-preview` specs exercise core logic paths (canvas interaction, bounds rejection, delete suppression), not just construction — Phase 5
- ✓ Share-link import covered end-to-end via `RouterTestingHarness` (guard → state load → `AppState`), stubbing only global `fetch`, including 404 / malformed-payload / unsupported-version failure paths — Phase 5
- ✓ Upload → attachment-point definition → attachment usage covered as one integration flow against real IndexedDB — Phase 5
- ✓ Full suite green at 694/694 with no skipped or focused specs, and no assertion gated behind an `if` that could silently no-op — Phase 5
- ✓ Upload rejects spoofed files by sniffing actual magic bytes (`sniffImageSignature`), fail-closed, between the type-allowlist and size checks — Phase 6
- ✓ Share-link generation carries a 5s post-success client-side cooldown that starts only on success and is cleared on destroy — Phase 6
- ✓ `.claude/rules/security.md` records in-repo that adult filtering is cosmetic and that upload size/rate limits are backend-owned — Phase 6
- ✓ Dual-panel size comparison with true-size (feet/inches) scaling — existing
- ✓ Attachment/overlay system with original-pixel-coordinate attachment points — existing
- ✓ Interactive attachment preview and attachment-point definition — existing
- ✓ Custom user model upload (crop, compress, ruler measurement) — existing
- ✓ Custom attachment points and model attachment defaults — existing
- ✓ State serialization (MessagePack/JSON) with versioned import/export — existing
- ✓ Share link generation and loading via remote API — existing
- ✓ IndexedDB persistence with LocalStorage migration and iOS private-mode handling — existing
- ✓ Adult-mode content filtering (client-side, cosmetic) — existing
- ✓ Dynamic SEO (title + meta description) based on selected models — existing

### Active

<!-- v1.0's 21 requirements are all in Validated above with phase references. The list below is
     v1.1 scope at capability level; REQ-IDs are assigned in .planning/REQUIREMENTS.md. -->

- [ ] A ruler can be placed on a rendered model, detecting its target by hit-test
- [ ] A ruler can anchor to an overlay/attachment, not just the panel's base model
- [ ] Both ruler endpoints are individually draggable, stored in the target's original-image pixel space
- [ ] Multiple rulers can sit on a panel at once, and all of them persist into share links
- [ ] A ruler reports true size honoring the global imperial/metric setting and the panel's scale multiplier
- [ ] Overlay measurement derives inches-per-pixel through the `overlayScales` / `scaleRelativeToParent` chain
- [ ] The upload/edit calibration ruler and the viewport ruler are one component, so the app has a single ruler concept
- [ ] Rulers render consistently across both renderers (DOM `image-display` and Canvas `attachment-preview`)
- [ ] `toOriginalCoords()`'s bounds/scale divergence is fixed so coordinates stay correct under a CSS transform
- [ ] `.planning/codebase/` is re-mapped against the post-v1.0 source tree

### Out of Scope

- **Undo/redo system** — net-new feature, not debt; deferred to a future milestone (v2)
- **Model search/filter in selection UI** — net-new feature; deferred (v2)
- **Attachment import/export between models** — net-new feature; deferred (v2)
- **Concurrent-edit conflict resolution / multi-device sync** — net-new feature; deferred (v2)
- **Backend (Cloudflare Worker/API) security & scaling** — share-link rate limiting, server-side upload enforcement, adult-content age gate, share-link TTL/GC, metadata lazy-loading/CDN caching. Lives outside this repo; documented as out-of-scope with rationale rather than built.
- **Behavior/UX changes** — was a v1.0 constraint (hardening-only), *not* a standing exclusion. This lapses with the milestone: the next milestone may change behavior freely.

<!-- Out of Scope audited at v1.0 close: the four v2 features and the backend items above remain
     correctly excluded and unchanged. Only the behavior-freeze line was milestone-scoped. -->

## Context

- **Current size:** ~36,140 lines across `src/` (TypeScript, HTML, SCSS). 47 spec files, 711 specs, all passing.
- **Codebase map:** `.planning/codebase/` (STACK, ARCHITECTURE, STRUCTURE, CONVENTIONS, TESTING, INTEGRATIONS, CONCERNS) — generated 2026-07-01. **Now partially stale:** CONCERNS.md was v1.0's scope document and its entries are resolved; the structural docs predate Phase 1's decomposition and Phase 4's service extractions. Re-run `/gsd-map-codebase` before the next milestone.
- **Framework posture:** Angular 20 standalone components, no NgModules. New code must use modern syntax — `input()`/`input.required()` signals, `@if`/`@for` control flow, signals for reactive state (see `CLAUDE.md` Angular Best Practices). Note the codebase is mid-migration: much existing code still uses `@Input()` decorators.
- **Serialization invariant:** Any change to serialized structures requires bumping `CURRENT_VERSION` in `state-export.service.ts`, adding to `SUPPORTED_VERSIONS`, **and appending a `MIGRATIONS` entry** (v1.0 added the registry; see `.claude/rules/state-serialization.md` for the deprecation policy). Currently at v1.0.11 with 12 supported versions and one fixture per version.
- **Critical invariants (must not regress):** attachment points are in ORIGINAL image pixel coordinates; `sourceAttachmentPointId` is hardcoded to `'attachment-point'`; scaling is uniform/center-based; two renderers (Canvas attachment-preview + DOM image-display) share identical math.
- **Testing:** Karma/Jasmine. The suite requires an explicit Chrome binary — see `workflow.test_command` in `.planning/config.json` (`CHROME_BIN` override to a local Playwright Chromium). `builderMode: "application"` is set on the `test` architect target so real module Workers bundle under headless Karma.
- **Test scaffolding:** shared fixtures live in `src/app/testing/`, integration specs in `src/app/integration/`; both kept out of the app bundle by `tsconfig.app.json`'s `files: ["src/main.ts"]`.
- **Compare-modal buffer:** the 40px POSITION_BUFFER in `calculateImageDimensions()` is load-bearing (prevents image cutoff) — preserve it through any compare-modal refactor.
- **Security posture:** frontend guards only. `.claude/rules/security.md` records what the client-side MIME sniff and share cooldown are *not* — read it before touching either, and before claiming any backend requirement is closed.
- **Known coverage gaps:** `attachment-canvas-renderer.service.ts` render helpers (41% stmt), `upload-image-pipeline.service.ts` (57% branch) — tracked as `TESTV2-04`/`TESTV2-05`.

## Constraints

- **Tech stack**: Angular 20 standalone + RxJS + signals, SCSS, MessagePack — no new UI frameworks (Material/Bootstrap) or heavy dependencies without justification; the project deliberately uses Angular built-ins.
- **Compatibility**: Existing share links and serialized state must continue to load (version compatibility maintained via the `MIGRATIONS` registry). *Standing.* The stricter v1.0 rule — that refactors be behavior-preserving — was milestone-scoped and has lapsed.
- **Deployment**: Cloudflare Workers static asset serving; no backend/API changes available in this repo.
- **Serialization**: Bump state version on any serialized-structure change (see Context).
- **Mobile-first**: UI must continue to work on small screens; no regressions to responsive behavior.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Hardening-only milestone; exclude the 4 "Missing Critical Features" | They are net-new features, not debt; including them roughly tripled scope | ✓ Good — the milestone shipped all 21 hardening requirements in 70 days with a green suite; the 4 features carried forward intact as `FEAT-01..04` and lost nothing by waiting |
| Frontend fixes + document backend-owned security/scaling items | Backend lives in a separate Cloudflare Worker repo not available here | Confirmed — Phase 6 shipped the frontend guards (SEC-01/02) and recorded the backend-owned split in `.claude/rules/security.md` (SEC-03) |
| Refactors are behavior-preserving (except race-condition fixes) | Milestone goal is safety-to-change, not new behavior; limits regression risk | Confirmed — Phase 1's baseline reconciliation (01-09) verified all 3 decomposed modals behave identically pre/post-extraction |
| Add version-migration layer rather than removing version gating | Keeps existing share links loadable while making future schema changes safer | Confirmed — Phase 2 shipped the ordered `MIGRATIONS` registry plus a 12-fixture per-version regression suite |
| Phase 3 gate is "failing-spec set ⊆ recorded baseline", not "zero failures" | 50 suite failures are inherited from Phases 1–2 and owned by Phase 5/TEST work; a zero-failure gate was unreachable and would have blocked the phase indefinitely | Confirmed — `03-BASELINE.md` recorded the 50 names up front; phase closed with 0 new failures and 21 baseline failures incidentally repaired |
| Worker/fallback "same output" means geometry+format identical, compressed bytes within tolerance (D-11) | The OffscreenCanvas and main-thread encoders are different implementations across browsers/engines; byte equality was never achievable and asserting it would produce a flaky gate | Confirmed — parity specs assert identical crop bounds, dimensions, MIME type and `formatChanged`, with a size-ratio tolerance for bytes |
| Retain the pre-existing indeterminate upload indicator rather than build a percentage/staged progress UI (D-16) | Auto-crop and compression are opaque single-call operations; any percentage would be fabricated rather than measured, which is worse than an honest indeterminate indicator | Accepted — signed off by human at Phase 4 UAT test 5; no follow-up progress-UI task raised |
| Main-thread responsiveness (SC#4) is verified by human UAT, not an automated Karma assertion (D-17) | Perceptual real-timing behavior in a real browser cannot be reliably asserted by unit tests; an automated main-thread-blocking probe was explicitly rejected as unreliable | Confirmed — Phase 4 UAT tests 1–4 (desktop, touch, cancellation, OffscreenCanvas fallback) all passed |
| Phase 5 gate is zero failures, with no waiver mechanism (D-16) | Three prior phases reinterpreted a subset gate to declare success; the milestone's whole point is a suite you can trust, which a permanently-red baseline defeats | Confirmed — phase closed at 694/694 with the inherited 29-failure set fully adjudicated in `05-TRIAGE.md` |
| Fix rather than waive the three "tests that cannot fail" (CR-02, WR-01, WR-02) | All three predate Phase 5 and none affects a stated success criterion, but leaving them with no fix *and* no waiver contradicted how this same phase formally waived its other two deferrals | Confirmed — user chose fix at Phase 5 UAT test 4; anti-vacuity proven by reintroducing the double-scaling regression and watching exactly those 3 turn red (commit `2a317d1`) |
| Test scaffolding lives in `src/app/testing/` and integration specs in `src/app/integration/`, kept out of the app bundle by `tsconfig.app.json` `files: ["src/main.ts"]` | Share-link fixtures needed a shared home without risking inclusion in the shipped bundle | Confirmed — verified 0 production imports of `src/app/testing/`; directory convention documented in `src/app/integration/README.md` |
| Client-side security guards are named as UX guards, never as controls (D-12) | A changelog line reading "MIME validation" or "rate limiting" invites a later reader to close the corresponding backend requirement; the honest record is the highest-value mitigation in the phase | Confirmed — `.claude/rules/security.md` calls no mechanism "enforcement", "protection", "a security control" or "an age gate", and points at REQUIREMENTS.md §Out of Scope rather than duplicating it |
| Share cooldown stays an in-memory boolean, not persisted, with no countdown UI (D-07, D-11) | Persisting it would imply an enforcement guarantee the frontend cannot make; the flag is trivially bypassed by a reload or devtools either way | Confirmed — verified in a real browser at Phase 6 UAT: 10 rapid clicks produced exactly 1 request, cooldown released at ~5.0s on desktop and mobile with no countdown text and no layout shift |
| Phase 6 threat model assessed at ASVS L1 with no formal threat-modelling exercise (D-00) | Frontend-only SPA with no authentication, no user accounts, no PII and no payments; a heavier assessment would be disproportionate | Confirmed — `06-SECURITY.md` closes 11 threats (4 mitigated, 7 accepted with documented rationale), `threats_open: 0`, none rated high or critical |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to 

<!-- FIXTURE TRUNCATED at 20 KiB by M0-G capture; original size 20872 bytes -->

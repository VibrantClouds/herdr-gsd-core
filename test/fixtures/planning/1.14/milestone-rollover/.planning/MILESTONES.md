# Milestones

## v1.0 Code Health & Hardening (Shipped: 2026-09-08)

**Delivered:** The Size✦Lab app behaves identically to before, but the codebase is materially safer to change — oversized modals decomposed, serialization migrations named and regression-tested, timing races and listener/subscription leaks eliminated, the highest-risk component under test, and the frontend security posture honestly documented.

**Phases completed:** 6 phases, 48 plans, 112 tasks
**Timeline:** 2026-07-01 → 2026-09-08 (70 days)
**Git range:** `132ebe4` (docs: map existing codebase) → `0099b5c` (docs(phase-06): mark phase complete)
**Change volume:** 325 commits, 87 source files changed, +12,217 / −3,185 lines under `src/`
**Test suite:** 711/711 passing, zero failures, zero skipped (up from a 336-spec / 52-failure starting baseline)
**Closeout:** verified_closeout — all 6 phases `verification_status: passed`, all 21 v1 requirements checked off, artifact audit clear

**Key accomplishments:**

- **Component decomposition (Phase 1)** — The three oversized modals were split behind unchanged behavior: `upload-modal` 979→397 lines, `attachment-preview` 856→384, `attachment-edit-modal` 909→599. Extracted shared coordinate-transform utils, `AttachmentCanvasRendererService`, `UploadImagePipelineService`, `UploadFormValidatorsService`, and two reusable presentational components (`MeasurementRulerComponent`, `AttachmentPointPickerComponent`) now embedded by both upload and edit modals.

- **Serialization safety (Phase 2)** — Added a 7-entry named `MIGRATIONS` registry with a gap-tolerant version walker at `StateExportService`'s single import choke point, replacing version-equality-only gating; backed by 12 version-accurate fixtures (v1.0.0 → v1.0.11) proving every supported share link still loads. Documented the version-deprecation policy in `.claude/rules/state-serialization.md`, and fixed a pre-existing bug where `horizontalFlip` was silently never restored on import. Removed `CategoryService`'s lazy `Injector`/`any` workaround for typed constructor injection.

- **Race conditions & lifecycle (Phase 3)** — Removed every `setTimeout`-based timing guess in the modal layer: `penetration-modal` now uses a `toObservable → switchMap → takeUntil` chain, `compare-modal` derives default positions from a real `ResizeObserver` with mark-pending recalculation (40px POSITION_BUFFER preserved), ruler and angle-dial drags became element-owned via PointerCapture (so a modal closing mid-drag leaves no document listeners), and auto-save suppression closes deterministically via `queueMicrotask`. A shared `normalizeCategory` helper at every read/write boundary stopped mixed-case categories from silently dropping models from filtering.

- **Subscription & render performance (Phase 4)** — `AppComponent`'s seven root subscriptions plus both dropdown selectors now tear down via `takeUntil(destroy$)`, proven by destroy-then-emit regression specs that fail without the fix. A root-provided `ResizeObserverService` (one rAF-batched native observer) replaced per-instance observers in `image-display` and `comparison-panel`. Upload auto-crop and compression moved off the main thread into an OffscreenCanvas Web Worker sharing one pure `image-processing-core.ts` module with the retained main-thread fallback, with cross-path parity specs and deterministic worker termination on cancel/destroy.

- **Test coverage hardening (Phase 5)** — Took the suite from 29 inherited failures to a fully green 693/693 with every failure individually adjudicated in a 29-row disposition ledger. `attachment-edit-modal` went from zero specs to 75 covering all three `editType` save paths with exact-payload assertions; added first-ever specs for `ScalingService` and `ImageProcessingService`; and built two real integration flows — share-link import (`Router → shareLinkGuard → StateExportService`, stubbing only `fetch`) and upload → attachment-point definition → usage against real IndexedDB. Also fixed three "tests that cannot fail," proven anti-vacuous by reintroducing a regression and watching exactly those three turn red.

- **Frontend security hardening (Phase 6)** — Upload now sniffs actual magic bytes (`sniffImageSignature`) and fails closed on files whose declared PNG/JPEG type contradicts their content; share-link generation carries a 5s post-success cooldown cleared on destroy. Critically, `.claude/rules/security.md` records what these guards are *not* — not an age gate, not enforcement, not rate limiting — so a later reader can't mistake a UX guard for a backend control. Threat model closed at ASVS L1: 11 threats, 4 mitigated, 7 accepted with rationale, 0 open.

### Deferred to v2

Five test-coverage items were formally promoted (not re-deferred) into REQUIREMENTS.md v2 by Phase 5's D-15, plus four net-new user features held out of this hardening milestone by design:

- `TESTV2-01`/`TESTV2-02` — dedicated unit specs for `indexeddb-user-model.service.ts` and `state-management.service.ts` (both exercised only incidentally by integration specs)
- `TESTV2-03` — dropdown re-fire regression test
- `TESTV2-04`/`TESTV2-05` — `attachment-canvas-renderer.service.ts` render-helper branches (41% stmt) and `upload-image-pipeline.service.ts` worker-dispatch branches (57%)
- `FEAT-01..04` — undo/redo, model search/filter, attachment import/export, multi-device sync

Backend-owned items (server-side rate limiting, upload enforcement, age gate, share-link TTL) remain out of scope — they live in the Cloudflare Worker repo, and Phase 6 documented the split rather than faking it in the frontend.

---

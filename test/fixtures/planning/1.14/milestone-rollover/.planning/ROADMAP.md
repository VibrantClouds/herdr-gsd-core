# Roadmap: Size✦Lab

## Milestones

- ✅ **v1.0 Code Health & Hardening** — Phases 1-6 (shipped 2026-09-08) — [archive](milestones/v1.0-ROADMAP.md)
- 🚧 **v1.1 Measurement Ruler** — Phases 7-12 (in progress)

## Phases

<details>
<summary>✅ v1.0 Code Health & Hardening (Phases 1-6) — SHIPPED 2026-09-08</summary>

- [x] Phase 1: Component Decomposition (9/9 plans) — completed 2026-07-07
- [x] Phase 2: Service Architecture & Serialization Safety (5/5 plans) — completed 2026-07-30
- [x] Phase 3: Race Condition & Lifecycle Fixes (8/8 plans) — completed 2026-07-30
- [x] Phase 4: Subscription & Render Performance Hardening (10/10 plans) — completed 2026-08-01
- [x] Phase 5: Test Coverage Hardening (13/13 plans) — completed 2026-08-09
- [x] Phase 6: Frontend Security Hardening (3/3 plans) — completed 2026-09-08

Full phase goals, success criteria and plan detail: `milestones/v1.0-ROADMAP.md`
Phase artifacts (plans, summaries, verification, UAT): `milestones/v1.0-phases/`

</details>

### 🚧 v1.1 Measurement Ruler (In Progress)

**Milestone Goal:** A ruler can be placed on any rendered model or overlay to read the true size of a span — an arm, a leg — and every ruler reconstructs identically for anyone opening the share link, on any screen size.

- [ ] **Phase 7: Coordinate & Scale Correctness Foundations** - Fix the dormant coordinate-transform and overlay-scale bugs the ruler would be the first code to expose, and build the state-only measurement math
- [ ] **Phase 8: Ruler State, Cascade & Serialization** - Rulers become first-class panel state that round-trips through export, import and share links and never outlives their target
- [ ] **Phase 9: One Ruler Concept & Viewport Measurement** - A user arms place-ruler mode, drops a ruler on the layer under the pointer, drags either end, and reads the span's true size
- [ ] **Phase 10: Multi-Ruler Management, List & Touch Parity** - Several rulers coexist on a panel, are selectable/deletable through a compact list, and every interaction works by finger
- [ ] **Phase 11: Canvas Renderer Parity** - Rulers render in the Canvas attachment preview from the same shared math, proven by a cross-renderer parity test
- [ ] **Phase 12: Codebase Re-Map** - `.planning/codebase/` re-mapped against the finished v1.1 source, with the spent CONCERNS.md retired and researched discrepancies corrected

#### Standing constraints (apply to every v1.1 phase)

- **One version bump for the milestone.** Phase 8 owns the single `CURRENT_VERSION` → `1.0.12` bump plus its `SUPPORTED_VERSIONS` entry, `MIGRATIONS` entry and new fixture. The `RulerModel` shape must be finalised there; any later phase that changes the serialized shape owes a second complete triplet (`1.0.13` + migration + fixture), so later phases should design against the Phase 8 shape rather than extend it.
- **The ruler never writes model size.** Base size stays an upload-time concern and the scale slider stays the resize control. A viewport ruler only ever reports (TARGET-04).
- **Whole units only.** Readout rounds to whole inches/centimetres like the rest of the app. Decimal precision is an explicitly rejected anti-feature, not a polish item (RULER-06).
- **Mobile-first.** Touch is a requirement (RULER-09), not a follow-up. All interaction is built on Pointer Events with element-owned `setPointerCapture`, the pattern v1.0 Phase 3 established.
- **No new dependencies.** Angular 20 standalone, RxJS/signals, inline SVG, native Pointer Events. Research confirmed zero new dependencies are needed.
- **Do not reintroduce what v1.0 removed.** No `setTimeout` timing guesses, no document-level pointer listeners without teardown, no long-lived subscription without `takeUntil(destroy$)`, and no further growth of `compare-modal` / `image-display` — new ruler behaviour lives in the ruler component/service, not in those two files.
- **Cross-screen parity is structural, and still gets a test.** No measurement input may be viewport-derived (`relativeScale`, `getBoundingClientRect`, `devicePixelRatio`). Prove it with a mocked-differing-viewport test rather than asserting it.

## Phase Details

### Phase 7: Coordinate & Scale Correctness Foundations
**Goal**: The coordinate and scale primitives the ruler depends on are correct under the transforms the real viewport applies, and both renderers derive overlay scale from one shared helper instead of two disagreeing inline formulas.
**Depends on**: Nothing (Phase 6 complete) — this is a prerequisite, not ruler-specific work, and must land before any ruler placement UI
**Requirements**: RENDER-01, RENDER-02, RENDER-03, RULER-07, TARGET-02
**Success Criteria** (what must be TRUE):
  1. A pointer position on a panel with `horizontalFlip` on, or on an overlay rotated to a non-zero angle, converts to the original-image pixel the pointer visually sits on — today it does not, and both cases are first-class v1.1 scenarios.
  2. An overlay with `scaleRelativeToParent: false` renders at the same size in the Canvas attachment-sidebar preview as it does in the DOM viewport, because both call one shared `ScalingService` helper.
  3. The same span, target and panel scale produce an identical reported size under two different container sizes and devicePixelRatios — proven by a test that mocks both, against a function that has no parameter through which viewport geometry could enter.
  4. An overlay-anchored span's inches-per-pixel comes from that overlay's own `overlayScales` / `scaleRelativeToParent` chain, and differs from the base model's whenever the overlay's effective scale does.
  5. A canvas-hosted target with no `HTMLImageElement` converts through the same generalized entry point the DOM target uses — no second copy of the transform math exists anywhere in the tree.
**Plans**: TBD

Notes for planning:
- These are two latent production bugs confirmed by source reading, not new complexity: `toOriginalCoords()` derives coordinates from an already-transformed `getBoundingClientRect()`, and `attachment-canvas-renderer.service.ts` ignores `scaleRelativeToParent` entirely while `image-display.component.ts` honours it.
- **Open investigation owned by this phase:** whether the DOM renderer's stored `effectiveBaseScale` (`scale × relativeScale`) is always numerically equal to the Canvas renderer's raw `scale` parameter. Measure this against real values before sizing the fix. If they differ, the renderers diverge even when `scaleRelativeToParent` is true and RENDER-03 is materially larger than swapping in one helper.
- Measurement math belongs on `ScalingService` (it already owns `calculateMeasurementLineLength()` and is already injected into both renderers). `relativeScale` is viewport-derived and must never enter ruler math; the rendering call site keeps using `effectiveBaseScale` while the measurement call site passes `panelState.scale`. Comment both call sites so a later reader does not "fix" one to match the other.
- `ScalingService.calculateOverlayScale()` is dead code encoding a third, different formula. Decide its fate here (remove or explicitly mark as not-the-reference) rather than leaving a third candidate in the file this phase is already editing.

### Phase 8: Ruler State, Cascade & Serialization
**Goal**: Rulers are first-class panel state, stored in the target's original-image pixel space, that round-trips through MessagePack/JSON export and share links and is pruned the instant its target disappears.
**Depends on**: Nothing — independent of Phase 7; sequenced here because it is cheap, isolated, and gates Phases 9-11
**Requirements**: TARGET-03, MANAGE-06, PERSIST-01, PERSIST-02, PERSIST-03, PERSIST-04
**Success Criteria** (what must be TRUE):
  1. A stored ruler's endpoint numbers are the target's original-image pixels and do not change when the panel scale, the window size, or the panel flip changes.
  2. Exporting and re-importing state in both MessagePack and JSON reproduces every ruler on the same target with identical endpoints.
  3. A share link generated from a panel carrying a ruler on an overlay reconstructs that ruler and its target on load, proven by a `gatherViewportState()` fixture rather than by inspection.
  4. Removing an overlay removes the rulers anchored to it, and swapping a panel's model leaves that panel with no rulers — no ruler can be observed pointing at a target that is gone.
  5. All 12 pre-ruler version fixtures still load unchanged alongside the new 1.0.12 fixture, with the `MIGRATIONS` entry present and the fixture-coverage guard spec green.
**Plans**: TBD

Notes for planning:
- `PanelState.rulers: RulerModel[]`, sibling to `overlays[]`, keyed to a target by `targetOverlayId: string | null` (null = the panel's base model, matching the existing `overlay.id` keying used by `overlayScales`/`overlayRotations`).
- Orphan policy is decided: **prune with the target (cascade-delete)**, not tolerate-and-hide. Wire it into `removeOverlay()` and both `update{Left,Right}PanelModel()` resets, symmetric with the existing `overlayScales`/`overlayRotations` cleanup.
- Research confirmed `gatherViewportState()` needs **no** change — `PanelState` rides along verbatim. Verify by fixture; do not add filtering logic there.
- Selection state is transient UI state and must stay out of the serialized shape, so Phase 10 does not force a second version bump.

### Phase 9: One Ruler Concept & Viewport Measurement
**Goal**: A user arms an explicit place-ruler mode, drops a ruler on whatever model or overlay is under the pointer, drags either endpoint, and reads that span's true size — using the same component the upload/edit calibration ruler uses.
**Depends on**: Phase 7, Phase 8
**Requirements**: RULER-10, RULER-01, RULER-02, RULER-03, RULER-04, RULER-05, RULER-06, RULER-08, TARGET-01, TARGET-04
**Success Criteria** (what must be TRUE):
  1. With place-ruler mode armed, a single drag on a rendered model or overlay creates a ruler bound to the topmost visible layer under the pointer; with the mode off, that same drag still pans the viewport exactly as it does today.
  2. Either endpoint drags on its own without redrawing the ruler, tracks the pointer on a flipped panel and on a rotated overlay, and stops at the edge of the thing it measures — and the only state any ruler action writes is ruler state: model size, attachment-point data and every other target field are untouched by place, drag and delete.
  3. The measured size updates continuously through a drag rather than only on release, is displayed in whole units only, and reformats immediately when the global imperial/metric setting is toggled.
  4. A ruler stays visually attached to the same anatomy across the full range of the panel scale slider.
  5. The upload and attachment-edit calibration ruler still behaves exactly as it does today, because it is now the same component the viewport uses — the app presents one ruler concept, not two tools sharing a name.
**Plans**: TBD
**UI hint**: yes

Notes for planning:
- Creation is an **explicit armed mode** (a button arms it), never inferred from an ordinary drag — the viewport already owns drag-to-pan.
- Hit-test ties resolve to the **topmost visible layer**; there is no target picker. Use `document.elementsFromPoint` plus `data-overlay-id` attributes, which is z-order-correct and already transform-aware, rather than reimplementing rotated-rect geometry.
- Readout formats through `measurement-utils.ts`'s `formatHeight` / `formatHeightCompact`, **not** `image-display.component.ts`'s private metric-blind `inchesToFeetAndInches()`.
- Keep drag-in-progress state component-local and commit to the store on `pointerup` — committing every `pointermove` to the BehaviorSubject causes a 60-120Hz re-render storm. Handle `pointercancel`, not just `pointerup`.
- Interaction is built on Pointer Events with element-owned capture, so it is touch-capable by construction; the explicit touch requirement (RULER-09) is verified in Phase 10 once select and delete exist, and Phase 9 must not ship mouse-only code on the strength of that.
- Generalizing `MeasurementRulerComponent` must leave its two existing calibration call sites (`upload-modal`, `attachment-edit-modal`) behaviourally unchanged.

### Phase 10: Multi-Ruler Management, List & Touch Parity
**Goal**: Several rulers coexist on one panel and stay manageable — selectable, deliberately deletable, listed in a compact row per ruler — with every one of those interactions working by finger on a small screen.
**Depends on**: Phase 9
**Requirements**: MANAGE-01, MANAGE-02, MANAGE-03, MANAGE-04, MANAGE-05, RULER-09
**Success Criteria** (what must be TRUE):
  1. Three or more rulers sit on one panel at once, and dragging, selecting or reading any one of them affects only that one.
  2. A user can select a ruler and then deselect it, and the ruler is still there afterwards.
  3. Deleting a ruler takes a deliberate action — dragging an endpoint away, deselecting, or clicking elsewhere never removes one.
  4. Each panel shows its rulers as compact rows following the existing `OverlayControlsComponent` row pattern, and hovering a row highlights that ruler in the viewport.
  5. Arming, placing, endpoint-dragging, selecting and deleting all work by touch on a small screen, including when a ruler endpoint sits near an attachment-point handle.
**Plans**: TBD
**UI hint**: yes

Notes for planning:
- The minimal ruler list is **in scope** for v1.1 (research called it deferrable; that was overridden) and reuses `OverlayControlsComponent`'s row pattern rather than inventing a new one.
- Touch parity means distinct hit-target sizing and hit-test priority against the existing attachment-point handles, not just "pointer events happen to fire".
- Label/name per ruler, ratio readouts and ruler-to-ruler deltas are deferred (`RULERV2-01`, `RULERV2-02`, `RULERV2-06`) — the list stays minimal.
- Watch label legibility and collision once two rulers are close together on a photographic background; a side-list fallback is already available here.

### Phase 11: Canvas Renderer Parity
**Goal**: A ruler placed in the main viewport also appears, on the same anatomy, in the Canvas attachment preview — drawn from the same shared math, with drift made impossible to ship silently.
**Depends on**: Phase 7 (shared math), Phase 8 (state), Phase 9 (the DOM geometry to be matched)
**Requirements**: RENDER-04, RENDER-05
**Success Criteria** (what must be TRUE):
  1. A ruler placed in the DOM viewport also renders, on the same anatomy of the same model or overlay, in the attachment-sidebar Canvas preview.
  2. Identical ruler state produces identical endpoint geometry in both renderers, asserted by a cross-renderer parity test that fails if either renderer's math drifts.
  3. The Canvas renderer contains no ruler arithmetic of its own — it calls the same `ScalingService` helpers the DOM renderer calls, reached through the existing `AttachmentCanvasRenderParams` parameter-object pattern.
**Plans**: TBD
**UI hint**: yes

Notes for planning:
- The Canvas surface renders what it is given; no interactive ruler placement from the sidebar preview is required, so no new Canvas hit-testing is in scope.
- Canvas device-pixel-ratio unification is explicitly deferred (`RENDERV2-01`) — out of v1.1 on scope grounds, not because it is wrong.
- Visual design is inherited from Phase 9; the deliverable here is parity, not a new ruler appearance.

### Phase 12: Codebase Re-Map
**Goal**: `.planning/codebase/` describes the code that actually exists after v1.0's decomposition and v1.1's ruler work, with the spent CONCERNS.md retired and every discrepancy v1.1 research uncovered corrected in place.
**Depends on**: Phase 11 (scheduled last deliberately — see rationale)
**Requirements**: MAP-01, MAP-02
**Success Criteria** (what must be TRUE):
  1. A developer reading `.planning/codebase/` finds the current structure — no document still describes the pre-decomposition modals, and no CONCERNS list presents v1.0's already-closed scope as open work.
  2. The dual-renderer "identical math" claim is stated accurately: recorded as an invariant that v1.1 made true and now enforces via shared helpers, not as something that always held.
  3. `ScalingService.calculateOverlayScale()`'s disposition and `image-display`'s private metric-blind height formatter are both recorded, so neither is mistaken for the reference implementation by a future reader.
**Plans**: TBD

Scheduling rationale (MAP-01/MAP-02 are independent and could sit anywhere):
- **Scheduled late, on purpose.** All three MAP-02 discrepancies are things this milestone actively changes — the renderer divergence is fixed in Phase 7, the dead `calculateOverlayScale()` is dispositioned in Phase 7, and the metric-blind formatter is bypassed in Phase 9. Re-mapping before those land would document an interim shape and immediately re-stale the docs, which is exactly how `.planning/codebase/` got stale the first time.
- **The cost of scheduling late is already paid.** The usual argument for an early re-map is that later phases need accurate structural docs as input. Here `.planning/research/ARCHITECTURE.md` and `PITFALLS.md` (2026-09-15) already document every seam the ruler touches, verified against source, and the phases below reference them directly — so the re-map's input value is largely pre-delivered and only its record value remains, which wants the finished source.

## Progress

**Execution Order:** Phases execute in numeric order: 7 → 8 → 9 → 10 → 11 → 12

| Phase                                          | Milestone | Plans Complete | Status      | Completed  |
| ---------------------------------------------- | --------- | -------------- | ----------- | ---------- |
| 1. Component Decomposition                     | v1.0      | 9/9            | Complete    | 2026-07-07 |
| 2. Service Architecture & Serialization        | v1.0      | 5/5            | Complete    | 2026-07-30 |
| 3. Race Condition & Lifecycle Fixes            | v1.0      | 8/8            | Complete    | 2026-07-30 |
| 4. Subscription & Render Perf Hardening        | v1.0      | 10/10          | Complete    | 2026-08-01 |
| 5. Test Coverage Hardening                     | v1.0      | 13/13          | Complete    | 2026-08-09 |
| 6. Frontend Security Hardening                 | v1.0      | 3/3            | Complete    | 2026-09-08 |
| 7. Coordinate & Scale Correctness Foundations  | v1.1      | 0/TBD          | Not started | -          |
| 8. Ruler State, Cascade & Serialization        | v1.1      | 0/TBD          | Not started | -          |
| 9. One Ruler Concept & Viewport Measurement    | v1.1      | 0/TBD          | Not started | -          |
| 10. Multi-Ruler Management, List & Touch       | v1.1      | 0/TBD          | Not started | -          |
| 11. Canvas Renderer Parity                     | v1.1      | 0/TBD          | Not started | -          |
| 12. Codebase Re-Map                            | v1.1      | 0/TBD          | Not started | -          |

## Requirement Coverage (v1.1)

31 of 31 v1.1 requirements mapped to exactly one phase each. Full traceability table in `REQUIREMENTS.md`.

| Phase | Requirements | Count |
|-------|--------------|-------|
| 7 | RENDER-01, RENDER-02, RENDER-03, RULER-07, TARGET-02 | 5 |
| 8 | TARGET-03, MANAGE-06, PERSIST-01, PERSIST-02, PERSIST-03, PERSIST-04 | 6 |
| 9 | RULER-01, RULER-02, RULER-03, RULER-04, RULER-05, RULER-06, RULER-08, RULER-10, TARGET-01, TARGET-04 | 10 |
| 10 | RULER-09, MANAGE-01, MANAGE-02, MANAGE-03, MANAGE-04, MANAGE-05 | 6 |
| 11 | RENDER-04, RENDER-05 | 2 |
| 12 | MAP-01, MAP-02 | 2 |

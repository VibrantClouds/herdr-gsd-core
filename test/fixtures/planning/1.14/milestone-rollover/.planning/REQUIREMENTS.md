# Requirements: Size✦Lab v1.1 Measurement Ruler

**Defined:** 2026-09-15
**Core Value:** Show true-size scale — the height in feet and inches, not pixel measurements — for any two objects side by side, including attachments positioned at pixel-perfect points.

**Milestone framing:** v1.1 applies that core value to *part* of an object rather than the whole of one.
A ruler placed on a rendered model or overlay reports the true size of a span — an arm, a leg — and
reconstructs identically for anyone opening the share link, on any screen size.

**The ruler is a reporting instrument.** It never writes model size, attachment-point data, or any
other target state. Base size remains an upload-time concern and the scale slider remains the resize
control. This was the central correction during milestone scoping.

## v1.1 Requirements

### Ruler Placement & Measurement

- [ ] **RULER-01**: User can arm an explicit place-ruler mode and create a new ruler with a single drag on a rendered model
- [ ] **RULER-02**: User can drag either endpoint of an existing ruler independently without redrawing it
- [ ] **RULER-03**: Endpoint drag is clamped to the target's own image bounds, so an endpoint cannot leave the thing it measures
- [ ] **RULER-04**: User sees the measured true size update continuously during a drag, not only on release
- [ ] **RULER-05**: Readout follows the global imperial/metric setting and reformats immediately when the unit is toggled
- [ ] **RULER-06**: Readout is displayed in whole units only, never manufacturing precision the photo-plus-typed-height calibration cannot support
- [ ] **RULER-07**: Measurement is computed by a pure function whose inputs are state only — zero DOM or viewport geometry — so two viewers on different screen sizes read identical values from the same share link
- [ ] **RULER-08**: A ruler stays visually attached to its target across every value of the panel scale slider
- [ ] **RULER-09**: Ruler creation, endpoint drag, selection and delete all work by touch on small screens
- [ ] **RULER-10**: The viewport ruler and the upload/edit calibration ruler are one component, so the app presents a single ruler concept rather than two tools sharing a name

### Target Detection & Anchoring

- [ ] **TARGET-01**: A ruler resolves to exactly one target — the panel's base model or a specific overlay — by topmost-visible-layer hit-test at placement time
- [ ] **TARGET-02**: A ruler anchored to an overlay derives its inches-per-pixel from that overlay's own effective scale chain (`overlayScales`, `scaleRelativeToParent`), not the base model's
- [ ] **TARGET-03**: Ruler endpoints are stored in the target's original-image pixel coordinates, never in viewport or display coordinates
- [ ] **TARGET-04**: Placing, dragging or deleting a ruler never mutates model size, attachment-point data, or any other target state

### Multi-Instance Management

- [ ] **MANAGE-01**: Multiple rulers coexist on one panel without interfering with each other
- [ ] **MANAGE-02**: User can select a ruler and deselect it without deleting it
- [ ] **MANAGE-03**: User can delete a ruler through an explicit action, never as a side effect of deselecting or dragging away
- [ ] **MANAGE-04**: User sees a panel's rulers in a compact list following the existing `OverlayControlsComponent` row pattern
- [ ] **MANAGE-05**: Hovering a ruler's list row highlights the corresponding ruler in the viewport
- [ ] **MANAGE-06**: Removing an overlay removes the rulers anchored to it, and swapping a panel's model clears that panel's rulers

### Persistence & Serialization

- [ ] **PERSIST-01**: Rulers travel in share links, so a recipient sees the same rulers rather than a recreated approximation
- [ ] **PERSIST-02**: Rulers survive full state export and re-import in both MessagePack and JSON
- [ ] **PERSIST-03**: State version is bumped to 1.0.12 with a `MIGRATIONS` entry and a new per-version fixture, and all 12 existing version fixtures still load
- [ ] **PERSIST-04**: A fixture proves `gatherViewportState()` carries ruler data and their targets into a generated share link

### Renderer Correctness

- [ ] **RENDER-01**: The coordinate transform converts pointer position to image coordinates correctly for an element under a CSS transform, covering both the panel flip (`scaleX(-1)`) and per-overlay rotation
- [ ] **RENDER-02**: The coordinate transform supports a canvas-hosted target that has no `HTMLImageElement`, via a generalized entry point rather than a hand-ported copy
- [ ] **RENDER-03**: Both renderers derive overlay effective scale from one shared `ScalingService` helper, and the Canvas renderer honors `scaleRelativeToParent`
- [ ] **RENDER-04**: A cross-renderer parity test asserts that identical ruler state produces identical geometry in the DOM and Canvas renderers
- [ ] **RENDER-05**: Rulers render in both the DOM renderer (`image-display`) and the Canvas renderer (`attachment-preview`)

### Codebase Documentation

- [ ] **MAP-01**: `.planning/codebase/` is re-mapped against current source, with the spent CONCERNS.md retired or rewritten
- [ ] **MAP-02**: Discrepancies found during v1.1 research are corrected in the mapped docs — the dual-renderer "identical math" invariant that has a live counter-example, the dead `ScalingService.calculateOverlayScale()`, and `image-display`'s private height formatter that bypasses `measurement-utils`

## Deferred (v1.2+)

Tracked, not in this roadmap. Each is genuinely valuable; none is required for the capability v1.1 delivers.

### Ruler Enhancements

- **RULERV2-01**: Per-ruler label/name ("left forearm") — becomes valuable once a user keeps 3+ rulers; additive metadata, needs its own version bump
- **RULERV2-02**: Ratio-to-object-height readout ("38% of total height") — cheap, purely derived, and a natural fit for a comparison app
- **RULERV2-03**: Copy measurement value to clipboard
- **RULERV2-04**: Endpoint snap to existing attachment points — the "feels precise" benefit using curated points the app already validated. Must be read-only against `AttachmentPoint[]`; the existing attachment-drag code mutates positions and must not be copy-pasted
- **RULERV2-05**: Angle readout alongside length — largely irrelevant to limb-length measurement, but a common reference-tool capability that will get requested
- **RULERV2-06**: Direct comparison between two rulers with a delta readout — depends on the list existing first

### Renderer

- **RENDERV2-01**: Canvas device-pixel-ratio scaling unified into the shared helper — out of v1.1 on scope grounds, not because it is wrong

### Carried Forward from v1.0

- **TESTV2-01..05** — coverage debt promoted by Phase 5's D-15: dedicated specs for `indexeddb-user-model.service.ts` and `state-management.service.ts`, the dropdown re-fire regression test, `attachment-canvas-renderer.service.ts` render helpers (41% stmt), `upload-image-pipeline.service.ts` worker-dispatch branches (57% branch)
- **FEAT-01..04** — undo/redo, model search/filter, attachment point import/export, multi-device sync. Note that undo/redo will need to cover ruler placement once both exist

## Out of Scope

Explicitly excluded, with reasoning, so these are not re-proposed later.

| Feature | Reason |
|---------|--------|
| Decimal-precision readouts | The chain is: a user eyeballs a calibration line on a photo, types a whole-number height, and the scale slider quantizes to whole units. "23.47 in" manufactures two-decimal confidence on a ±few-percent input. This is a precision-domain convention (CAD, DICOM) that is actively misleading when imported here. |
| Measurement confidence score or accuracy badge | There is no independent ground truth to compute one against, so any figure would be fabricated — worse than making no claim. Directly parallels v1.0's decision to reject a fabricated upload progress percentage. A static "measurements are estimates" note conveys the same honesty without a fake number. |
| Image-analysis edge snapping ("snap to the arm's edge") | Requires computer-vision infrastructure the app does not have, and this is the most-criticized feature class in AR ruler apps even with depth sensors. A flat photo cutout carries strictly less information than those apps' input. |
| Realtime collaborative ruler editing | The sharing model snapshots state for independent viewing, not a live session. There is no realtime backend, and multi-device sync is already deferred as `FEAT-04`. |
| Measurement report / PDF export | No export infrastructure beyond MessagePack/JSON state, which already contains every ruler's data. A formatted report generator is a separate feature. |
| Polyline / multi-segment measurement | The arithmetic is a two-point Euclidean span by design. Path length along a bent limb is not a physically meaningful quantity on a flat cutout with no depth information. |
| Explicit target picker on hit-test ambiguity | Decided in favor of topmost-visible-layer. Accepted tradeoff: no way to deliberately measure a model underneath an overlay. |
| Viewport rulers setting model size | Decided. Base size stays an upload-time concern; the scale slider stays the resize control. |
| Backend work of any kind | No backend or API changes are available in this repo — it lives in a separate Cloudflare Worker repo. |

## Traceability

Phase numbering continues from v1.0, which ended at Phase 6. Every v1.1 requirement maps to exactly
one phase — see `ROADMAP.md` for phase goals and success criteria.

| Requirement | Phase | Status |
|-------------|-------|--------|
| RULER-01 | Phase 9 | Pending |
| RULER-02 | Phase 9 | Pending |
| RULER-03 | Phase 9 | Pending |
| RULER-04 | Phase 9 | Pending |
| RULER-05 | Phase 9 | Pending |
| RULER-06 | Phase 9 | Pending |
| RULER-07 | Phase 7 | Pending |
| RULER-08 | Phase 9 | Pending |
| RULER-09 | Phase 10 | Pending |
| RULER-10 | Phase 9 | Pending |
| TARGET-01 | Phase 9 | Pending |
| TARGET-02 | Phase 7 | Pending |
| TARGET-03 | Phase 8 | Pending |
| TARGET-04 | Phase 9 | Pending |
| MANAGE-01 | Phase 10 | Pending |
| MANAGE-02 | Phase 10 | Pending |
| MANAGE-03 | Phase 10 | Pending |
| MANAGE-04 | Phase 10 | Pending |
| MANAGE-05 | Phase 10 | Pending |
| MANAGE-06 | Phase 8 | Pending |
| PERSIST-01 | Phase 8 | Pending |
| PERSIST-02 | Phase 8 | Pending |
| PERSIST-03 | Phase 8 | Pending |
| PERSIST-04 | Phase 8 | Pending |
| RENDER-01 | Phase 7 | Pending |
| RENDER-02 | Phase 7 | Pending |
| RENDER-03 | Phase 7 | Pending |
| RENDER-04 | Phase 11 | Pending |
| RENDER-05 | Phase 11 | Pending |
| MAP-01 | Phase 12 | Pending |
| MAP-02 | Phase 12 | Pending |

**Coverage:**
- v1.1 requirements: 31 total
- Mapped to phases: 31 ✓
- Unmapped: 0

**By phase:**

| Phase | Name | Requirements |
|-------|------|--------------|
| 7 | Coordinate & Scale Correctness Foundations | 5 |
| 8 | Ruler State, Cascade & Serialization | 6 |
| 9 | One Ruler Concept & Viewport Measurement | 10 |
| 10 | Multi-Ruler Management, List & Touch Parity | 6 |
| 11 | Canvas Renderer Parity | 2 |
| 12 | Codebase Re-Map | 2 |

**Requirements that span a phase boundary in verification (owned by one phase, re-observed in another):**

- **RULER-09** (touch parity) is owned by Phase 10 because its text enumerates selection and delete,
  which do not exist until then. Phase 9 must still build its interaction on Pointer Events with
  element-owned capture so touch works by construction rather than being retrofitted.
- **PERSIST-01** (rulers travel in share links) is proven in Phase 8 by a `gatherViewportState()`
  fixture round-trip; the end-to-end "a recipient sees the same rulers rendered" observation is
  re-confirmed during Phase 9 UAT once rulers are visible.

---
*Requirements defined: 2026-09-15*
*Last updated: 2026-09-15 after roadmap creation (31/31 requirements mapped to Phases 7-12)*

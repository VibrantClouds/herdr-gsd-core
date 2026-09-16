# Research Summary: v1.1 Measurement Ruler

**Project:** Size✦Lab v1.1 Measurement Ruler  
**Domain:** In-viewport measurement overlay for a dual-panel photo-comparison SPA (Angular 20)  
**Researched:** 2026-09-15  
**Confidence:** HIGH

## Executive Summary

The measurement ruler is a straightforward *addition* to an existing, well-factored state/render/serialize pipeline — a set of independent, isolated changes to `PanelState`, `ScalingService`, and the two rendering surfaces with no new dependencies and no framework additions. The feature reuses the existing SVG-overlay calibration ruler (`MeasurementRulerComponent`) by generalizing it to work in the viewport context, following the project's own established patterns for state management (BehaviorSubjects), drag interaction (element-owned PointerCapture), and serialization (versioned migrations with fixtures).

Two **pre-existing seams in the codebase** are not new complexity this milestone introduces — they are seams the ruler work will expose as blockers if left unfixed:

1. **`toOriginalCoords()` computes wrong coordinates under CSS transforms** (flip and rotation) — confirmed by reading the implementation against the actual transform chain the viewport applies. This is dormant today because its only existing callers (upload calibration, attachment-point placement) never render inside a transformed ancestor. A viewport ruler targeting a rotated overlay or positioned on a flipped panel will trigger this latent bug immediately.
2. **The two renderers diverge on overlay scale math** — `image-display.component.ts` correctly honors `scaleRelativeToParent` as a conditional multiplier; `attachment-canvas-renderer.service.ts` ignores the flag entirely. The project's documented invariant is that both must "use identical math" — the ruler cannot copy either formula verbatim. It must be built once, correctly, and both renderers must be pointed at it via `ScalingService`.

Both issues are listed as **Active requirements** in PROJECT.md and are flagged here as **structural prerequisites** rather than ruler-specific work — they must land first and gate the entire ruler-placement feature.

The recommended approach builds the measurement math as pure functions on `ScalingService` (zero DOM inputs, state-only inputs), distributes ruler state across `PanelState.rulers[]` (sibling to `overlays[]`), and uses shared coordinate-transform helpers abstracted from the DOM/Canvas-specific callers. This mirrors the project's existing precedent set by `coordinate-transform.ts` and `image-processing-core.ts` — extract shared pure math, let both renderers call the same functions through renderer-specific adapters.

The **primary risk** is cross-screen share-link parity breaking silently if the readout logic reads any live DOM geometry (viewport dimensions, `devicePixelRatio`) instead of state-stored, resolution-independent values. The mitigation is simple: make the readout function signature have no way to accept DOM inputs at all — `inchesPerOriginalPixel(sizeInches, originalDimensions, effectiveScale)` cannot accidentally use viewport geometry if it has no parameter to receive it.

A secondary risk unique to this SPA is **false-precision display** — the entire calibration chain (user-drawn line, user-typed height, rounded coordinates, scaled span) compounds into ±a few percent at best, yet a readout showing `34.72 inches` claims precision the pipeline cannot support. The mitigation is also simple: round to the same whole-unit granularity the rest of the app already uses (whole inches / centimeters), consistent with the scale slider's own quantization. This is not just UX; it's an **anti-feature that must be explicitly guarded** — showing decimals is tempting because "it looks precise" and is the default output of floating-point arithmetic, but it would actively mislead users about what the app can actually measure.

## Key Findings

### Recommended Stack

**No new dependencies.** The ruler uses inline SVG overlays (native browser API, already proven in the existing `MeasurementRulerComponent`), native Pointer Events + `Element.setPointerCapture` (established drag pattern in this codebase for calibration ruler and angle-dial), and plain distance/bounds math (5–10 lines per operation, same order of complexity as existing `attachment-canvas-renderer.service.ts` hit-testing).

**Core technologies:**
- **Inline SVG overlay** — proven pattern in existing calibration ruler; avoids canvas-rendering fragmentation
- **Native Pointer Events + `setPointerCapture`** — established drag pattern, touch-safe by construction
- **`measurement-utils.ts` formatting** — reuse existing utilities with imperial/metric awareness
- **`ScalingService` for measurement math** — pure functions taking state-only inputs
- **Karma/Jasmine** (existing) — no new test infrastructure needed

### Expected Features

**Table Stakes (must ship v1.1):**
- Click-drag ruler creation with hit-test target resolution (base model vs. overlay)
- Independently draggable endpoints in original-pixel space
- Multiple rulers per panel, persisted into state and share links
- Live numeric readout with **whole-unit rounding** (no decimal precision)
- Overlay-aware measurement via `overlayScales`/`scaleRelativeToParent` chain
- Explicit per-ruler delete + deselect-without-delete
- Dual-renderer parity (DOM and Canvas)
- One shared `MeasurementRulerComponent` (calibration + viewport contexts)
- Share-link persistence with version 1.0.12, migration entry, fixture

**Anti-Features (actively harmful; must reject):**
- **Decimal-precision readout** — THE critical guard. Whole units only; decimals manufacture false confidence on ±few-percent calibration chain.
- Sub-pixel coordinates in UI/export — maintain pixel-integer convention
- Fabricated confidence scores — project already rejected this for progress indicators
- Auto-detected edge snapping — AR ruler apps in the wild are notorious for overselling; 2D photo has no depth

### Architecture Approach

**State:** `PanelState.rulers: RulerModel[]` (sibling to overlays). Each ruler carries target reference (`targetOverlayId` null for base model), endpoints in original-pixel space, optional label, visibility flag.

**Serialization:** Version bump to 1.0.12, no-op migration entry (rulers is optional with guarded consumers), new fixture. `gatherViewportState()` needs NO changes — rulers auto-travel in share links.

**Measurement math on `ScalingService`:** Pure functions (zero DOM inputs):
- `measurementLineLengthOrFallback(sizeInches, originalDimensions)`
- `inchesPerOriginalPixel(sizeInches, originalDimensions, effectiveScale)`
- `effectiveOverlayScale(scaleRelativeToParent, baseScale, individualScale)` — fixes confirmed Canvas/DOM divergence
- `measureRulerSpan(ruler, sizeInches, originalDimensions, effectiveScale)`

**Hit-testing:** `document.elementsFromPoint(clientX, clientY)` + `data-overlay-id` attributes (browser's native z-order-aware hit-testing).

**Coordinate-transform fix (prerequisite):**
- Tier 1: Replace `rect.width/height` with `imageEl.width/height` in bounds check (behavior-preserving for existing callers, fixes under transform)
- Tier 2: Add `toOriginalCoordsForTransformedTarget()` inverting known translate/rotate/flip transforms (already tracked per-overlay) before rendering or hit-testing

## Implications for Roadmap

**Eight-phase dependency-ordered structure:**

1. **Coordinate Transform Fix** — Tier 1 + Tier 2; gates all ruler placement work
2. **Shared Measurement Math on `ScalingService`** — includes Canvas/DOM divergence fix
3. **State Shape & Serialization** — RulerModel, PanelState.rulers, CRUD methods, cascade-delete, version bump
4. **Ruler Component Generalization** — extend MeasurementRulerComponent to lists + transform context
5. **DOM Viewport Wiring** — hit-testing, rendering, readout formatting
6. **Canvas Parity** — extend Canvas renderer to call shared `ScalingService` functions
7. **Ruler List/Legend Panel** — (optional for v1.1; recommended early v1.x)
8. **`.planning/codebase/` Re-Map** — refresh ARCHITECTURE.md, retire CONCERNS.md

### Critical Pitfalls

1. **Flip & Rotation Coordinate Bugs** — `toOriginalCoords()` doesn't account for panel `scaleX(-1)` or overlay `rotate()`. Treat coordinate-transform fix as structural prerequisite, not a ruler-specific afterthought.

2. **Screen-Derived Readout Contamination** — If readout reads `getBoundingClientRect().width` or `containerDimensions` instead of state values, recipients on different screens compute different numbers. Mitigation: readout function signature has no DOM parameter — cannot accidentally use viewport geometry.

3. **Orphaned Ruler References** — Removing overlay leaves ruler pointing at nothing. Decision needed: prune on removal (simpler), or tolerate-and-hide (render-time resolution)?

4. **Sub-Calibration Precision Display** — `34.72 inches` on ±few-percent calibration is misleading. Mitigation: round to whole units only (whole inches/cm). Document as explicit Key Decision.

5. **Dual-Renderer Drift** — Hand-porting math to Canvas creates two implementations that diverge silently. Mitigation: extract shared pure functions; both renderers call literal same code.

6. **BehaviorSubject Re-Render Storm** — Committing every pointermove to store triggers 60–120Hz re-evaluation. Mitigation: keep drag-in-progress local; commit on pointerup only.

## Open Decisions Requiring Human Ruling

| Decision | Options | Recommendation | Impact |
|----------|---------|-----------------|--------|
| **Orphaned Ruler Policy** | (a) Prune when target removed, (b) Tolerate-and-hide | (a) Prune — simpler, consistent | Shapes cascade-delete logic in Phase 3 |
| **Placement Mode** | (a) Explicit button, (b) Inferred from drag | (a) Explicit — safer, no pan conflict | Phase 5 UX design; FEATURES.md supports (a) |
| **Hit-Test Tie-Breaking** | (a) Topmost wins, (b) Explicit picker | (a) Topmost — simpler, matches reference tools | Phase 5 behavior |
| **Ruler List in v1.1** | (a) Include (Phase 7), (b) Defer v1.x | (a) Include — unmanageable without list at 2+ rulers | Affects milestone scope |
| **Canvas DPR Scaling** | (a) Not in v1.1, (b) Unified helper if added | (a) Not in v1.1 — risk outweighs benefit | Phase 6 scope |
| **`scaleRelativeToParent` Fix** | (a) Phase 2 (shared math), (b) Separate, (c) Phase 6 | (a) Phase 2 — both renderers call same formula | Phases 2 & 6 ownership |

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| **Stack** | HIGH | Zero new dependencies; all tech already in use or native APIs |
| **Features** | MEDIUM-HIGH | Table-stakes from reference tools + explicit requirements. One design decision pending. |
| **Architecture** | HIGH | Every component verified against source; two bugs confirmed by code inspection. Dependencies clear. |
| **Pitfalls** | HIGH | All 23 grounded in source reading. Cross-screen parity and precision pitfalls explicitly guard-railed. |

**Overall: HIGH** — Source-grounded research ready for roadmap.

## Sources

- `src/app/components/measurement-ruler/measurement-ruler.component.ts` — existing pattern
- `src/app/utils/coordinate-transform.ts` — coordinate bugs confirmed
- `src/app/services/scaling.service.ts` — overlay-scale divergence confirmed
- `src/app/services/state-export.service.ts` — serialization procedure
- `src/app/components/image-display/image-display.component.ts` — DOM transform math
- `src/app/services/attachment-canvas-renderer.service.ts` — Canvas divergence confirmed
- `.planning/PROJECT.md` — scope, arithmetic, Active requirements
- `.claude/rules/state-serialization.md` — version procedure

---

*Research completed: 2026-09-15. All four research documents synthesized and cross-verified. Ready for roadmap: YES*

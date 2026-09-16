# Stack Research

**Domain:** In-viewport, multi-instance, serializable measurement-ruler overlay (Angular 20 SPA)
**Researched:** 2026-09-15
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Inline SVG (native browser API, no library) | N/A — platform feature | Render the ruler line, endpoint handles, and text readout as a layer above whatever is rendering the model | The project's *existing* calibration ruler (`measurement-ruler.component.ts/.html/.scss`) already does exactly this: an absolutely-positioned `<svg class="measurement-ruler-overlay">` sits on top of an `<img>`, sized to the image's display box, with `pointer-events: none` on the SVG root and `pointer-events: auto` + `touch-action: none` on the individual `<circle>` handles. This is a proven, working pattern in this exact codebase for the exact interaction (draggable line endpoints). Extending it — rather than introducing a second rendering technique — is what makes "one ruler concept" (an explicit v1.1 requirement) achievable at all. |
| Angular 20 `input()`/`input.required()` signals + `@if`/`@for` control flow | Already in repo (`^20.3.17`) | New ruler component surface (multi-instance, per-panel) | No stack change — just apply the modern-syntax convention CLAUDE.md already mandates for new code. The existing `measurement-ruler.component.ts` still uses `@Input()`/`@Output()` (pre-signals); when this component is extended for the viewport use case, migrate its inputs/outputs to signals as part of that work (small, contained migration, not a new dependency). |
| Native Pointer Events + `Element.setPointerCapture` | Platform API (all evergreen browsers + iOS Safari 13+) | Endpoint drag, and (new) ruler-placement / whole-ruler-move gestures | Already the established drag pattern in this codebase (`measurement-ruler.component.ts`, `angle-dial.component.ts` — both element-owned PointerCapture drags, a v1.0 hardening deliverable). No reason to introduce a second input-handling model for the one new interactive surface in this milestone. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| *(none)* | — | Hit-testing "which model/overlay did the ruler land on" | Plain distance/bounds math. `attachment-canvas-renderer.service.ts` already has this exact shape of hit-test (`hitTest(x, y, positions, isMobileDevice)` using `Math.sqrt(Math.pow(x - position.x, 2) + Math.pow(y - position.y, 2)) <= radius`). For a ruler, the equivalent check is point-in-rendered-bounding-box (base model / each overlay's display rect) — a handful of comparisons, not a library concern. |
| *(none)* | — | Point-to-line-segment distance, midpoint, angle for the ruler line itself | `measurement-ruler.component.ts` already computes `Math.atan2(dy, dx)` for arrow/chevron rotation and midpoint-at-t interpolation (`chevronTransforms()`). The only new geometry needed for the viewport ruler (label placement offset from the line, maybe a "did the user tap near the line" test) is the same order of complexity — 3–5 line formulas, already precedented inline in this file. A geometry package (e.g. `turf`, `mathjs`) would be strictly heavier than the problem. |
| `measurement-utils.ts` (existing, in-repo) | — | Convert `measuredLength` (total inches) to a display string honoring `globalSettings.measurementUnit` | `formatHeight()` / `formatHeightCompact()` already implement imperial (`ft'in"`) and metric (`m`/`cm`) formatting with rounding and edge cases (already unit-tested in `measurement-utils.spec.ts`). The ruler readout should call this directly — it is the same "total-inches-in, unit-aware-string-out" shape the rest of the app already uses for model heights. Do not write a second formatter. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Karma/Jasmine (existing) | Unit-test the new ruler placement/hit-test/serialization logic | No new test tooling needed. Geometry and unit-conversion functions are pure and trivially testable exactly like `coordinate-transform.spec.ts` and `measurement-utils.spec.ts` already do for the analogous existing code. |

## Installation

```bash
# Nothing to install. This feature adds zero runtime dependencies and zero dev dependencies.
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|--------------------------|
| Inline SVG overlay (absolutely positioned over the host element) | Canvas-drawn ruler (draw line/handles directly into `attachment-preview`'s existing `<canvas>` 2D context) | Only if the ruler needed to be baked into an exported raster image, or if you had hundreds of simultaneously-interactive vector shapes and SVG's per-node DOM cost became measurable. Neither applies here: rulers per panel are a handful at most, and canvas drawing would force you to hand-roll hover/active states, `filter: drop-shadow`, and CSS transitions that SVG + CSS already give for free — the existing calibration ruler's `.ruler-point:hover { r: 12; }` is one line of SCSS; the canvas equivalent is a manual redraw. Canvas would also mean the ruler is a *second* rendering implementation, directly working against the "one ruler concept" requirement. |
| Absolutely-positioned SVG overlay, positioned via the host element's bounding rect | Angular CDK (`@angular/cdk` drag-drop / overlay) | Only if the project needed CDK's sorting, connected-drop-list, or built-in a11y announcer for *other* reasons. For a single free-floating draggable handle, CDK is a new dependency this project doesn't have, and `CdkDrag` is documented to trigger app-wide change detection on interaction — a real cost in a signal/RxJS app that already solved this with element-owned `PointerCapture`. The project's own precedent (ruler, angle-dial) already outperforms CDK for this narrow case. |
| Native `<text>` with `paint-order`/`stroke` halo for the readout label | SVG `foreignObject` embedding an HTML `<span>` | If the label ever needs to *wrap* multi-line text or use rich HTML (icons, multiple font weights) `foreignObject` earns its keep. The ruler readout is a short fixed-format string (`4'7"` / `139.7 cm`) that never wraps, so plain `<text>` avoids `foreignObject`'s well-known Safari print/serialization quirks and keeps the whole overlay one rendering technology, consistent with the rest of the file. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|--------------|
| `@angular/cdk` (drag-drop or overlay) | Not currently a dependency; CLAUDE.md explicitly rejects new UI frameworks/heavy deps without strong justification; CDK's `CdkDrag` triggers broader change detection than this app's existing element-owned `PointerCapture` drags, which already solve this exact problem class (ruler, angle-dial) | Existing `PointerCapture`-based drag pattern in `measurement-ruler.component.ts` |
| Canvas/annotation libraries (Konva, Fabric.js, Paper.js, Two.js) | These exist to manage large interactive scene graphs with many shapes, layering, and serialization of their own — none of which this feature needs (a handful of lines+circles+text per panel). They'd also introduce a second overlay-rendering paradigm alongside the existing SVG ruler and DOM `image-display`/Canvas `attachment-preview` split, which the milestone explicitly wants collapsed to "one ruler concept," not expanded | Plain SVG, as above |
| Gesture libraries (Hammer.js, interact.js, `@use-gesture`-style ports) | Native Pointer Events + `setPointerCapture` already give reliable multi-touch-safe single-pointer drag tracking; the project removed all `setTimeout`-based drag timing hacks in v1.0 specifically in favor of this native approach | Native `pointerdown`/`pointermove`/`pointerup`/`pointercancel` + `setPointerCapture`, exactly as in the existing ruler |
| Geometry/math packages (Turf.js, math.js, gl-matrix) | The only geometry this feature needs — segment length, midpoint, angle, point-in-rect — is already written inline elsewhere in this codebase (`attachment-canvas-renderer.service.ts` hit-test, `measurement-ruler.component.ts` chevron/arrow math) at 3–5 lines per operation | Inline functions colocated with (or added to) `coordinate-transform.ts` |
| D3 (d3-selection, d3-drag, d3-shape) | Would duplicate Angular's own DOM binding and the project's own PointerCapture drag handling; D3's own drag/data-join model doesn't compose cleanly with Angular's change detection and signals | Angular template bindings (`[attr.x1]`, `[attr.cx]`, etc.) exactly as the existing ruler template already does |
| `foreignObject` for the readout label | Adds a second content model (HTML-in-SVG) for a string that never wraps; known cross-browser print/serialization inconsistencies | SVG `<text>` with `paint-order: stroke fill` halo (see below) |

## Stack Patterns by Variant

**If the ruler must sit over `image-display` (DOM `<img>` renderer):**
- Use the existing `toOriginalCoords()`/`displayFromOriginal()`/`clampToNatural()` transform in `coordinate-transform.ts` unchanged — it is already written against an `HTMLImageElement`'s `getBoundingClientRect()` + `naturalWidth/naturalHeight` vs `width/height` ratio, which is exactly what `image-display` renders.
- Note the milestone's own flagged defect: `toOriginalCoords()`'s bounds/scale divergence needs fixing so coordinates stay correct under a CSS `transform` (panel pan/zoom). This is an architecture/bugfix task for the phase planner, not a stack change — no library fixes this, it's a formula correction in an existing pure function.

**If the ruler must sit over `attachment-preview` (Canvas 2D renderer):**
- There is no `HTMLImageElement` in the DOM to hand to `toOriginalCoords()` — `attachment-preview` loads an `Image` into memory and draws it into a `<canvas>` at a computed `imagePosition`/scale within `canvasSize`. The coordinate-transform utility needs a second entry point (or a generalized signature) that accepts `{ originalWidth, originalHeight, displayRect }` rather than requiring an `HTMLImageElement` specifically, so the SAME ruler component can call it from either host. This is a small refactor of `coordinate-transform.ts`'s function signatures, not a new dependency — flag it for the phase planner as the concrete mechanism behind the "renders consistently across both renderers" requirement.
- The SVG overlay itself still works unchanged over a `<canvas>` host: SVG doesn't inspect what's beneath it, it only needs a host element's bounding rect to position itself and translate pointer coordinates, exactly as it does today over an `<img>`.

**If a ruler needs to be draggable as a whole (not just its endpoints) to reposition it before re-anchoring to a different hit-tested target:**
- Reuse the same PointerCapture pattern on a transparent "grab" hit-area (e.g. a wide invisible stroked line) rather than introducing a drag library — this is additive to the existing two-handle pattern, not a different mechanism.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|------------------|-------|
| Angular 20.3.17 (existing) | Native SVG + Pointer Events | No version coupling — both are browser platform features, not npm packages, so there is nothing to pin or upgrade for this feature. |
| `measurement-utils.ts` (existing, untouched) | New ruler readout | No signature changes needed; call `formatHeight(totalInches, { unit: globalSettings.measurementUnit })` with the ruler's computed `measuredLength`. |

## Touch Target and Legibility Notes (informs UI-spec, not a library choice)

- **Current touch targets are below WCAG AAA, at-or-near WCAG AA.** The existing `.ruler-point` circles are `r="10"` (20px diameter) by default and `r: 12` (24px diameter) under the `@media (max-width: 480px)` rule. WCAG 2.2's **2.5.8 Target Size (Minimum, Level AA)** requires 24×24 CSS px — the mobile size just clears this; the desktop default does not, though desktop pointer precision makes this lower-risk. WCAG **2.5.5 Target Size (Enhanced, Level AAA)** recommends 44×44 CSS px, which neither size meets. Given this app is mobile-first, the phase planner should consider enlarging the *interactive* hit area — not necessarily the visual dot — by layering a second, transparent, `pointer-events: auto` circle at `r≈22` (44px diameter) under/around the same-position visible `r=10` dot. This is a zero-dependency SVG technique (an invisible larger hit target siblings a smaller visible one) and is the standard way to satisfy target-size guidance without changing visual design.
- **`touch-action: none` must be preserved** on every new draggable handle (endpoints, and any new whole-ruler grab handle) exactly as it is today on `.ruler-point` — this is what prevents the browser's native scroll/pinch-zoom gesture from hijacking a drag on mobile, and losing it silently reintroduces a class of mobile bug this project already fixed once (v1.0 Phase 3 PointerCapture work).
- **Readout label legibility over arbitrary image backgrounds:** use `<text>` with `paint-order: stroke fill`, a light `stroke` (e.g. white, 3–4px) and a dark `fill`, matching the existing `filter: drop-shadow(...)` treatment already used on `.ruler-line`/`.ruler-chevron` for the same reason (contrast over unpredictable image content). Position the label offset perpendicular to the ruler line at its midpoint (reusing the existing `t=0.5` interpolation already written for chevron placement) so the text sits beside the measured span rather than on top of it, and keep it clear of the two endpoint handles' hit areas.

## Sources

- In-repo, HIGH confidence (primary source, read directly):
  - `src/app/components/measurement-ruler/measurement-ruler.component.ts` / `.html` / `.scss` — existing calibration-ruler SVG-overlay + PointerCapture pattern to extend
  - `src/app/utils/coordinate-transform.ts` — existing display-px ↔ original-image-px transform, `HTMLImageElement`-coupled
  - `src/app/components/image-display/image-display.component.html` — DOM `<img>` + overlay rendering
  - `src/app/components/attachment-preview/attachment-preview.component.ts` — Canvas 2D renderer, existing `hitTest()`/`hoverTest()` distance-based hit-testing in `attachment-canvas-renderer.service.ts`
  - `src/app/utils/measurement-utils.ts` — existing unit-aware formatting (`formatHeight`, `formatHeightCompact`)
  - `package.json` — confirms no CDK, no canvas/annotation library, no gesture library currently present
  - `.planning/PROJECT.md` — v1.1 milestone scope, constraints, and the explicit "no new UI frameworks/heavy deps without justification" constraint
- Web (MEDIUM confidence, general platform guidance, cross-checked against multiple results):
  - WCAG 2.5.5 Target Size (Enhanced) and 2.5.8 Target Size (Minimum) guidance — 44×44 px (AAA) vs 24×24 px (AA) minimum pointer target sizing: https://wcag.dock.codes/documentation/wcag255/ , https://dequeuniversity.com/resources/wcag2.1/2.5.5-target-size
  - SVG `paint-order` for halo/outline text legibility: https://www.oreilly.com/content/elegant-outlines-with-svg-paint-order/ , https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/paint-order
  - Angular CDK `CdkDrag` change-detection cost vs. custom PointerEvent-based dragging: https://angular.dev/guide/drag-drop , https://acharyaks90.medium.com/how-to-make-anything-draggable-in-angular-75b90e294ff0

---
*Stack research for: In-viewport measurement-ruler overlay (Size✦Lab v1.1)*
*Researched: 2026-09-15*

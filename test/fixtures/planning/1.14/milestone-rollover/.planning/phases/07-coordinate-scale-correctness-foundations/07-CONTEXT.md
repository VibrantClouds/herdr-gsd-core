# Phase 7: Coordinate & Scale Correctness Foundations - Context

**Gathered:** 2026-09-15
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers the coordinate and scale **primitives** the ruler will later sit on. It is a
prerequisite, not ruler work — no ruler UI, no ruler state, no serialized-shape change.

In scope:
- `toOriginalCoords()` converts correctly under the CSS transforms the real viewport applies
  (panel `scaleX(-1)` flip, per-overlay `rotate()`) — RENDER-01
- A generalized, renderer-agnostic entry point so a canvas-hosted target with no `HTMLImageElement`
  converts through the same math — RENDER-02
- One shared `ScalingService` overlay-effective-scale helper, consumed by both renderers, with the
  Canvas renderer honouring `scaleRelativeToParent` — RENDER-03
- The state-only measurement function (zero DOM/viewport inputs) — RULER-07
- Overlay-anchored inches-per-pixel derived from the overlay's own scale chain — TARGET-02

Out of scope (belongs to later phases): ruler placement UI, armed place-ruler mode, hit-testing,
endpoint dragging, the ruler list, `RulerModel` state/serialization (Phase 8 owns the single
`1.0.12` version bump), canvas ruler rendering (Phase 11).

</domain>

<decisions>
## Implementation Decisions

The project owner delegated all four gray areas: *"I want you to come to your own conclusions, do
research for each section as needed and take your recommendation."* Every decision below is
therefore **Claude's discretion**, and every one is grounded in source read during this session —
file and line references are given so the planner can re-verify rather than trust.

### Coordinate transform under CSS transforms (RENDER-01)

- **D-01:** Invert an affine transform **built from state values**, hand-rolled in
  `coordinate-transform.ts`. Do **not** use `getComputedStyle()` / `DOMMatrix` to read the live
  rendered transform. — **Reversibility:** reversible — local to one util and its specs.

  *Why.* Only two transforms are ever in play and both are known state scalars, so a closed-form
  inverse is available and a general CSS-matrix inversion buys nothing:
  - Panel flip is `transform: scaleX(-1)` on `.flip-wrapper` (`compare-modal.component.scss:141`),
    toggled by `[class.is-flipped]="isLeftFlipped()"` (`compare-modal.component.html:30,55`). The
    wrapper is an **ancestor** of `app-image-display`, so the `<img>`'s own
    `getBoundingClientRect()` already comes back mirrored — this is the exact mechanism behind
    PITFALLS.md Pitfall 1.
  - Overlay rotation is `translate(x,y) rotate(deg)` with `transform-origin` at the scaled source
    attachment point (`image-display.component.ts:236-240`), where the angle is
    `overlayRotations[overlay.id]` — state.

  Reading live computed style would pull viewport-derived geometry into the very path RULER-07
  exists to keep state-pure, and would additionally sample mid-animation values because
  `.flip-wrapper` carries `transition: transform var(--motion-slow)` (`compare-modal.component.scss:139`).

- **D-02:** Delete `getLeftTransformWithFlip()` / `getRightTransformWithFlip()`
  (`compare-modal.component.ts:499-507`) and their four specs
  (`compare-modal.component.spec.ts:250-268`). — **Reversibility:** reversible.

  *Why.* They are **dead code**: nothing outside their own specs calls them, and the template binds
  the plain `leftTransform` / `rightTransform` (`compare-modal.component.html:22,47`) while the flip
  is applied by the SCSS class. They are a second, plausible-looking "where flip comes from" that a
  later reader implementing ruler coordinates would find first. Same hygiene rationale as D-07.

### Generalized entry point (RENDER-02)

- **D-03:** Add a **descriptor-shaped** function as the real implementation, and keep the existing
  `HTMLImageElement` signatures as thin adapters over it. Additive, not breaking. —
  **Reversibility:** reversible.

  *Why.* Success criterion 5 requires that "no second copy of the transform math exists anywhere in
  the tree" — that is satisfied by one implementation plus adapters, and does **not** require
  churning callers. The three existing caller files all operate on untransformed `<img>` elements in
  modal contexts and gain nothing from migration while carrying real regression risk against Phase 1
  and Phase 5 work:
  - `attachment-point-picker.component.ts:85`
  - `attachment-point-definition.service.ts:52`
  - `measurement-ruler.component.ts:72,73,122,130`

  The descriptor carries `{ originX, originY, displayWidth, displayHeight, naturalWidth, naturalHeight }`
  plus the state-built transform from D-01. The canvas adapter supplies `imagePosition` as the origin
  and the drawn `scaledWidth/scaledHeight` as the display dims — both already computed in
  `attachment-canvas-renderer.service.ts:170-171,243-247`.

- **D-04:** Close the bounds/scale divergence inside the descriptor: **one** display-dimension pair
  feeds both the bounds check and the scale ratio. — **Reversibility:** reversible.

  *Why.* Today `toOriginalCoords` bounds-checks against `rect.width`/`rect.height` but computes the
  ratio from `imageEl.width`/`imageEl.height` (`coordinate-transform.ts:39-46`). These agree only
  when no ancestor scales the element — which is precisely the condition this phase removes. This is
  the "bounds/scale divergence" named in PROJECT.md's Active requirement list.

### Shared overlay-scale helper (RENDER-03)

- **D-05:** The shared helper is `(scaleRelativeToParent ? panelScale : 1) × individualScale` and
  returns a scale **with no fit-normalizer folded in**. Each renderer applies its own fit factor
  *outside* the helper — DOM multiplies by `relativeScale`, Canvas multiplies by `previewScale` at
  draw time. — **Reversibility:** costly — the helper becomes the single reference for two renderers
  plus all later ruler math; changing its contract later means re-auditing every call site and the
  cross-renderer parity test.

  *This answers the open investigation STATE.md assigned to this phase.* The two renderers' "parent
  scale" inputs are **not numerically equal and never were**, but not for the reason the concern
  anticipated:
  - DOM: `effectiveBaseScale = this.scale * this.relativeScale` (`image-display.component.ts:143,154`),
    then `parentScale = overlay.scaleRelativeToParent ? effectiveBaseScale : 1` (`:199`).
  - Canvas: `scale` is the **raw** `panelState.scale`, threaded
    `compare-modal.component.html:241` → `attachment-sidebar` `[scale]="parentScale"`
    (`attachment-sidebar.component.html:25`) → `attachment-preview.component.ts:257`. The canvas then
    applies its own fit factor `previewScale` separately at draw
    (`attachment-canvas-renderer.service.ts:227-247`).

  So DOM **folds** its fit factor into `parentScale` where Canvas **keeps it separate**. Because
  `calculateImageDimensions` is linear in `scale` (`heightPixels = effectiveHeight * basePixelsPerUnit * scale`,
  `scaling.service.ts:82`), the two are *already equivalent when `scaleRelativeToParent` is true* —
  and diverge **only** in the `false`/`undefined` branch. **The fix is therefore smaller than the
  concern feared, but it changes both renderers, not just the Canvas.**

- **D-06:** Accept that the DOM renderer's `false`/`undefined` branch changes behaviour: such an
  overlay will now receive the viewport fit factor, where today it escapes fitting entirely
  (`parentScale = 1` drops both the panel scale *and* `relativeScale`). Land it without a UAT gate.
  — **Reversibility:** reversible.

  *Why no UAT gate.* `scaleRelativeToParent: false` is **unreachable in production today**. All
  three creation sites hardcode `true` (`compare-modal.component.ts:307`,
  `comparison-panel.component.ts:322`, `model-attachment-defaults.service.ts:311`); there is no UI
  toggle for it anywhere in the templates; no metadata JSON under `src/assets/metadata/` sets it; and
  the only `false` values in the tree are in two spec files. The one reachable production path is an
  overlay payload that **omits** the `?`-optional field, since `undefined` takes the falsy branch —
  and no state fixture in `src/app/testing/state-export-fixtures.ts` carries a non-empty `overlays`
  array, so nothing exercises it. The deliverable that protects this is the cross-renderer parity
  test, not a human pass.

- **D-07:** **Delete** `ScalingService.calculateOverlayScale()` (`scaling.service.ts:125-135`) and
  its five specs (`scaling.service.spec.ts:161-197`). Do not keep it with a "not the reference"
  comment. — **Reversibility:** reversible — recoverable from git if ever wanted.

  *Why deletion rather than annotation.* The roadmap asks this phase to decide its fate. It has zero
  non-spec callers, and it is not merely a *third* formula — it is a **wrong** one. It folds in a
  `sizeRatio = overlayHeight / baseModelHeight` term that **neither** live renderer applies, because
  both pass a scale into `calculateImageDimensions`, which already derives height from
  `defaultSizeInches`. Adopting it would double-count the height ratio. A commented-out-but-present
  wrong formula in the one file this phase is making authoritative is exactly the trap the phase
  exists to remove. Its specs pin the wrong formula and go with it.

### Measurement math (RULER-07, TARGET-02)

- **D-08:** The measurement function lives on `ScalingService` and takes a **plain state-only params
  object**. Its signature must have no `HTMLElement`, `ElementRef`, `HTMLImageElement`, `rect`, or
  container-dimension parameter of any kind. — **Reversibility:** costly — it is the contract every
  later ruler phase reads through.

  *Why structural rather than tested-for.* Success criterion 3 asks for cross-screen parity to be
  structural. If there is no parameter through which viewport geometry could enter, no implementation
  can leak it. The mocked-differing-viewport test then proves the property rather than being the only
  thing defending it. This matters because `image-display.component.ts` keeps
  `updateContainerDimensions()` / `this.containerDimensions` right next to where ruler code will
  land — PITFALLS.md Pitfall 4.

  Implements PROJECT.md's stated arithmetic literally:
  ```
  inchesPerOriginalPixel = (defaultSizeInches.height × panelState.scale) / L
  measuredLength         = rulerSpanInOriginalPx × inchesPerOriginalPixel
  ```
  where `L` is the `measurementLine` length via `calculateMeasurementLineLength()`
  (`scaling.service.ts:103`), falling back to `originalDimensions.height`.

- **D-09:** For an overlay-anchored span (TARGET-02), every input comes from the **overlay's own**
  metadata and the D-05 helper — `overlay.attachmentMetadata.defaultSizeInches`, its
  `originalDimensions`/`measurementLine`, and its own effective scale — never the base model's. —
  **Reversibility:** reversible.

- **D-10:** Comment both call sites of the scale distinction explicitly, as the roadmap instructs:
  the **rendering** path keeps using `effectiveBaseScale` / `previewScale`, the **measurement** path
  passes `panelState.scale` only. `relativeScale` is viewport-derived and must never reach ruler
  math. Without the comments a later reader will "fix" one to match the other. —
  **Reversibility:** reversible.

### Claude's Discretion

All ten decisions above were delegated. The planner should treat them as locked inputs, but any of
them may be revisited if research at planning time contradicts the source evidence cited — each
decision names the file and line it rests on specifically so that is checkable.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and requirements
- `.planning/ROADMAP.md` §"Phase 7: Coordinate & Scale Correctness Foundations" — goal, the five
  success criteria, and the "Notes for planning" block that assigns the `calculateOverlayScale()`
  disposition and the `effectiveBaseScale` investigation to this phase
- `.planning/ROADMAP.md` §"Standing constraints (apply to every v1.1 phase)" — one version bump for
  the milestone (Phase 8 owns it), ruler never writes model size, whole units only
- `.planning/REQUIREMENTS.md` — RENDER-01 (:54), RENDER-02 (:55), RENDER-03 (:56), RULER-07 (:24),
  TARGET-02 (:32)
- `.planning/PROJECT.md` §"Current Milestone: v1.1" — the authoritative measurement arithmetic and
  the "what the ruler is not" correction
- `.planning/STATE.md` §"Pending Todos" — the RENDER-03 open investigation this phase was assigned
  (answered in D-05 above); §"v1.1 decisions already settled" — the seven locked owner decisions

### Structural input (use these, not `.planning/codebase/`)
- `.planning/research/PITFALLS.md` — Pitfalls 1 (flip-blind conversion), 2 (rotated-overlay bounding
  rect), 3 (rounding accumulation), 4 (screen-derived measurement), 10 (forked coordinate math),
  11 (duplicated true-size arithmetic) are all Phase 7 territory
- `.planning/research/ARCHITECTURE.md` — source-verified structural map, 2026-09-15
- `.planning/codebase/` is **stale by design** — Phase 12 owns re-mapping it (MAP-01/MAP-02). Do not
  treat it as authoritative for this phase.

### Project rules
- `.claude/rules/state-serialization.md` — relevant only as a boundary: Phase 7 changes no serialized
  shape, so no version bump, no `MIGRATIONS` entry, no fixture is owed here
- `CLAUDE.md` §"Critical Invariants" — attachment points are in original-image pixel coordinates;
  both renderers use identical math; "inches" are arbitrary comparison units
- `.claude/skills/scaling-system/SKILL.md` — the scaling domain skill
- `.claude/skills/attachment-system/SKILL.md` — the attachment/overlay domain skill

### Primary source files this phase edits
- `src/app/utils/coordinate-transform.ts` — all three functions; the descriptor refactor lands here
- `src/app/services/scaling.service.ts` — shared overlay-scale helper in, `calculateOverlayScale()` out
- `src/app/components/image-display/image-display.component.ts:143,154,199` — DOM scale chain
- `src/app/services/attachment-canvas-renderer.service.ts:217-247` — Canvas scale chain
- `src/app/components/compare-modal/compare-modal.component.ts:499-507` + `.scss:136-143` +
  `.html:30,55` — flip application and the dead helpers

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/app/utils/coordinate-transform.ts` — already the extracted single source of truth for the
  `naturalWidth/width` formula; it was created precisely because the math had been duplicated
  "near-identically" across two modals. Extend it, do not fork it.
- `ScalingService.calculateMeasurementLineLength()` (`scaling.service.ts:103`) — the `L` term in the
  measurement arithmetic already exists.
- `ScalingService.calculateImageDimensions()` (`scaling.service.ts:58`) — **linear in `scale`**
  (`:82`), which is the property that makes the DOM and Canvas chains reconcilable (D-05).
- `ScalingService` is already injected into both renderers, so the shared helper needs no new wiring.
- `MeasurementRulerComponent` — the existing calibration ruler; the established pattern for keeping
  a working line in original-pixel space and only reprojecting for render (PITFALLS.md Pitfall 3).
  Phase 9 unifies it with the viewport ruler; Phase 7 only must not break it.

### Established Patterns
- Pure utils in `src/app/utils/` take plain data, never services, and let callers decide bounds
  policy (clamp vs. reject) — the descriptor refactor must preserve this.
- Attachment points are always stored in **original image pixel coordinates**, never scaled.
- Transform-origin is used for rotation only, never for scaling — scaling is uniform/center-based.
- Both renderers are required to use identical math (a named Critical Invariant in `CLAUDE.md`);
  this phase is the first to make that structurally true for overlay scale.

### Integration Points
- `image-display.component.ts:199` and `attachment-canvas-renderer.service.ts:221` both become
  callers of the new D-05 helper — these two lines are the whole of RENDER-03's surface.
- `attachment-preview.component.ts:276-282` `onCanvasClick()` is the canvas coordinate path that
  D-03's adapter must serve; it currently works in canvas CSS space and hit-tests precomputed
  positions, never reaching original-image space.
- Three `coordinate-transform` callers stay on the `HTMLImageElement` adapters untouched (D-03).

</code_context>

<specifics>
## Specific Ideas

- The RENDER-03 investigation is **answered, not deferred** — see D-05. The planner should size that
  work against the finding (both renderers change, `false`/`undefined` branch only) rather than
  re-running the measurement.
- Two dead-code removals are folded in deliberately because this phase is already editing both files
  and both are traps specifically for the reader who comes next to implement ruler coordinates:
  `calculateOverlayScale()` (D-07) and the flip-transform helpers (D-02).
- Success criterion 3's parity test should mock **both** container size and `devicePixelRatio`, per
  the criterion's wording, even though D-08 makes the property structural.

</specifics>

<deferred>
## Deferred Ideas

- **Canvas `devicePixelRatio` scaling** — PITFALLS.md Pitfall 5 notes the canvas backing store is set
  1:1 with CSS pixels today, internally consistent but soft on high-DPI. Explicitly **not** changing
  this in Phase 7; if ever pursued it belongs in Phase 11 with render and hit-test sharing one
  helper.
- **Ruler endpoint vs. attachment-point hit-test priority** — PITFALLS.md Pitfall 12; belongs to
  Phase 10/11 interaction work.
- **Ruler drag vs. panel pan gesture claiming** — PITFALLS.md Pitfall 13; Phase 9.
- **Panel positions not recomputed on width-only viewport resize** — the standing concern at
  `compare-modal.component.ts:662`, flagged in STATE.md as the best early-fix candidate. It touches
  `compare-modal`, which this phase also edits, but it is a layout bug rather than a coordinate or
  scale primitive. Out of scope here; still unowned by any v1.1 phase.
- **`Elf` model asset 404** — asset gap, not code; unrelated to this phase.

</deferred>

---

*Phase: 7-coordinate-scale-correctness-foundations*
*Context gathered: 2026-09-15*

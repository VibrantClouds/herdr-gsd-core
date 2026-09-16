# Phase 7: Coordinate & Scale Correctness Foundations - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-15
**Phase:** 7-coordinate-scale-correctness-foundations
**Areas discussed:** Transform inversion strategy, coordinate-transform.ts migration, Canvas preview visible change, calculateOverlayScale() fate

---

## Gray-area selection

| Option | Description | Selected |
|--------|-------------|----------|
| Transform inversion strategy | RENDER-01. Closed-form inverse from threaded state vs. general CSS-matrix inversion via `DOMMatrix`/`getComputedStyle`. | ✓ |
| coordinate-transform.ts migration | RENDER-02. Breaking descriptor signature with all 3 callers migrated, vs. additive overload leaving callers untouched. | ✓ |
| Canvas preview visible change | RENDER-03. Whether DOM is the reference and Canvas moves to match, and whether the visible change needs UAT. | ✓ |
| calculateOverlayScale() fate | Delete the dead third formula and its 5 specs, vs. keep it marked not-the-reference. | ✓ |

**User's choice:** *"I want you to come to your own conclusions, do research for each section as needed and take your recommendation."*

**Notes:** All four areas delegated wholesale to Claude. Each was then researched against the actual
source rather than answered from the options as posed; two of the four questions turned out to be
mis-framed by the research that followed (see below).

---

## Transform inversion strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Closed-form inverse from state | Thread the known flip boolean + rotation angle/origin; predictable and testable, new transforms need new parameters. | ✓ |
| General CSS-matrix inversion | Invert the live computed transform; robust to future transforms but reads rendered geometry. | |

**Outcome:** D-01, D-02 — closed-form inverse built from state, hand-rolled, no `DOMMatrix` and no
`getComputedStyle`.

**Notes:** Research located the live flip at `compare-modal.component.scss:141` (`.flip-wrapper.is-flipped`),
an **ancestor** of the `<img>`, which confirms the PITFALLS.md Pitfall 1 mechanism directly. It also
surfaced that `getLeftTransformWithFlip()` / `getRightTransformWithFlip()`
(`compare-modal.component.ts:499-507`) are dead code reachable only from their own specs — folded
into the phase as a removal (D-02). The `transition: transform` on `.flip-wrapper` was an additional
argument against reading computed style, since it would sample mid-animation values.

---

## coordinate-transform.ts migration

| Option | Description | Selected |
|--------|-------------|----------|
| Breaking signature change | Descriptor shape replaces `HTMLImageElement`; all existing callers migrate this phase. | |
| Additive overload | Descriptor form becomes the implementation; `HTMLImageElement` signatures retained as thin adapters. | ✓ |

**Outcome:** D-03, D-04 — additive, with a single implementation behind adapters so success
criterion 5 ("no second copy of the transform math") still holds.

**Notes:** The question as posed said "3 existing callers"; research corrected that to three caller
*files* — `attachment-point-picker.component.ts:85`, `attachment-point-definition.service.ts:52`, and
`measurement-ruler.component.ts` (four call sites) — all operating on untransformed `<img>` elements
in modal contexts, so migration would be pure regression risk against Phase 1 and Phase 5 work for no
behavioural gain. The bounds/scale divergence (`rect.width` for bounds vs. `imageEl.width` for the
ratio, `coordinate-transform.ts:39-46`) was folded into the descriptor as D-04.

---

## Canvas preview visible change

| Option | Description | Selected |
|--------|-------------|----------|
| DOM is the reference; Canvas moves to match | Canvas starts honouring the flag; only the Canvas renderer changes. | |
| Land without UAT gate | Accept the visible change as-is, defended by the cross-renderer parity test. | ✓ |
| Gate on UAT | Require a human pass before landing. | |

**Outcome:** D-05, D-06 — but the framing was wrong, and the research replaced it.

**Notes:** This is the roadmap's open investigation, and it is now **answered**. The DOM's
`effectiveBaseScale` (`scale × relativeScale`) and the Canvas's raw `scale` are **not** numerically
equal — but the Canvas applies its own fit factor `previewScale` separately at draw time where the
DOM folds `relativeScale` into `parentScale`. Because `calculateImageDimensions` is linear in `scale`
(`scaling.service.ts:82`), the two chains are already **equivalent when `scaleRelativeToParent` is
true**, and diverge only in the `false`/`undefined` branch. So "Canvas moves to match DOM" is not the
right shape: the shared helper must return a fit-normalizer-free scale and **both** renderers change,
in that one branch.

The UAT question then answered itself. `scaleRelativeToParent: false` is unreachable in production —
hardcoded `true` at all three creation sites (`compare-modal.component.ts:307`,
`comparison-panel.component.ts:322`, `model-attachment-defaults.service.ts:311`), no UI toggle, absent
from all metadata JSON, `false` only in two spec files, and no state fixture carries a non-empty
`overlays` array. The only reachable path is `undefined` from a payload omitting the optional field.
No UAT gate; the parity test is the deliverable.

---

## calculateOverlayScale() fate

| Option | Description | Selected |
|--------|-------------|----------|
| Delete it and its 5 specs | Removes the last formula that could be mistaken for the shared helper. | ✓ |
| Keep, marked not-the-reference | Preserves history at the cost of leaving a third candidate in the file. | |

**Outcome:** D-07 — delete.

**Notes:** Research upgraded the case for deletion beyond "it is a third formula". Its
`sizeRatio = overlayHeight / baseModelHeight` term is applied by **neither** live renderer, because
both pass a scale into `calculateImageDimensions`, which already derives height from
`defaultSizeInches`. Adopting it would double-count the height ratio — so it is a *wrong* formula, not
merely a redundant one, and its five specs pin the wrong behaviour.

---

## Claude's Discretion

All four areas. The project owner delegated every decision explicitly and asked for a researched
recommendation rather than a menu selection. Ten decisions (D-01 … D-10) were recorded in CONTEXT.md,
each citing the file and line it rests on so the planner can re-verify rather than trust.

Two decisions were added that were not among the four areas presented, because the research surfaced
them: D-02 (remove the dead flip-transform helpers) and D-04 (close the bounds/scale divergence inside
the descriptor).

## Deferred Ideas

- Canvas `devicePixelRatio` scaling — explicitly not pursued in Phase 7; belongs to Phase 11 if ever
- Ruler endpoint vs. attachment-point hit-test priority — Phase 10/11
- Ruler drag vs. panel pan gesture claiming — Phase 9
- Panel positions not recomputed on width-only viewport resize (`compare-modal.component.ts:662`) —
  still unowned by any v1.1 phase; a layout bug, not a coordinate or scale primitive
- `Elf` model asset 404 — asset gap, unrelated

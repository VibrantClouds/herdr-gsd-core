# Phase 1: Component Decomposition - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-01
**Phase:** 1-Component Decomposition
**Areas discussed:** Shared logic between upload-modal and attachment-edit-modal, Extraction style, attachment-preview rendering/interaction split, Risk mitigation for untested attachment-edit-modal

---

## Shared Logic Between upload-modal and attachment-edit-modal

| Option | Description | Selected |
|--------|-------------|----------|
| One shared service/component, used by both | Extract ruler/measurement dragging and attachment-point definition into shared, reusable pieces used by both modals. Matches CONCERNS.md's fix approach. Eliminates duplication but couples the two modals' behavior. | ✓ |
| Extract independently per component | Each modal gets its own extracted sub-component/service, even though the logic looks similar today. Lower coupling risk, but leaves the current duplication in place. | |

**User's choice:** One shared service/component, used by both (recommended option)
**Notes:** Codebase scouting found `onRulerPointMouseDown`, `onRulerPointMove`, `updateRulerPixelLength`, `setRulerPreset`, `getScaledRulerX`/`getScaledRulerY`, `isDefaultVerticalRuler` are near-line-for-line duplicates between `upload-modal.component.ts` and `attachment-edit-modal.component.ts`.

---

## Extraction Style

| Option | Description | Selected |
|--------|-------------|----------|
| Presentational sub-components for UI-heavy concerns, services for pure logic | E.g. ruler/measurement UI and attachment-point-picker become standalone components; image cropping/compression and form validators become injectable services. | ✓ |
| Logic-only services everywhere, templates stay in the parent modal | All extracted concerns become services with no new templates; modal HTML stays mostly as-is. | |

**User's choice:** Presentational sub-components for UI-heavy concerns, services for pure logic (recommended option)
**Notes:** None.

---

## attachment-preview: Rendering/Interaction vs. Selection State

| Option | Description | Selected |
|--------|-------------|----------|
| Rendering+hit-testing together, separate from state | One concern owns the canvas: drawing (render*) AND coordinate-based hit-testing since both need the same pixel-space math. Selected/hovered point IDs stay as @Input()s from the parent. | ✓ |
| Rendering separate from interaction (click/hover) separate from state | Three-way split: pure drawing engine, separate interaction/hit-testing layer, inputs stay as-is. More granular but duplicates coordinate math. | |

**User's choice:** Rendering+hit-testing together, separate from state (recommended option)
**Notes:** None.

---

## Risk Mitigation for attachment-edit-modal (No Existing Tests)

| Option | Description | Selected |
|--------|-------------|----------|
| Decompose now, rely on manual verification; real tests land in Phase 5 | Stays true to the roadmap's phase split and avoids scope creep into Phase 5's job. Risk mitigated by careful behavior-preserving extraction and manual QA, not automated coverage. | ✓ |
| Add a minimal smoke-test spec before refactoring | Write a lightweight spec as a temporary safety net before decomposing, even though full coverage is Phase 5's job. | |

**User's choice:** Decompose now, rely on manual verification; real tests land in Phase 5 (recommended option)
**Notes:** Confirmed via `ls` that `attachment-edit-modal` directory has no `.spec.ts` file, corroborating CONCERNS.md's "Missing Tests" finding.

---

## Claude's Discretion

- Exact file/directory naming for new sub-components and services (defer to CONVENTIONS.md patterns).
- Whether shared extracted pieces live in a new shared directory vs. co-located with one consuming modal.
- The ~400-line target is treated as a guideline, not a hard enforcement threshold.

## Deferred Ideas

- Automated test coverage for `attachment-edit-modal` — belongs to Phase 5 (TEST-01).
- PointerCapture-based rework of document-level drag listeners — belongs to Phase 3 (RACE-03).
- Web Worker offload of image cropping/compression — belongs to Phase 4 (PERF-03).

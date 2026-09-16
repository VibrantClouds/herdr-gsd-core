---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Measurement Ruler
current_phase: 7
current_phase_name: Coordinate & Scale Correctness Foundations
status: planning
stopped_at: Phase 7 context gathered
last_updated: "2026-09-16T02:29:12.044Z"
last_activity: 2026-09-15
last_activity_desc: v1.1 roadmap created (Phases 7-12, 31/31 requirements mapped)
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-09-08 after v1.0 milestone completion)

**Core value:** Show true-size scale — height in feet and inches, not pixel measurements — for any two objects side by side, including attachments at pixel-perfect points.
**Current focus:** v1.1 Measurement Ruler — a ruler placed on any rendered model or overlay reports the true size of a span, and reconstructs identically from a share link on any screen size. 6 phases (7-12), 31 requirements, all mapped.

**Shipped:** v1.0 Code Health & Hardening (2026-09-08) — 6 phases, 48 plans, 21/21 requirements. See `.planning/MILESTONES.md` and `.planning/RETROSPECTIVE.md`.

## Current Position

Phase: 7 — Coordinate & Scale Correctness Foundations (not started)
Plan: —
Status: Ready to plan
Last activity: 2026-09-15 — v1.1 roadmap created (Phases 7-12, 31/31 requirements mapped)

Progress: [░░░░░░░░░░] 0% (0 of 6 v1.1 phases complete)

**Next action:** `/gsd-plan-phase 7`

Phase 7 is a prerequisite, not ruler work: it fixes the `toOriginalCoords()` transform bug and the
`scaleRelativeToParent` divergence between the DOM and Canvas renderers, and builds the state-only
measurement math. It must land before any ruler placement UI. Phase 8 (ruler state + serialization)
is independent of Phase 7 and could be planned in parallel if desired.

## Performance Metrics

**Velocity:**

- Total plans completed: 48
- Average duration: - min
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 9 | - | - |
| 02 | 5 | - | - |
| 03 | 8 | - | - |
| 04 | 10 | - | - |
| 05 | 13 | - | - |
| 06 | 3 | - | - |

**Recent Trend:**

- Last 5 plans: -
- Trend: -

*Updated after each plan completion*

## Accumulated Context

### Decisions

All v1.0 decisions are logged with outcomes in PROJECT.md's Key Decisions table (14 entries,
all audited at milestone close). Milestone-scoped decisions that have now **lapsed** and should
not constrain the next milestone:

- "Refactors are behavior-preserving except race-condition fixes" — v1.0 hardening constraint only.
- "Hardening-only; exclude the 4 net-new features" — those are now `FEAT-01..04` candidates.

Decisions that **carry forward** as standing conventions are recorded in
`.planning/RETROSPECTIVE.md` → Patterns Established.

**v1.1 decisions already settled with the project owner at roadmap time — do not re-open these as
phase-level questions:**

| Decision | Rationale |
|----------|-----------|
| The ruler NEVER writes model size | Base size stays an upload-time concern; the scale slider stays the resize control. A viewport ruler only ever reports (TARGET-04). This was the central correction during milestone scoping. |
| Orphaned rulers are pruned with their target (cascade-delete) | An orphan whose endpoints live in a departed target's pixel space is meaningless; there is no reassign-to-base fallback that preserves meaning. Tolerate-and-hide was rejected. |
| Hit-test ties resolve to the topmost visible layer | Matches reference tools and needs no picker UI. Accepted tradeoff: no way to deliberately measure a model underneath an overlay. |
| Ruler creation uses an explicit armed place-ruler mode | The viewport already owns drag-to-pan; inferring creation from an ordinary drag would make panning create rulers. |
| A minimal ruler list IS in scope for v1.1 (Phase 10) | Research called it deferrable; overridden. Two or more rulers are unmanageable without it. Reuses `OverlayControlsComponent`'s row pattern. |
| The Canvas renderer's `scaleRelativeToParent` omission is fixed in this milestone | Fixed in Phase 7 via the shared `ScalingService` helper, since the ruler cannot copy either renderer's formula verbatim and this phase is already at that seam. |
| Readout is whole units only | The calibration chain (eyeballed line, typed whole-number height, quantized slider) is ±a few percent; decimals manufacture confidence the pipeline cannot support. First-class requirement (RULER-06), not polish. |

### Pending Todos

- **Open investigation, owned by Phase 7 (RENDER-03):** measure whether the DOM renderer's stored
  `effectiveBaseScale` (`scale × relativeScale`) is always numerically equal to the Canvas renderer's
  raw `scale` parameter. If they differ, the two renderers diverge even when `scaleRelativeToParent`
  is true, and the RENDER-03 fix is larger than swapping in one helper. Measure against real values
  before sizing the fix; do not assume equality.

### Blockers/Concerns

Carried into the next milestone (all pre-existing, none blocking the v1.0 close):

- ⚠️ Panel positions are not recomputed on viewport resize across the side-by-side ↔ overlap breakpoint: `compare-modal.component.ts:662` `runDefaultPositionsCalc()` reads a stale `canvasDimensions`, and `onCanvasResize` only re-runs the calc when `pendingDefaultPositionsRecalc` is set — which happens only on the `height<=0` path, so a width-only change never recomputes. **Pre-existing, from Phase 3 commit `47af8fc`** (proved against the pre-Phase-5 `image-display` at `e610eb5`). Best candidate for an early fix next milestone.
- ⚠️ The `Elf` model is broken — `/assets/models/Elf.png` 404s while `src/assets/metadata/Elf.json` exists, so selecting Elf renders no image. Confirmed by the user during Phase 5 UAT. Asset gap, not a code defect.
- ✅ Environment drift **RESOLVED** (verified 2026-09-15 against `node_modules/`, not inferred): the whole Angular tree is on the declared versions — `@angular/core`/`common`/`forms`/`router`/`compiler`/`platform-browser` all `20.3.17`, `@angular/cli` and `@angular-devkit/build-angular` `20.3.19`, TypeScript `5.9.3`. The carried-forward `19.2.18` note was stale. No `pnpm install` gate on Phase 7. Recorded rather than deleted so the v1.0 deferral rationale stays auditable.
- ⚠️ Three `new ResizeObserver` sites remain outside the shared `ResizeObserverService` (`compare-modal` ×2, `attachment-preview` ×1) — explicitly out of scope per Phase 4 D-06, not a regression.
- ✅ `.planning/codebase/` staleness is now **scoped work**, not a loose concern: MAP-01/MAP-02 are owned by Phase 12, deliberately scheduled last so the re-mapped docs describe finished v1.1 source. v1.1 phases use `.planning/research/ARCHITECTURE.md` and `PITFALLS.md` (2026-09-15, source-verified) as their structural input in the meantime.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260908-u0d | Fix adult-mode dick attachment offsets: move default attachment-point on Male Human to (850,1435) and Male Furry to (910,1465) so Human/Canine Dick attachments sit at the crotch | 2026-09-08 | 7f49f1d | [260908-u0d-fix-adult-mode-dick-attachment-offsets-m](./quick/260908-u0d-fix-adult-mode-dick-attachment-offsets-m/) |

## Deferred Items

Carried forward from v1.0 close. Full detail in `.planning/milestones/v1.0-REQUIREMENTS.md` (v2 section).

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Feature | Undo/redo (FEAT-01) | Deferred to v2 | v1.0 start |
| Feature | Model search/filter (FEAT-02) | Deferred to v2 | v1.0 start |
| Feature | Attachment import/export (FEAT-03) | Deferred to v2 | v1.0 start |
| Feature | Concurrent-edit conflict resolution (FEAT-04) | Deferred to v2 | v1.0 start |
| Test | `indexeddb-user-model.service.ts` unit spec (TESTV2-01) | Promoted to v2 | Phase 5 (D-15) |
| Test | `state-management.service.ts` unit spec (TESTV2-02) | Promoted to v2 | Phase 5 (D-15) |
| Test | Dropdown re-fire regression test (TESTV2-03) | Promoted to v2 | Phase 5 (D-15) |
| Test | `attachment-canvas-renderer.service.ts` render helpers, 41% stmt (TESTV2-04) | Promoted to v2 | Phase 5 (D-15) |
| Test | `upload-image-pipeline.service.ts` worker-dispatch branches, 57% branch (TESTV2-05) | Promoted to v2 | Phase 5 (D-15) |

Backend-owned items (server-side share-link rate limiting, upload enforcement, age gate, share-link
TTL/GC) remain out of scope — they live in the Cloudflare Worker repo. See `.claude/rules/security.md`.

## Session Continuity

Last session: 2026-09-16T02:29:12.036Z
Stopped at: Phase 7 context gathered
Resume file: .planning/phases/07-coordinate-scale-correctness-foundations/07-CONTEXT.md

## Operator Next Steps

1. `/gsd-plan-phase 7` — Coordinate & Scale Correctness Foundations (the prerequisite that gates all ruler placement work).
2. Phase 8 (ruler state + serialization) is independent of Phase 7 and can be planned in parallel if you want two fronts open.
3. Phases 9, 10 and 11 are flagged as UI phases in ROADMAP.md — consider `/gsd-ui-phase` before planning each.

---
phase: 01-component-decomposition
plan: 02
subsystem: ui
tags: [angular, rxjs, refactor, coordinate-math, forms]

# Dependency graph
requires:
  - phase: 01-component-decomposition (plan 01)
    provides: Wave 0 baseline + test-infra fix that unblocked full-suite regression detection
provides:
  - "src/app/utils/coordinate-transform.ts — single source for display-px <-> original-image-px scaling"
  - "MeasurementRulerService — form-agnostic ruler drag lifecycle + pixel-length math"
  - "AttachmentPointDefinitionService — form-agnostic click-to-place coordinate resolution"
affects: [01-03, 01-04, 01-05, 01-06, 01-07 (upload-modal/attachment-edit-modal thinning waves)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Form-agnostic shared service: emits plain value objects (MeasurementLine, {x,y}) via Subject/return value; never imports @angular/forms or touches a parent FormGroup"
    - "Document-level drag-listener lifecycle relocated verbatim (bound handler refs, add on start, remove all four types on stopDragDefensively) — no PointerCapture rework (that's Phase 3/RACE-03)"

key-files:
  created:
    - src/app/utils/coordinate-transform.ts
    - src/app/utils/coordinate-transform.spec.ts
    - src/app/services/measurement-ruler.service.ts
    - src/app/services/measurement-ruler.service.spec.ts
    - src/app/services/attachment-point-definition.service.ts
    - src/app/services/attachment-point-definition.service.spec.ts
  modified: []

key-decisions:
  - "resolvePlacement() internally gates on isDefining (mirrors upload-modal's onImageClick guard) rather than leaving that check to callers, so the service fully encapsulates the original click-to-place behavior including the isDefining=false side effect on success only"
  - "MeasurementRulerService exposes an isDragging getter (not in the plan's explicit member list) for future consumer components to drive UI state without duplicating drag-state tracking"

patterns-established:
  - "Shared stateful service, form-agnostic output: providedIn:'root' service holds drag-in-progress state, exposes changes via Subject/return values only — parent modals own their own FormGroup writes"

requirements-completed: [DECOMP-01, DECOMP-02]

coverage:
  - id: D1
    description: "coordinate-transform.ts exports toOriginalCoords/clampToNatural/displayFromOriginal as the single shared source for the naturalWidth/width scaling formula"
    requirement: "DECOMP-01"
    verification:
      - kind: unit
        ref: "src/app/utils/coordinate-transform.spec.ts (11 specs: scaling ratio, rounding, rect-offset, in/out-of-bounds flag, clamp edges, displayFromOriginal)"
        status: pass
    human_judgment: false
  - id: D2
    description: "MeasurementRulerService holds ruler drag lifecycle + pixel-length math, emits MeasurementLine via lineChanged$, cleans up all four listener types, never touches a form"
    requirement: "DECOMP-01"
    verification:
      - kind: unit
        ref: "src/app/services/measurement-ruler.service.spec.ts (13 specs: pixel-length, presets, isDefaultVerticalRuler, idempotent + full-cleanup stopDragDefensively, drag-move emission lifecycle)"
        status: pass
    human_judgment: false
  - id: D3
    description: "AttachmentPointDefinitionService returns raw {x,y} original-image-space coordinates only, never an AttachmentPoint; preserves out-of-bounds rejection (no clamp) and isDefining toggle"
    requirement: "DECOMP-02"
    verification:
      - kind: unit
        ref: "src/app/services/attachment-point-definition.service.spec.ts (9 specs: isDefining toggle, in-bounds placement, out-of-bounds null/no-clamp, no id/name field on return)"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-07-06
status: complete
---

# Phase 01 Plan 02: Shared Coordinate/Ruler/Attachment-Point Services Summary

**Extracted the display-px <-> original-image-px coordinate transform (used 3x near-identically across upload-modal) into one shared util, plus two form-agnostic injectable services (MeasurementRulerService, AttachmentPointDefinitionService) that Waves 3-4 will wire into the thinned upload-modal and attachment-edit-modal shells.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-07-06T22:41:00Z (approx, worktree init)
- **Completed:** 2026-07-06T23:06:12Z
- **Tasks:** 3 (all `type="auto" tdd="true"`)
- **Files modified:** 6 (all new)

## Accomplishments
- `src/app/utils/coordinate-transform.ts` — `toOriginalCoords`, `clampToNatural`, `displayFromOriginal`, consolidating the `naturalWidth/width` scaling formula that was previously inlined 3x across `upload-modal.component.ts` (ruler move handler, attachment-point click handler, SVG marker positioning)
- `MeasurementRulerService` (`providedIn: 'root'`) — relocates the ruler drag lifecycle (mousedown/touchstart/move/end with all-four-listener cleanup), `computePixelLength`, `presetLine` (vertical/horizontal/diagonal), and `isDefaultVerticalRuler` verbatim from `upload-modal.component.ts`; emits `MeasurementLine` via `lineChanged$`, never touches a `FormGroup`
- `AttachmentPointDefinitionService` (`providedIn: 'root'`) — relocates the click-to-place coordinate math from `upload-modal.component.ts`'s `onImageClick`, stopping at raw `{x, y}`; preserves the out-of-bounds rejection (return null, no clamp) exactly, leaving `AttachmentPoint` construction (id/name/type, which differs per `editType` in `attachment-edit-modal`) to each parent modal

## Task Commits

Each task followed RED → GREEN (TDD, no REFACTOR step needed — implementations were correct on first pass):

1. **Task 1: coordinate-transform util** — test `c859f2e` (RED) → feat `38c0237` (GREEN)
2. **Task 2: MeasurementRulerService** — test `836d80f` (RED) → feat `11baae2` (GREEN)
3. **Task 3: AttachmentPointDefinitionService** — test `56f5079` (RED) → feat `8e4322e` (GREEN)

**Plan metadata:** committed alongside this SUMMARY (see final commit in worktree).

## Files Created/Modified
- `src/app/utils/coordinate-transform.ts` - `toOriginalCoords`/`clampToNatural`/`displayFromOriginal`, pure functions operating on an `HTMLImageElement`'s `getBoundingClientRect()`/natural-vs-display dimensions
- `src/app/utils/coordinate-transform.spec.ts` - 11 specs covering scaling ratio, rounding, rect-offset, in/out-of-bounds flag, both clamp edges, and the display-from-original conversion
- `src/app/services/measurement-ruler.service.ts` - `MeasurementRulerService` — `startDrag`, `stopDragDefensively`, `computePixelLength`, `presetLine`, `isDefaultVerticalRuler`, `lineChanged$` observable, `isDragging` getter
- `src/app/services/measurement-ruler.service.spec.ts` - 13 specs covering pixel-length math, all three presets, `isDefaultVerticalRuler` true/false, idempotent + full (all-four-type) `stopDragDefensively`, and the drag-move-emit lifecycle via dispatched `mousemove` events
- `src/app/services/attachment-point-definition.service.ts` - `AttachmentPointDefinitionService` — `startDefining`, `cancelDefining`, `isDefining` getter, `resolvePlacement(clientX, clientY, imageEl): {x,y} | null`
- `src/app/services/attachment-point-definition.service.spec.ts` - 9 specs covering the `isDefining` toggle, in-bounds placement (rounded `{x,y}`), out-of-bounds rejection (null, no clamp, `isDefining` stays true for retry), and that the return value never carries an `id`/`name` field

## Public API Signatures (for Waves 3-4 wiring)

```typescript
// src/app/utils/coordinate-transform.ts
export interface OriginalCoords { x: number; y: number; inDisplayBounds: boolean; }
export interface Point { x: number; y: number; }
export function toOriginalCoords(clientX: number, clientY: number, imageEl: HTMLImageElement): OriginalCoords;
export function clampToNatural(x: number, y: number, imageEl: HTMLImageElement): Point;
export function displayFromOriginal(originalX: number, originalY: number, imageEl: HTMLImageElement): Point;

// src/app/services/measurement-ruler.service.ts
export type RulerPreset = 'vertical' | 'horizontal' | 'diagonal';
export type RulerDragPoint = 'start' | 'end';
@Injectable({ providedIn: 'root' })
export class MeasurementRulerService {
  lineChanged$: Observable<MeasurementLine>;
  get isDragging(): RulerDragPoint | null;
  startDrag(point: RulerDragPoint, imageEl: HTMLImageElement, line: MeasurementLine): void;
  stopDragDefensively(): void; // idempotent; every consumer's ngOnDestroy MUST call this
  computePixelLength(line: MeasurementLine | null): number;
  presetLine(preset: RulerPreset, imageEl: HTMLImageElement): MeasurementLine;
  isDefaultVerticalRuler(line: MeasurementLine | null, dimensions: { width: number; height: number }): boolean;
}

// src/app/services/attachment-point-definition.service.ts
@Injectable({ providedIn: 'root' })
export class AttachmentPointDefinitionService {
  get isDefining(): boolean;
  startDefining(): void;
  cancelDefining(): void;
  resolvePlacement(clientX: number, clientY: number, imageEl: HTMLImageElement): { x: number; y: number } | null;
}
```

## Decisions Made
- `resolvePlacement()` internally checks `isDefining` before doing coordinate math (mirroring upload-modal's `if (!this.isDefiningAttachmentPoint...) return;` guard) rather than requiring the caller to check it externally — this fully encapsulates the original behavior, including clearing `isDefining` only on a successful in-bounds placement (an out-of-bounds click leaves `isDefining` true so the user can retry, matching the original's early-return-without-reset).
- Added a public `isDragging` getter on `MeasurementRulerService` beyond the plan's explicitly-listed members — a low-risk addition (read-only, no form coupling) that lets future presentational sub-components (Wave 3) query drag state without the service having to duplicate tracking elsewhere.

## Deviations from Plan

None - plan executed exactly as written. All three services/util match the plan's specified behavior, signatures, and threat-model mitigations (bounds clamp for ruler, out-of-bounds rejection for point placement, both preserved verbatim).

## Issues Encountered
- No system-installed Chrome/Chromium; resolved by pointing `CHROME_BIN` at a local Playwright-managed Chromium binary (`~/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome`), consistent with the environment workaround already documented in `01-BASELINE.md` from Wave 0.
- Ran the full suite (`pnpm exec ng test --watch=false --browsers=ChromeHeadless`, no `--include` filter) to confirm no regressions: 289 total specs (256 baseline + 33 new from this plan), 237 passing, 52 failing — the 52 failures exactly match the pre-existing baseline documented in `01-BASELINE.md`/`deferred-items.md` (HttpClient DI-wiring gaps + the known `UploadModalComponent` DI-mock mismatch), confirming zero regressions were introduced. All 33 new specs from this plan pass (204 baseline-passing + 33 = 237).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- The three shared pieces (`coordinate-transform.ts`, `MeasurementRulerService`, `AttachmentPointDefinitionService`) are ready for Waves 3-4 to wire into presentational sub-components and the thinned `upload-modal`/`attachment-edit-modal` shells, per `01-PATTERNS.md`'s recommended structure (`measurement-ruler`, `attachment-point-picker` components).
- No blockers. The pre-existing 52-failure full-suite baseline and the known `upload-modal.component.spec.ts` DI-mock mismatch (Phase 5 scope) remain unchanged and out of this plan's scope, as documented in `01-BASELINE.md`.

---
*Phase: 01-component-decomposition*
*Completed: 2026-07-06*

## Self-Check: PASSED

All 6 created files verified present on disk; all 7 commits (3 test/RED, 3 feat/GREEN, 1 docs/SUMMARY) verified present in `git log --oneline --all`.

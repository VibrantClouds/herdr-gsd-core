---
phase: 01-component-decomposition
plan: 04
subsystem: ui
tags: [angular, standalone-components, presentational, ruler, attachment-point]

# Dependency graph
requires:
  - phase: 01-component-decomposition (plan 02)
    provides: "coordinate-transform.ts, MeasurementRulerService, AttachmentPointDefinitionService — the form-agnostic services these components delegate to"
provides:
  - "MeasurementRulerComponent — shared presentational ruler (SVG line + draggable endpoints + presets + optional directional decoration)"
  - "AttachmentPointPickerComponent — shared presentational crosshair click-to-place picker (marker + toggle + ng-content projection slot)"
affects: [01-06, 01-07 (upload-modal/attachment-edit-modal thinning waves that embed these components)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Presentational sub-component over a Plan 02 service: component owns template/scss, takes current value via @Input, delegates mutation math to the injected service, and re-emits the service's plain value object via @Output — never patches a parent FormGroup"
    - "ng-content marker projection: a shared component renders the base marker element and lets the parent project additional decoration into it without the shared component knowing the parent's domain concerns"

key-files:
  created:
    - src/app/components/measurement-ruler/measurement-ruler.component.ts
    - src/app/components/measurement-ruler/measurement-ruler.component.html
    - src/app/components/measurement-ruler/measurement-ruler.component.scss
    - src/app/components/measurement-ruler/measurement-ruler.component.spec.ts
    - src/app/components/attachment-point-picker/attachment-point-picker.component.ts
    - src/app/components/attachment-point-picker/attachment-point-picker.component.html
    - src/app/components/attachment-point-picker/attachment-point-picker.component.scss
    - src/app/components/attachment-point-picker/attachment-point-picker.component.spec.ts
  modified: []

key-decisions:
  - "MeasurementRulerComponent owns no internal MeasurementLine state — it takes `line` as an @Input and re-emits every mutation (drag move, preset click, flip) via `lineChange`; the parent is the single source of truth and passes the updated value back down, matching the plan's 'parent stores its own measurementLine' key link"
  - "Added a void `flip` output alongside the `lineChange` swap-emission (plan allowed this as optional) so parents that want to react to a flip specifically (e.g. analytics) don't have to diff line values"
  - "AttachmentPointPickerComponent syncs the injected AttachmentPointDefinitionService's internal isDefining flag from the @Input via ngOnChanges (calling startDefining()/cancelDefining()), so resolvePlacement() works correctly regardless of how the parent toggles the isDefining input, not just via the component's own toggle button"
  - "Did not relocate the .defining-attachment-point cursor rule onto the picker's marker/image-wrapper context 1:1 from upload-modal — instead applied it to the picker's own absolutely-positioned overlay root div, since the picker does not own the <img> element or its wrapping .image-wrapper (that stays with the parent modal in Wave 4 wiring)"
  - "Left penetration-zone/server-point marker color variants and the angle-arrow SVG entirely out of the picker (both markup and SCSS) — those are attachment-edit-modal-specific and will be supplied via the <ng-content> projection slot in Wave 4 (Plan 07), keeping this component free of editType/penetration knowledge per D-01 and the threat model's T-01-01 disposition"

requirements-completed: [DECOMP-01, DECOMP-02]

coverage:
  - id: D4
    description: "MeasurementRulerComponent renders base ruler SVG (line+endpoints+presets) always, and the directional arrow/inline-chevron/flip decoration only when showDirection=true; delegates drag to MeasurementRulerService and cleans up on destroy"
    requirement: "DECOMP-01"
    verification:
      - kind: unit
        ref: "src/app/components/measurement-ruler/measurement-ruler.component.spec.ts (10 specs: create, showDirection true/false markup toggle, service lineChanged$ -> lineChange emission, startDrag delegation, preset emission, flip emission, ngOnDestroy -> stopDragDefensively spy)"
        status: pass
    human_judgment: false
  - id: D5
    description: "AttachmentPointPickerComponent emits raw {x,y} on in-bounds click (rejects out-of-bounds), exposes a define/cancel toggle, and projects parent decoration via ng-content without leaking penetration/editType concerns"
    requirement: "DECOMP-02"
    verification:
      - kind: unit
        ref: "src/app/components/attachment-point-picker/attachment-point-picker.component.spec.ts (5 specs: create, in-bounds click -> pointPlaced {x,y}, out-of-bounds -> no emit, toggle -> definingChange, ng-content projection renders)"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-07-06
status: complete
---

# Phase 01 Plan 04: Shared Ruler & Attachment-Point-Picker Components Summary

**Created two shared, form-agnostic presentational components — `MeasurementRulerComponent` (ruler SVG + draggable endpoints + presets, with an opt-in directional-decoration mode) and `AttachmentPointPickerComponent` (crosshair click-to-place overlay + marker + define/cancel toggle) — that both `upload-modal` and `attachment-edit-modal` will embed in Wave 4.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-07-06T23:12:28Z (worktree init)
- **Completed:** 2026-07-06T23:23:15Z
- **Tasks:** 2 (both `type="auto"`, no `tdd="true"` flag — plan-level TDD gate not active for this plan)
- **Files modified:** 8 (all new)

## Accomplishments

- `MeasurementRulerComponent` (`src/app/components/measurement-ruler/`) — standalone component wrapping `MeasurementRulerService` (Plan 02). Renders the base ruler SVG (dashed line + two draggable circular endpoints) and the preset-buttons row (`Full Height`/`Full Width`/`Diagonal`) always; renders the edit-modal-only directional arrow, three inline chevrons, and a `Flip Direction` button only when `@Input() showDirection` is `true`. Subscribes to the service's `lineChanged$` and re-emits every update via `@Output() lineChange`; `ngOnDestroy` calls `MeasurementRulerService.stopDragDefensively()`.
- `AttachmentPointPickerComponent` (`src/app/components/attachment-point-picker/`) — standalone component wrapping `AttachmentPointDefinitionService` (Plan 02). Renders the crosshair-overlay click target (only while `@Input() isDefining` is true), the base circular marker (positioned via `displayFromOriginal` from `coordinate-transform.ts`) with an `<ng-content>` slot inside it, and a define/cancel toggle button (only while `@Input() canDefine` is true). Emits raw `{x, y}` via `@Output() pointPlaced` only on a successful in-bounds click (the service's out-of-bounds rejection is preserved verbatim — no clamp); emits `@Output() definingChange` from the toggle button and from a successful placement.
- Both components use decorator `@Input()`/`@Output()` (D-02) — confirmed via the plan's required greps (`input.required|= input<|= output<` returns 0 in both files) — and neither imports `@angular/forms`.
- Both components implement `OnDestroy` and clean up their respective Plan 02 service state: the ruler calls `stopDragDefensively()` (removes all four drag-listener types); the picker calls `cancelDefining()` (resets the shared singleton's `isDefining` flag so it never survives past this component's teardown).

## Task Commits

1. **Task 1: MeasurementRulerComponent** — `7c8909a` (`feat(01-04): create shared MeasurementRulerComponent`)
2. **Task 2: AttachmentPointPickerComponent** — `6b57061` (`feat(01-04): create shared AttachmentPointPickerComponent`)

No RED/GREEN split — neither task carries `tdd="true"` in the plan frontmatter, so each was implemented and verified as a single commit per the plan's `type="auto"` task type.

## Files Created/Modified

- `src/app/components/measurement-ruler/measurement-ruler.component.ts` - `MeasurementRulerComponent`; inputs `imageElement` (required), `line`, `showDirection`; outputs `lineChange`, `flip`; injects `MeasurementRulerService`
- `src/app/components/measurement-ruler/measurement-ruler.component.html` - base ruler SVG + optional `@if (showDirection)` arrow/chevron/flip-button block + ruler-info/presets row
- `src/app/components/measurement-ruler/measurement-ruler.component.scss` - relocated `.measurement-ruler-overlay`/`.ruler-line`/`.ruler-point`/`.ruler-arrow`/`.ruler-chevron`/`.ruler-info`/`.ruler-hint`/`.ruler-presets`/`.flip-direction-btn` + mobile media-query overrides; `:host { display: contents; }`
- `src/app/components/measurement-ruler/measurement-ruler.component.spec.ts` - 10 specs: create; showDirection true/false toggles arrow/chevron/flip markup; service `lineChanged$` emission during a drag triggers `lineChange`; `onRulerPointMouseDown` delegates to `rulerService.startDrag`; `applyPreset` emits the service-computed preset line; `onFlip` emits a swapped line and the `flip` event; `ngOnDestroy` calls `stopDragDefensively` (spy)
- `src/app/components/attachment-point-picker/attachment-point-picker.component.ts` - `AttachmentPointPickerComponent`; inputs `imageElement` (required), `point`, `isDefining`, `canDefine`; outputs `pointPlaced`, `definingChange`; injects `AttachmentPointDefinitionService`; syncs the service's `isDefining` from the input via `ngOnChanges`
- `src/app/components/attachment-point-picker/attachment-point-picker.component.html` - crosshair-overlay (click-to-place) + marker with `<ng-content>` slot + define/cancel toggle button
- `src/app/components/attachment-point-picker/attachment-point-picker.component.scss` - relocated `.attachment-point-indicator`/`.crosshair-overlay`/`.define-attachment-btn` + a picker-owned `.defining-attachment-point` cursor rule on the component's own overlay root; `:host { display: contents; }`
- `src/app/components/attachment-point-picker/attachment-point-picker.component.spec.ts` - 5 specs via a test-host wrapper component: create; in-bounds crosshair click emits rounded `{x,y}`; out-of-bounds click emits nothing; define-toggle click emits `definingChange`; projected `<ng-content>` renders inside the marker

## Public API Signatures (for Waves 06/07 wiring)

```typescript
// src/app/components/measurement-ruler/measurement-ruler.component.ts
@Component({ selector: 'app-measurement-ruler', standalone: true })
export class MeasurementRulerComponent implements OnDestroy {
  @Input({ required: true }) imageElement!: HTMLImageElement | null;
  @Input() line: MeasurementLine | null = null;
  @Input() showDirection = false;
  @Output() lineChange = new EventEmitter<MeasurementLine>();
  @Output() flip = new EventEmitter<void>(); // fires alongside a flip-triggered lineChange
}

// src/app/components/attachment-point-picker/attachment-point-picker.component.ts
@Component({ selector: 'app-attachment-point-picker', standalone: true })
export class AttachmentPointPickerComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) imageElement!: HTMLImageElement | null;
  @Input() point: { x: number; y: number } | null = null;
  @Input() isDefining = false;
  @Input() canDefine = false;
  @Output() pointPlaced = new EventEmitter<{ x: number; y: number }>();
  @Output() definingChange = new EventEmitter<boolean>();
  // <ng-content> renders inside the .attachment-point-indicator marker div —
  // parents project their own decoration there (e.g. a direction-indicator SVG).
}
```

## ng-content Contract (AttachmentPointPickerComponent)

- The projected content is placed **inside** `.attachment-point-indicator` (the marker div), which is itself absolutely positioned via `transform: translate(-50%, -50%)` at the display-space coordinates of `point`.
- Projected content should use its own `position: absolute` + `transform: translate(-50%, -50%)` (or similar) if it needs to be centered independently of the 16px red dot — the picker does not resize or reposition projected content beyond placing it inside the marker's DOM position.
- The picker's marker itself is NOT swappable/hideable by the parent — only additive decoration via projection. If a Wave 4 consumer needs a different marker color (e.g. edit-modal's `.penetration-zone`/`.server-point` variants), that styling must be supplied by the parent's own CSS (e.g. targeting `app-attachment-point-picker .attachment-point-indicator` from the parent's stylesheet, or the parent projects an opaque covering element) — this plan intentionally left those variants and the penetration angle-arrow SVG out of the shared component (see Deviations).

## Decisions Made

- `MeasurementRulerComponent` holds no internal `MeasurementLine` state; it is a pure pass-through over its `@Input() line`, re-emitting every mutation (drag move via the service, preset click, flip) through `lineChange`. This matches the plan's key link ("parent stores its own measurementLine") and keeps the component stateless with respect to the line value itself.
- Added a `flip` void output in addition to `lineChange` on flip, since the plan explicitly allowed this ("plus `@Output() flip = new EventEmitter<void>()` if flip is surfaced"). Parents can ignore it and rely solely on `lineChange`, or use it for side effects that shouldn't fire on every drag-driven `lineChange` (e.g. an analytics event specifically for "user flipped the ruler").
- `AttachmentPointPickerComponent` syncs `AttachmentPointDefinitionService.isDefining` from the `@Input() isDefining` via `ngOnChanges` (calling `startDefining()`/`cancelDefining()`), not only from its own toggle button. This ensures `resolvePlacement()` behaves correctly even if a parent drives `isDefining` through some other UI path in Wave 4, rather than coupling correctness to "the user must click this component's own button."
- Deliberately did NOT relocate the edit-modal's penetration-zone marker color variants (`.penetration-zone`, `.server-point`) or the angle-arrow SVG (`.angle-arrow-indicator` + the `isPenetrationZoneChecked` conditional) into the shared picker. The task's acceptance criteria required zero occurrences of `penetration|editType|isPenetrationZone` in the component file, and the plan's `<ng-content>` slot is the explicitly-designed extension point for exactly this kind of parent-specific decoration — Wave 4 (Plan 07) will supply that content when wiring `attachment-edit-modal`.

## Deviations from Plan

**1. [Rule 1 - Doc-comment grep false positive] Reworded AttachmentPointPickerComponent's class JSDoc to avoid the words "penetration"/"editType"**
- **Found during:** Task 2, running the acceptance-criteria grep
- **Issue:** The initial JSDoc explaining the `<ng-content>` design rationale mentioned "penetration zones" and "penetration-angle arrow" as illustrative examples, which made `grep -cE "penetration|editType|isPenetrationZone" attachment-point-picker.component.ts` return 2 instead of the required 0 — even though no actual penetration/editType *logic* existed in the file.
- **Fix:** Reworded the comment to describe the same design intent ("a parent-specific decoration... project their own content into the marker") without naming penetration zones specifically.
- **Files modified:** `src/app/components/attachment-point-picker/attachment-point-picker.component.ts`
- **Commit:** `6b57061` (included in the task's original commit, fixed before committing)

No other deviations — both components match the plan's specified inputs/outputs, delegate to the Plan 02 services as specified, and satisfy every listed acceptance-criteria grep.

## Issues Encountered

- No system-installed Chrome/Chromium in this worktree; resolved the same way as Plan 02 by pointing `CHROME_BIN` at the local Playwright-managed Chromium binary (`~/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome`).
- This worktree has no local `node_modules` (Node's module resolution walks up to the main repo's `node_modules`, which is how `pnpm exec ng test` succeeded); the `tsc`/`ng` binaries are not present in the worktree's own `node_modules/.bin` for `pnpm exec` to find directly. Worked around by invoking `node <path-to-main-repo-node_modules>/typescript/bin/tsc --noEmit -p tsconfig.app.json` from the worktree's cwd (relative paths still resolve correctly since only the binary is looked up externally) — zero type errors reported.
- Ran the full suite (`pnpm exec ng test --watch=false --browsers=ChromeHeadless`, no `--include` filter) to confirm no regressions: 330 total specs, 278 passing, 52 failing. The 52 failures are the exact same test names as the documented pre-existing baseline (`AttachmentSidebarComponent` slider-settings specs, `CategoryDropdownComponent should create`, `CompareModalComponent` flip/on-top-toggle/buffer/relative-scale specs, `ComparisonPanelComponent` size-slider integration specs, `ImageDisplayComponent` overlay/scaling specs, `ManageModalComponent` specs, `SizeSliderComponent` measurement-formatting specs, `StateExportService` specs, `UploadModalComponent` specs) — none reference `MeasurementRulerComponent` or `AttachmentPointPickerComponent`, confirming zero regressions from this plan's changes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Both shared components are ready for Wave 4 (Plans 06/07) to embed into the thinned `upload-modal` and `attachment-edit-modal` shells per `01-PATTERNS.md`.
- The `<ng-content>` contract documented above tells Plan 07 exactly how to project the edit-modal's penetration-angle-arrow decoration into the picker's marker without modifying this component.
- No blockers. The pre-existing 52-failure full-suite baseline remains unchanged and out of this plan's scope.

---
*Phase: 01-component-decomposition*
*Completed: 2026-07-06*

## Self-Check: PASSED

All 8 created files verified present on disk; both commits (`7c8909a` feat MeasurementRulerComponent, `6b57061` feat AttachmentPointPickerComponent) verified present in `git log --oneline --all`.

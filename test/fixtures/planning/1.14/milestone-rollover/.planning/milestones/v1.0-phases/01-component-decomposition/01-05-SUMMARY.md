---
phase: 01-component-decomposition
plan: 05
subsystem: ui
tags: [angular, canvas, attachment-preview, refactor, decomposition]

# Dependency graph
requires:
  - phase: 01-component-decomposition
    provides: "AttachmentCanvasRendererService (01-03) with render(params)/hitTest/hoverTest and the AttachmentCanvasRenderParams contract"
provides:
  - "attachment-preview.component.ts thinned to an orchestration shell (384 lines, down from ~856) delegating all Canvas drawing + hit-test geometry to AttachmentCanvasRendererService"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shell builds one AttachmentCanvasRenderParams object per renderPreview() call from its own @Input()s/local state and passes it to the injected renderer service — no drawing logic remains on the component"
    - "Shell subscribes to the renderer service's imageLoaded$ observable (takeUntil(destroy$)) to re-invoke renderPreview() once an async image finishes loading, replacing the old direct in-component onload callback"

key-files:
  created: []
  modified:
    - src/app/components/attachment-preview/attachment-preview.component.ts

key-decisions:
  - "Removed the shell's private getAttachmentPointRadius()/getClickDetectionRadius() helpers and their backing radius/color constants entirely (not delegated as separate calls) since the spec never references them and AttachmentCanvasRendererService.hitTest/hoverTest already compute the correct radius internally from the isMobileDevice flag passed in render params"
  - "Mapped shell fields to the Plan 03 params contract exactly per 01-03-SUMMARY.md's table: selectedAttachmentPointId -> selectedPointId, local hoveredPointId field -> hoverPointId; hoveredAttachmentId stays an unused dead @Input() as before (never read by any code path)"
  - "onCanvasClick/onCanvasMouseMove keep 100% of their edit-mode/occupied-check/emit branching on the shell (pointDeleted, attachmentPointClicked, customPointAdded) — only the distance-loop point lookup was replaced with calls to canvasRenderer.hitTest/hoverTest, per the plan's threat model note that this branching is shell-owned selection policy, not renderer concern"

patterns-established: []

requirements-completed: [DECOMP-03]

coverage:
  - id: D1
    description: "attachment-preview.component.ts rewired to delegate render*/hit-test to AttachmentCanvasRendererService while preserving renderPreview()/previewScale/setupResizeObserver/handleResize signatures and behavior the existing spec exercises"
    requirement: "DECOMP-03"
    verification:
      - kind: unit
        ref: "src/app/components/attachment-preview/attachment-preview.component.spec.ts (all 13 specs)"
        status: pass
      - kind: other
        ref: "wc -l attachment-preview.component.ts == 384 (< 400 target)"
        status: pass
      - kind: other
        ref: "grep -c \"renderModel\\|renderOverlays\\|renderAttachmentPoints(ctx\" attachment-preview.component.ts == 0"
        status: pass
      - kind: other
        ref: "pnpm run typecheck (tsc --noEmit) — exit 0"
        status: pass
      - kind: other
        ref: "full suite: 317 specs, 52 failed (matches documented 01-BASELINE.md/deferred-items.md set, 0 new failures, none in attachment-preview)"
        status: pass
    human_judgment: false

duration: 18min
completed: 2026-07-06
status: complete
---

# Phase 1 Plan 05: Thin Attachment-Preview Shell Summary

**Rewired `attachment-preview.component.ts` from a ~856-line Canvas-drawing-plus-orchestration component down to a 384-line orchestration shell that delegates all rendering and hit-testing to `AttachmentCanvasRendererService` (Plan 03), with zero observable behavior change.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-07-06T18:58:00-04:00 (approx, first Read)
- **Completed:** 2026-07-06T19:16:26Z
- **Tasks:** 1 completed
- **Files modified:** 1

## Accomplishments
- `attachment-preview.component.ts` reduced from ~856 lines to 384 lines by removing all `render*` drawing-primitive methods, the `loadedImages`/`imagesLoading`/`loadImage` image cache, and the inline distance-based hit-test loops in `onCanvasClick`/`onCanvasMouseMove`
- `renderPreview()` now builds a single `AttachmentCanvasRenderParams` object from the shell's `@Input()`s and local state and calls `AttachmentCanvasRendererService.render(params)`, storing the returned position map back into `this.attachmentPointPositions` so the `.html` tooltip binding keeps working unchanged
- `onCanvasClick`/`onCanvasMouseMove` now call `canvasRenderer.hitTest`/`hoverTest` for point lookup, keeping all edit-mode/occupied-check/emit branching (`pointDeleted`, `attachmentPointClicked`, `customPointAdded`) on the shell exactly as before
- Added a `canvasRenderer.imageLoaded$` subscription (`takeUntil(destroy$)`) in the constructor to re-render once an async image finishes loading, replacing the removed in-component `img.onload` callback
- `selectedAttachmentPointId`/`hoveredAttachmentId` remain simple parent-driven `@Input()` fields with no new internal signal/BehaviorSubject shadowing them (D-05 preserved)
- Verified zero regressions: `attachment-preview.component.spec.ts` still 13/13 green; full suite (317 specs — up from the 256 in `01-BASELINE.md` due to other Phase 1 plans' new specs) shows exactly 52 failures, all matching the documented pre-existing baseline set, none in `attachment-preview`

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewire attachment-preview shell to delegate render + hit-test to the service** - `eed2ec0` (feat)

**Plan metadata:** committed with this SUMMARY (see final commit in this worktree)

## Files Created/Modified
- `src/app/components/attachment-preview/attachment-preview.component.ts` - Shrunk to a layout/lifecycle/`@Input()` orchestration shell; all Canvas drawing and hit-test geometry now delegated to `AttachmentCanvasRendererService`

## Decisions Made
- **Removed the shell's radius helper methods entirely** (`getAttachmentPointRadius`/`getClickDetectionRadius` and their backing constants) rather than keeping them as unused dead code — the spec never references them, and the renderer service's `hitTest`/`hoverTest` already compute the correct radius internally from the `isMobileDevice` flag passed in through render params. Keeping them would have been dead code with no consumer.
- **Followed the exact param-name mapping documented in 01-03-SUMMARY.md**: `selectedAttachmentPointId` (shell input) -> `selectedPointId` (service param); shell's local `hoveredPointId` field -> `hoverPointId` (service param). Values and semantics unchanged, only the parameter-object keys differ from the shell's own field names.
- **Kept `hoveredAttachmentId` as a declared-but-unused `@Input()`** exactly as it was pre-refactor (confirmed dead in 01-03-SUMMARY.md — never read by any render/hit-test path) rather than removing it, since removing an `@Input()` that a parent template might still bind to would be an unplanned API change outside this plan's scope.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Symlinked `node_modules` into the worktree**
- **Found during:** Task 1 verification (`pnpm run typecheck`)
- **Issue:** This git worktree has no `node_modules` (not tracked in git); `tsc`/`ng` were unavailable
- **Fix:** Verified `package.json` and `pnpm-lock.yaml` are byte-identical to the main checkout, then created `node_modules -> ../../../node_modules` symlink (reusing the main repo's already-installed, lockfile-matched dependencies; not a package install)
- **Files modified:** none (symlink is outside git, not committed)
- **Verification:** `pnpm run typecheck` and `pnpm exec ng test` both ran successfully afterward

**2. [Rule 3 - Blocking] Located a working ChromeHeadless binary via CHROME_BIN**
- **Found during:** Task 1 verification (`ng test --browsers=ChromeHeadless`)
- **Issue:** No system Chrome/Chromium; `karma-chrome-launcher` requires `CHROME_BIN`
- **Fix:** Found a Puppeteer-managed Chrome binary at `~/.cache/puppeteer/chrome/linux-150.0.7871.24/chrome-linux64/chrome` and exported `CHROME_BIN` for the test run (mirrors 01-03-SUMMARY.md's equivalent workaround on a different cached binary path)
- **Files modified:** none
- **Verification:** `attachment-preview.component.spec.ts` ran to completion (13/13 pass); full suite ran to completion (317 specs, 52 pre-existing failures matching the documented baseline, 0 new failures)

---

**Total deviations:** 2 auto-fixed (both Rule 3 — local environment/tooling blockers, no source-code impact)
**Impact on plan:** No scope creep; both fixes were required only to execute verification commands in this worktree checkout and left no trace in the committed diff.

## Issues Encountered
None beyond the two environment blockers documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- DECOMP-03 fully satisfied: canvas rendering/hit-testing is separated into `AttachmentCanvasRendererService` (Plan 03) and `attachment-preview.component.ts` is a thin 384-line orchestration shell (Plan 05)
- No blockers for later phases; this plan's scope was limited to the single shell file per its frontmatter `files_modified` list

---
*Phase: 01-component-decomposition*
*Completed: 2026-07-06*

## Self-Check: PASSED

- FOUND: src/app/components/attachment-preview/attachment-preview.component.ts
- FOUND commit: eed2ec0 (Task 1)

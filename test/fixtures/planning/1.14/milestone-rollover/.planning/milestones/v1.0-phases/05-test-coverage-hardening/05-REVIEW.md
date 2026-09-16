---
phase: 05-test-coverage-hardening
reviewed: 2026-08-01T23:01:03Z
depth: standard
files_reviewed: 18
files_reviewed_list:
  - src/app/components/attachment-edit-modal/attachment-edit-modal.component.spec.ts
  - src/app/components/attachment-preview/attachment-preview.component.spec.ts
  - src/app/components/attachment-sidebar/attachment-sidebar.component.spec.ts
  - src/app/components/category-dropdown/category-dropdown.component.spec.ts
  - src/app/components/compare-modal/compare-modal.component.spec.ts
  - src/app/components/comparison-panel/comparison-panel.component.spec.ts
  - src/app/components/image-display/image-display.component.html
  - src/app/components/image-display/image-display.component.spec.ts
  - src/app/components/image-display/image-display.component.ts
  - src/app/components/manage-modal/manage-modal.component.spec.ts
  - src/app/components/size-slider/size-slider.component.spec.ts
  - src/app/components/upload-modal/upload-modal.component.spec.ts
  - src/app/integration/README.md
  - src/app/integration/share-link-import.integration.spec.ts
  - src/app/integration/upload-attach-use.integration.spec.ts
  - src/app/services/scaling.service.spec.ts
  - src/app/services/state-export.service.spec.ts
  - src/app/testing/state-export-fixtures.ts
findings:
  critical: 2
  warning: 2
  info: 0
  total: 4
status: issues_found
---

# Phase 5: Code Review Report

**Reviewed:** 2026-08-01T23:01:03Z
**Depth:** standard
**Files Reviewed:** 18
**Status:** issues_found

## Summary

Most of this phase's spec work is genuinely strong: `attachment-edit-modal.component.spec.ts`
proves subscription teardown by observing that reactive fields stop changing after
`ngOnDestroy` (not by spying on `unsubscribe`), the two `src/app/integration/*.spec.ts` files
drive real IndexedDB/localStorage with disciplined `afterEach` cleanup and no order
dependence, and `state-export.service.spec.ts` / `state-export-fixtures.ts` build a real,
mechanically-enforced fixture-coverage guard across all 12 supported versions. The
`FileReader.readAsDataURL` stub-restoration concern called out in the phase brief is handled
correctly in the code as it stands today.

Two real problems were found, both fitting the exact failure modes called out for this
review:

1. The one behavior-changing template edit in this phase (`track item.name` in
   `image-display.component.html`) introduces a genuine duplicate-key risk: `name` is the
   attachment's display name, not a unique id, and nothing in the codebase prevents two
   overlays with the same name (e.g. the same accessory attached twice to two different
   points). Angular throws NG0955 on duplicate track values — this fix for one NG0100 opens
   a path to a different runtime error for a case that was never guarded against and has no
   regression test.
2. `comparison-panel.component.spec.ts` wraps nearly every assertion that actually checks
   data flowing into its `app-size-slider`/`app-image-display` children inside `if (x) { ... }`
   guards. Today the queries always succeed, so the suite passes, but this is architecturally
   a "test that cannot fail": if the query ever returns null for any reason, the test reports
   green while asserting nothing.

Two lower-severity issues (a vacuous test group in `attachment-preview.component.spec.ts`
and a narrower instance of the same `if`-guard pattern in `attachment-sidebar.component.spec.ts`)
are recorded as warnings.

## Critical Issues

### CR-01: `track item.name` in the attachment-heights `@for` can throw NG0955 on duplicate overlay names

**File:** `src/app/components/image-display/image-display.component.html:45`
**Issue:** The template was changed from `track item` to `track item.name` to fix an NG0100
caused by tracking a freshly-mapped object by reference (each call to `getAttachmentHeights()`
returns new `{ name, height }` literals). `item.name` comes straight from `overlay.name`
(`getAttachmentHeights()` in `image-display.component.ts:278-296`), and `overlay.name` is set
to the attachment model's display name, not a generated id
(`comparison-panel.component.ts:320`: `name: event.attachment.name`). Nothing in the codebase
enforces that a base model can only receive one overlay of a given attachment — a user can
attach the same accessory (e.g. "Ring") to two different attachment points on the same model,
producing two `OverlayModel`s with distinct `id`s but the identical `name: 'Ring'`. When that
happens, `getAttachmentHeights()` returns two objects with the same `name`, and Angular's
`@for` control flow throws `NG0955: The provided track expression resulted in duplicated keys`
at change-detection time for the "Attachment Heights" panel — reintroducing a hard runtime
error for exactly the display feature this fix targeted, just triggered by a different input
shape. `image-display.component.spec.ts`'s `getAttachmentHeights` describe block (lines
737-911) has no case with two overlays sharing a `name`, so this gap shipped without a failing
test.
**Fix:** Track by the overlay's actual unique id instead of its display name. `getAttachmentHeights()`
already has `overlay.id` in scope; thread it through:
```ts
// image-display.component.ts
getAttachmentHeights(): { id: string; name: string; height: string }[] {
  ...
  return this.overlays.map(overlay => {
    if (!overlay.attachmentMetadata) {
      return { id: overlay.id, name: overlay.name, height: 'N/A' };
    }
    ...
    return { id: overlay.id, name: overlay.name, height: this.inchesToFeetAndInches(realWorldHeight) };
  });
}
```
```html
<!-- image-display.component.html -->
@for (item of getAttachmentHeights(); track item.id) {
```
Add a regression test with two overlays sharing the same `attachmentMetadata.name`/`overlay.name`
attached at two different attachment points, asserting `getAttachmentHeights()` returns two
distinct entries (this is also the case that should have caught the gap before it shipped).

### CR-02: `comparison-panel.component.spec.ts` gates its core wiring assertions behind `if (childComponent) { ... }`, so a query miss silently passes

**File:** `src/app/components/comparison-panel/comparison-panel.component.spec.ts:89-104, 106-124, 126-138, 168-177, 179-196, 226-235, 263-273`
**Issue:** Seven tests across two `describe` blocks ("Integration with Size Slider" and
"Scaling Constraint Prevention") query for `app-size-slider`/`app-image-display` via
`fixture.debugElement.query(debugEl => debugEl.name === 'app-size-slider')` and then wrap
every assertion in `if (sizeSliderComponent) { ... }` / `if (imageDisplayComponent) { ... }`.
Under current template wiring (`comparison-panel.component.html:1,23,36`, both children render
unconditionally once `panelState` is set, which every one of these tests does), the guard is
currently always truthy — but that is incidental, not asserted. If the query predicate ever
returns `undefined` (component rename, a template refactor that nests the child deeper, a
`debugElement` timing change, or simply a typo reintroduced during a future edit), every one
of these tests reports green while performing zero assertions — exactly the "tests that cannot
fail" failure mode called out for this review. This is the file's primary claimed value
(proving `comparison-panel` correctly passes overlay data, scale, and `relativeScale` down to
its children), so a silent pass here would mask a real wiring regression rather than catch one.
**Fix:** Assert the query result is non-null before using it, rather than gating on it:
```ts
const sizeSliderComponent = fixture.debugElement.query(
  debugEl => debugEl.name === 'app-size-slider'
);
expect(sizeSliderComponent).toBeTruthy();
expect(sizeSliderComponent.componentInstance.selectedModel).toBe(mockModel);
expect(sizeSliderComponent.componentInstance.currentScale).toBe(1.5);
expect(sizeSliderComponent.componentInstance.overlays).toEqual([mockOverlay]);
expect(sizeSliderComponent.componentInstance.overlayScales).toEqual({ 'test-overlay': 2 });
```
Apply the same change to every other `if (x) { ... }`-guarded assertion block in this file.

## Warnings

### WR-01: `attachment-sidebar.component.spec.ts` — template assertion silently no-ops if the slider isn't found

**File:** `src/app/components/attachment-sidebar/attachment-sidebar.component.spec.ts:161-167`
**Issue:** `'should apply slider settings to scale input in template'` queries
`fixture.nativeElement.querySelector('.scale-slider')` and wraps all three assertions in
`if (slider) { ... }`. Same shape as CR-02, on a single test rather than the whole file:
currently `.scale-slider` renders because `selectedModel` is set before `detectChanges()`
(the element is gated by `@if (selectedModel)` in `attachment-sidebar.component.html:17`), so
the guard is currently always true, but a future template change that stops the query from
matching would make this test pass without checking anything.
**Fix:** `expect(slider).toBeTruthy();` before the attribute assertions, dropping the `if`.

### WR-02: `attachment-preview.component.spec.ts` — "Attachment Positioning Logic" tests exercise no production code

**File:** `src/app/components/attachment-preview/attachment-preview.component.spec.ts:68-159`
**Issue:** The three tests in this `describe` block (`'should calculate overlay position
correctly without double-scaling'`, `'should calculate pending attachment position correctly
without double-scaling'`, `'should snap pending attachment to hovered point correctly'`)
declare local literals (`expectedX`, `incorrectX`, etc.) and assert plain JavaScript arithmetic
against itself — no method on `component`, `scalingService`, or any other collaborator is ever
invoked. These tests will pass identically regardless of what
`attachment-preview.component.ts` actually does; they document an arithmetic fix in prose and
comments but verify nothing about the component under test. They read as regression
documentation for a historical bug fix rather than executable tests.
**Fix:** Either delete these three tests (the historical fix is already documented in the
surrounding comments and git history) or rewrite them to drive the actual component code path
that performs this calculation (e.g. via `onCanvasMouseMove`/`onCanvasClick` with a real
`pendingAttachment` set, as the later `onCanvasClick`/`onCanvasMouseMove` describe blocks in
this same file already do correctly).

---

_Reviewed: 2026-08-01T23:01:03Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

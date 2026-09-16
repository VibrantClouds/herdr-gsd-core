---
status: complete
phase: 05-test-coverage-hardening
source: [05-VERIFICATION.md]
started: 2026-08-01T23:13:27Z
updated: 2026-08-09T21:58:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Live share-link round-trip against the deployed endpoint
expected: Generate a real share link in the running app, open it in a clean browser profile — both panels' models, overlays, scales, and the /adult URL prefix (if adult mode was on) restore correctly.
why_human: `share-link-import.integration.spec.ts` (TEST-03) stubs global `fetch` by design — the deployed `generateShareLink`/`loadFromShareLink` Cloudflare Worker endpoints live outside this repo and cannot be hit from a unit test. A green spec run is not proof the deployed endpoint round-trips correctly.
result: pass
reported: "Yes Test 1 works"

### 2. Mobile / small-screen rendering
expected: Load the app at a 375×667 viewport and exercise upload → attachment-point definition → attach. No clipping, no unreachable controls, ruler and point-picker UI remain usable.
why_human: Karma/Jasmine assert logic, not CSS layout. Viewport regressions are visual, and CLAUDE.md's mobile-first constraint requires human confirmation.
result: pass
source: automated
evidence: |
  Driven end-to-end in Firefox via Playwright MCP at 375×667 against the local dev server:
  - App load, model selection, dual-panel comparison: no clipping.
  - Overflow bottom-sheet menu, Manage modal, Upload modal: all render correctly.
  - Measurement ruler (Full Height / Full Width / Diagonal presets) reachable.
  - Attachment-point picker: crosshair overlay accepted the click, point placed,
    button transitioned to "Redefine Attachment Point".
  - Save persisted to IndexedDB ("Successfully uploaded", Custom Attachments (1), 954 bytes).
  - Attached to both panels; both overlays rendered at their attachment points.
  Cosmetic observation (not filed as a gap): the success snackbar briefly overlaps the
  panel "Attachments" button at mobile width until it auto-dismisses.

### 3. ImageDisplayComponent first-render behavior
expected: Load a comparison with overlays on both panels, resize the browser window, and change a scale slider. Images and overlays position correctly on the FIRST render, not only after a subsequent resize.
why_human: This is the phase's single production behavior change (05-09, `image-display.component.ts`/`.html`). It removed a deferred `setTimeout` initial-measurement pass and changed the `@for` track expression. The spec suite pins the numbers, but first-paint appearance needs a human eye. Note the track expression was subsequently corrected from `track item.name` to `track item.id` (commit `01f4b7f`) to avoid an NG0955 duplicate-key error when one accessory is attached twice.
result: pass
source: automated
evidence: |
  Verified in a real browser with overlays on both panels:
  - Fresh desktop load (1280×800): models side by side, feet aligned on a common
    baseline, both overlays pinned to their attachment points on FIRST paint.
  - Scale slider 5'9" → 10'4": the model and its overlay rescaled and repositioned
    correctly on first render; right panel unaffected; feet still aligned.
  - Console: zero errors for the session — no NG0100, no NG0955.
  A separate pre-existing layout defect was found while exercising this test; it is
  recorded under Deferred Follow-Ups (not a Phase 5 regression — see that entry for
  the two-way evidence).

### 4. Disposition decision for the three unresolved code-review findings
expected: Decide fix-or-waive for CR-02, WR-01, and WR-02 from `05-REVIEW.md`, and record the decision durably — either fix them, or waive them in `.planning/WINDOWS.md` matching how this phase already waived its two coverage-gap deferrals (TESTV2-04, TESTV2-05).
why_human: All three are "tests that cannot fail". All three predate Phase 5 and none affects the 5 stated success criteria, so this is a judgment call between fixing now and accepting pre-existing debt.
result: pass
reported: "Fix all three now"
resolution: |
  User elected to fix rather than waive. Closed in commit 2a317d1:
  - CR-02: 7 `if (component) { ... }` guards in comparison-panel.component.spec.ts
    replaced with explicit `expect(...).toBeTruthy()` + unwrapped assertions.
  - WR-01: same treatment for attachment-sidebar.component.spec.ts:161-167.
  - WR-02: the 3 "Attachment Positioning Logic" tests rewritten to drive the real
    AttachmentCanvasRendererService against a spy 2D context, asserting the
    coordinates handed to the canvas instead of arithmetic on local literals.
  Anti-vacuity proof: temporarily reintroducing the double-scaling regression at all
  three production sites (renderOverlays overlayX, renderPendingAttachment attachX,
  and the hovered-point snap) turned exactly these three tests red; restoring the
  service returned them to green.
  Full suite 694 passing; `tsc --noEmit` clean.

## Summary

total: 4
passed: 4
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none — no test reported an issue]

## Deferred Follow-Ups

- test: 3
  idea: "Panel positions are not recomputed when the viewport is resized across the side-by-side ↔ overlap breakpoint. After a 375×667 → 1280×800 resize both panels stay at their mobile origins (x=10 / x=11) in a 1280px viewport, leaving ~900px empty and clipping the models at the bottom; a fresh load at the same size is correct (x=264 / x=662). Cause: compare-modal.component.ts:662 runDefaultPositionsCalc() reads a stale this.canvasDimensions, and onCanvasResize only re-runs the calc when pendingDefaultPositionsRecalc is set — which happens only on the height<=0 path, so a width-only change never triggers recomputation."
  not_a_phase_05_regression: |
    Established two ways: (1) compare-modal.component.ts was last modified in Phase 3
    (47af8fc, "replace compare-modal setTimeout layout guess with cached-dimension
    ResizeObserver") and is untouched by Phase 5, whose only production change is
    image-display.component.ts/.html; (2) checking out the pre-Phase-5 image-display
    (e610eb5) and repeating the exact resize sequence reproduced the identical wrong
    result (x=10 / x=11). Working tree was restored afterward.
  deferred_at: 2026-08-09

- test: 2
  idea: "The 'Elf' model is broken — /assets/models/Elf.png returns 404 while src/assets/metadata/Elf.json exists, so selecting Elf renders no image and logs 'Failed to load image'. Confirmed by the user during this session as a known-broken model; testing continued with Female Human. Unrelated to Phase 5's test-coverage scope."
  deferred_at: 2026-08-09

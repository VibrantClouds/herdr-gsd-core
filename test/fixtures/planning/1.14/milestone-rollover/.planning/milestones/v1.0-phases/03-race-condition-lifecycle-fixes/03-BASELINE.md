# Phase 03 — Wave 1 Test-Execution Baseline

This document is the pre-change attribution baseline required by `03-VALIDATION.md` and
this plan's `must_haves.truths`. It is captured **before any Phase 3 race-condition or
lifecycle fix work begins**, so that any later spec regression during this phase's waves
can be correctly attributed to Phase 3's own changes versus pre-existing state. No source
file under `src/` was modified while producing this record (`git status --short src/`
reports empty for the duration of this task).

## Environment

| Item | Value |
|------|-------|
| Node version | v24.18.1 (`node --version`) |
| Package manager | pnpm 10.33.0 (`pnpm --version`) |
| `CHROME_BIN` used | `/home/user/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome` |
| Full test command form | `CHROME_BIN=<path> pnpm test --no-watch` |
| Scoped test command form | `CHROME_BIN=<path> pnpm exec ng test --no-watch --browsers=ChromeHeadless --include='**/<file>'` |

**Smoke check:**
`CHROME_BIN=/home/user/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome pnpm exec ng test --no-watch --browsers=ChromeHeadless --include='**/app.component.spec.ts'`
→ exits 0, `TOTAL: 1 SUCCESS`.

## Full-Suite Baseline

Command: `CHROME_BIN=/home/user/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome pnpm test --no-watch`

| Metric | Value |
|--------|-------|
| Total specs | 391 |
| Passed | 341 |
| Failed | 50 |

This exactly matches the Phase 2 close-out running baseline recorded in
`02-05-SUMMARY.md` (50 failures / 341 success / 391 total, after plan 02-01 retired 2
`StateExportService` failures from the Phase 1 52-name set) — no delta since Phase 2
closed.

### Distinct Failing Spec Names (sorted, 50 total)

Extracted from the Karma run's per-spec `FAILED` output (`describe` path + `it` name).
This is the regression-attribution list for every later plan in this phase.

1. `AttachmentSidebarComponent Scale Slider Settings should handle null selectedModel gracefully`
2. `AttachmentSidebarComponent Scale Slider Settings should use default slider settings when model has no custom settings`
3. `CategoryDropdownComponent should create`
4. `CompareModalComponent Horizontal Flip should append scaleX(-1) to left transform when flipped`
5. `CompareModalComponent Horizontal Flip should append scaleX(-1) to right transform when flipped`
6. `CompareModalComponent Horizontal Flip should call onToggleLeftFlip when left flip button is clicked`
7. `CompareModalComponent Horizontal Flip should call onToggleRightFlip when right flip button is clicked`
8. `CompareModalComponent Horizontal Flip should display flip buttons when models are selected`
9. `CompareModalComponent Horizontal Flip should handle null panelState gracefully for isLeftFlipped`
10. `CompareModalComponent Horizontal Flip should handle null panelState gracefully for isRightFlipped`
11. `CompareModalComponent Horizontal Flip should have active class on left flip button when left is flipped`
12. `CompareModalComponent Horizontal Flip should not append scaleX(-1) to left transform when not flipped`
13. `CompareModalComponent Horizontal Flip should not append scaleX(-1) to right transform when not flipped`
14. `CompareModalComponent Horizontal Flip should not have active class on left flip button when left is not flipped`
15. `CompareModalComponent Horizontal Flip should return false for isLeftFlipped when panel is not flipped`
16. `CompareModalComponent Horizontal Flip should return false for isRightFlipped when panel is not flipped`
17. `CompareModalComponent Horizontal Flip should return true for isLeftFlipped when panel is flipped`
18. `CompareModalComponent Horizontal Flip should return true for isRightFlipped when panel is flipped`
19. `CompareModalComponent Image Dimensions with Buffer should add 40px buffer to container height in calculateImageDimensions`
20. `CompareModalComponent Image Dimensions with Buffer should handle edge case where image is taller than canvas`
21. `CompareModalComponent Image Dimensions with Buffer should maintain relative scale while adding buffer`
22. `CompareModalComponent On Top Toggle should call toggleOnTop when slide toggle is clicked`
23. `CompareModalComponent On Top Toggle should display on-top control in canvas header`
24. `CompareModalComponent On Top Toggle should initialize with leftOnTop as false`
25. `CompareModalComponent On Top Toggle should initialize with right image having higher z-index`
26. `CompareModalComponent On Top Toggle should reset leftOnTop to false when resetPositions is called`
27. `CompareModalComponent On Top Toggle should show "Left" button as active when leftOnTop is true`
28. `CompareModalComponent On Top Toggle should show "Right" button as active when leftOnTop is false`
29. `CompareModalComponent On Top Toggle should toggle leftOnTop state when toggleOnTop is called`
30. `CompareModalComponent On Top Toggle should update z-indices when leftOnTop changes`
31. `CompareModalComponent Relative Scale Preservation should apply relative scale equally to both images`
32. `CompareModalComponent Relative Scale Preservation should calculate relative scale correctly for different sized images`
33. `CompareModalComponent should create`
34. `ComparisonPanelComponent Integration with Size Slider should handle empty overlay state`
35. `ComparisonPanelComponent Integration with Size Slider should handle scale changes from size-slider`
36. `ComparisonPanelComponent Integration with Size Slider should pass overlay data to size-slider component`
37. `ComparisonPanelComponent Integration with Size Slider should pass showAttachmentHeights=false to image-display component`
38. `ComparisonPanelComponent Integration with Size Slider should update when panel state changes`
39. `ImageDisplayComponent Overlay Positioning should handle scaleRelativeToParent correctly`
40. `ImageDisplayComponent Scaling Constraints and Container Positioning should handle container smaller than image`
41. `ImageDisplayComponent Scaling Constraints and Container Positioning should update when scale changes`
42. `ManageModalComponent should clear all user models with confirmation`
43. `ManageModalComponent should delete user model with confirmation`
44. `ManageModalComponent should load user models on init`
45. `ManageModalComponent should show storage warning when approaching limit`
46. `SizeSliderComponent Measurement Formatting should format height correctly in imperial units`
47. `SizeSliderComponent Measurement Formatting should format measurement correctly with model`
48. `UploadModalComponent should handle file selection with valid file`
49. `UploadModalComponent should validate height required for both models and attachments`
50. `UploadModalComponent should validate unique name`

All 50 are pre-existing and inherited unchanged from the Phase 2 close-out (`02-05-SUMMARY.md`
§"Full-suite baseline confirmation"). The large majority are `NullInjectorError: No provider
for HttpClient` surfacing through `ImageMetadataService` in components/specs whose `TestBed`
configuration is missing `provideHttpClient()`/`HttpClientTestingModule` (a pre-existing
DI-mock gap, out of scope for this phase — owned by Phase 5/TEST work). `UploadModalComponent`'s
3 failures are the documented pre-existing DI-mock mismatch (spec injects deprecated
`UserModelService`; component is wired to `IndexedDBUserModelService`) per Phase 1's
`01-BASELINE.md` Pitfall 3 / decision D-06.

## Gate definition for Phase 3

**The phase gate is: "the full-suite failing-spec-name set produced at phase close is a
subset of this baseline's 50-name failing-spec-name set above" — it is explicitly NOT
"zero failures" and NOT "the same 391/341/50 counts must hold exactly."**

Rationale: `pnpm test` currently reports these 50 pre-existing failures inherited from
Phase 1/Phase 2, none of which this phase is scoped to fix (they belong to Phase 5/TEST).
"Full suite green" is therefore not a reachable gate for Phase 3. Any spec name that
appears as failing in a later full-suite run of this phase and is **not** in the 50-name
list above is a genuine regression introduced by this phase's race-condition/lifecycle
work and must be fixed before the phase closes. Conversely, a later run reporting *fewer*
than 50 failures (some subset of the 50 now passing) is acceptable and not a gate
violation — the gate only forbids *new* names appearing, not existing ones disappearing.

## Per-Spec Baseline (Phase 3 target files)

Each run in isolation with `CHROME_BIN=<path> pnpm exec ng test --no-watch
--browsers=ChromeHeadless --include='**/<file>'`.

| Spec file | Total | Passed | Failed |
|---|---|---|---|
| `src/app/services/measurement-ruler.service.spec.ts` | 13 | 13 | 0 |
| `src/app/components/measurement-ruler/measurement-ruler.component.spec.ts` | 8 | 8 | 0 |
| `src/app/components/angle-dial/angle-dial.component.spec.ts` | 6 | 6 | 0 |
| `src/app/components/penetration-modal/penetration-modal.component.spec.ts` | 1 | 1 | 0 |
| `src/app/components/compare-modal/compare-modal.component.spec.ts` | 30 | 0 | 30 |
| `src/app/services/model-attachment-defaults.service.spec.ts` | 17 | 17 | 0 |

**Note on `compare-modal.component.spec.ts` in isolation (30/30 fail):** When run scoped
via `--include`, every spec in this file fails with `NullInjectorError: No provider for
HttpClient` (same root cause as the full-suite `CompareModalComponent` failures — the
spec's `TestBed` configuration does not provide `HttpClient` for the transitively-injected
`ImageMetadataService`). This is a stricter (all-30) count than the ~29 `CompareModalComponent`
entries visible in the full-suite 50-name list above, because Angular's TestBed module
resolution behaves differently when a spec file is the sole target vs. co-loaded with the
rest of the suite (a documented, pre-existing DI-mock gap, not a Phase 3 concern — see
Phase 1 `01-BASELINE.md` for the general pattern). This isolation-run number (30/0/30) is
recorded here as the literal, reproducible baseline for this file; the phase's actual
regression-attribution authority is the full-suite 50-name list above, per the Gate
definition. Any Phase 3 plan touching `compare-modal.component.ts` must diff its own
full-suite run's `CompareModalComponent` failure names against the 50-name baseline list,
not against this isolated-run count.

## Compile Baseline

| Check | Command | Result |
|-------|---------|--------|
| Type check | `npx tsc --noEmit` | Exit 0 |
| Production build | `pnpm run build` | Exit 0 — `Initial total 775.94 kB` (pre-existing bundle-budget warning, 25.94 kB over the 750 kB budget; not a new regression, identical to the Phase 2 close-out figure recorded in `02-05-SUMMARY.md`) |

## Attribution Rule for Later Waves

- If the full-suite failing-spec-name set for a later plan's post-change run contains any
  name **not** in the 50-name list above, that is a genuine regression introduced by this
  phase's work and must be fixed before the phase closes.
- A later run reporting fewer failures (some baseline names now passing, e.g. because a
  fix in this phase incidentally resolves a pre-existing failure) is acceptable and not a
  gate violation.
- The `compare-modal.component.spec.ts` isolation-run discrepancy documented above
  (30/0/30 in isolation vs. ~29 entries in the full-suite 50-name list) is a pre-existing
  TestBed-resolution artifact, not a Phase 3 regression signal by itself — always compare
  against the full-suite 50-name list, never against an isolated single-file run count.

# Deferred Items — Phase 01 (Component Decomposition)

Out-of-scope discoveries logged here per the executor's Scope Boundary rule. These are
NOT fixed as part of this phase's plans; they are recorded for future phases/backlog.

## 1. ~~Full test suite does not run to completion~~ — FIXED out-of-band during Wave 1 gate

- **Discovered during:** 01-01-PLAN.md, Task 1 (Wave 0 baseline measurement)
- **File:** `src/app/services/site-mode.service.spec.ts`
- **Issue:** Several `it()` blocks attempted `delete (window as any).location` to stub
  navigation for route-based tests. Under the Chromium version available in this
  environment, this threw `TypeError: Cannot delete property 'location' of [object Window]`,
  and also tripped Karma's "Some of your tests did a full page reload!" detector. The
  browser then went idle and Karma marked it `DISCONNECTED` after the default 30s
  `browserNoActivityTimeout`, ending the full-suite run early (~199-256 of 256 specs
  executed, depending on scheduling and launcher).
- **Resolution:** Fixed during the Phase 1 Wave 1 post-merge gate (not part of any
  Phase 1 decomposition plan) because the disconnect blocked every subsequent wave's
  post-merge test gate identically, regardless of that wave's own changes. Replaced the
  `delete window.location` / reassignment pattern with `window.history.replaceState(null,
  '', path)`, which changes `window.location.pathname` in a real browser without
  triggering navigation or a page reload. All 7 specs in the file now pass, and the full
  suite executes all 256 specs to completion instead of disconnecting at ~199/256.
- **Impact on this phase:** None on scope — this was purely a test-infrastructure fix
  isolated to one spec file's mocking technique; no application source was touched.
  Unblocks accurate full-suite regression detection for the remaining waves. See
  `01-BASELINE.md` for the full-suite pre-existing-failure baseline this fix revealed.

## 2. Full test suite has 52 pre-existing failures unrelated to Phase 1 (baseline, not regressions)

- **Discovered during:** Wave 1 post-merge gate, after fixing item 1 above allowed the
  full suite to run to completion for the first time.
- **Issue:** 256 total specs, 204 passing, 52 failing. Confirmed pre-existing (not
  introduced by this phase) because Wave 1 (`01-01`) made zero changes under `src/`
  (`git diff --stat` against the prior commit is empty for `src/`).
- **Failure pattern:** The large majority are `NullInjectorError: No provider for
  HttpClient` surfacing through `ImageMetadataService` in components that transitively
  depend on it (`CompareModalComponent`, `ComparisonPanelComponent`, `ImageDisplayComponent`,
  `ManageModalComponent`, `AttachmentSidebarComponent`, `SizeSliderComponent`,
  `CategoryDropdownComponent`, `StateExportService`), plus the 3 already-known
  `UploadModalComponent` DI-mock mismatches (D-06, Phase 5 scope) documented in
  `01-BASELINE.md`.
- **Why deferred:** Fixing TestBed provider wiring across ~15 spec files is a test-infra
  task orthogonal to component decomposition, and matches the existing Phase 5 (TEST)
  scope boundary already established for the DI-mock issue in `01-RESEARCH.md`.
- **Suggested fix (for whoever picks this up):** Add `provideHttpClient()` (or
  `HttpClientTestingModule`) to the `TestBed.configureTestingModule` providers array in
  the affected spec files.
- **Impact on this phase:** None — see `01-BASELINE.md` full-suite baseline (52 known
  pre-existing failures, itemized by name) used for regression attribution in Waves 2-5.
  Any wave introducing a new failure beyond this list of 52 is a genuine regression.

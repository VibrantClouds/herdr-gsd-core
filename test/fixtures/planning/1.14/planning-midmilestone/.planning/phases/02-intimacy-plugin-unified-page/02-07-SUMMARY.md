---
phase: 02-intimacy-plugin-unified-page
plan: 07
subsystem: ui
tags: [angular, cdk-a11y, section-nav, dialog, environments, fileReplacements]

requires:
  - phase: 02-intimacy-plugin-unified-page
    provides: "02-01 (SUBDOC_PLUGINS, SubDocHost/PluginOutlet, CharacterStore page API); 02-04 (@angular/cdk installed); 02-05 (SubDocHost chapter title bar, cdkDropList/cdkDrag wiring, cdkDragPreviewContainer fix, test-notes synthetic plugin); 02-06 (Intimacy editor full layout and view mode)"
provides:
  - "SectionNav (cd-section-nav): sticky pill nav built from Header + per-page + per-page-section entries, IntersectionObserver scroll-spy, click-to-scroll with page fallback for not-yet-mounted sections"
  - "Modal (cd-modal): reusable dialog / bottom-sheet shell (cdkTrapFocus auto-capture, Escape, target-checked backdrop close, focus restore on destroy) — the base shell the Phase 3 share dialog and Phase 6 print dialog will reuse"
  - "AddPageMenu (cd-add-page-menu): picker rows (icon, name, description, 18+ badge) for store.availableTypes()"
  - "CharacterPage: navEntries computed, addMenuOpen/onPick wiring replacing the old direct-add button, mode input + editorMode computed + VIEW_MODE_PREVIEW-gated dev-only view-mode preview with .preview-banner"
  - "apps/web/src/environments/{environment.ts,environment.development.ts} and angular.json development fileReplacements — first environment-file pair in this repo"
affects: ["Phase 3 (share dialog reuses Modal and the mode='view' contract)", "Phase 6 (print dialog reuses Modal and SectionNav's print-hidden rule)", "any future page type (SectionNav/AddPageMenu are registry-driven, no per-type code)"]

actuals:
  tokens: 13000
  tasks: 3
  commits: 3
plan_head_before: c88b52ec74e4ef38d10d5fc2e7bcf56ad8011062

tech-stack:
  added: []
  patterns:
    - "afterRenderEffect(onCleanup) for a DOM-observing effect that must re-run when an input signal changes and tear down its own IntersectionObserver on each re-run/destroy (SectionNav) — extends the existing afterNextRender-for-DOM-timing pattern from 02-05 to the re-run/cleanup case."
    - "environment.ts / environment.development.ts pair swapped via angular.json's development-configuration fileReplacements, consumed through an InjectionToken with a factory default (VIEW_MODE_PREVIEW) rather than importing environment directly in components — keeps the dev-only branch swappable/mockable in tests."
    - "Modal's focus-restore-on-close relies on Angular's own @if structurally destroying CdkTrapFocus (whose ngOnDestroy restores focus) rather than any bespoke close logic — the parent only ever toggles the `open` signal."

key-files:
  created:
    - apps/web/src/app/components/section-nav/section-nav.component.ts
    - apps/web/src/app/components/section-nav/section-nav.component.html
    - apps/web/src/app/components/section-nav/section-nav.component.scss
    - apps/web/src/app/components/section-nav/section-nav.component.spec.ts
    - apps/web/src/app/components/modal/modal.component.ts
    - apps/web/src/app/components/modal/modal.component.html
    - apps/web/src/app/components/modal/modal.component.scss
    - apps/web/src/app/components/modal/modal.component.spec.ts
    - apps/web/src/app/components/add-page-menu/add-page-menu.component.ts
    - apps/web/src/app/components/add-page-menu/add-page-menu.component.html
    - apps/web/src/app/components/add-page-menu/add-page-menu.component.scss
    - apps/web/src/app/components/add-page-menu/add-page-menu.component.spec.ts
    - apps/web/src/environments/environment.ts
    - apps/web/src/environments/environment.development.ts
    - apps/web/src/app/pages/character/view-mode-preview.ts
  modified:
    - apps/web/src/app/pages/character/character-page.component.ts
    - apps/web/src/app/pages/character/character-page.component.html
    - apps/web/src/app/pages/character/character-page.component.scss
    - apps/web/src/app/pages/character/character-page.component.spec.ts
    - apps/web/angular.json
    - apps/web/src/app/integration/intimacy-page.integration.spec.ts

key-decisions:
  - "SectionNav keeps the current pill scrolled into view (link.scrollIntoView({block:'nearest', inline:'nearest'})) via a viewChildren('navLink') query paired by array index with entries(), instead of a CSS.escape'd querySelector — avoids any selector-escaping edge case for ids and stays index-stable since @for renders both arrays in identical order."
  - "AddPageMenu's [attr.cdkFocusInitial] on the first row is a plain HTML attribute, not a CDK directive — @angular/cdk 22.1.6's FocusTrap.focusInitialElement() queries `[cdkFocusInitial]` via querySelector internally (confirmed by reading the compiled a11y source), so the attribute alone is the complete, real mechanism; verified as real behavior (not just a test hook) via the Modal spec's InteractivityChecker-overridden focus assertion."
  - "The `test` builder (@angular/build:unit-test) resolves the same fileReplacements as `serve`'s development configuration, even with no `configurations` block on the `test` architect target — confirmed empirically (a debug assertion showed environment.viewModePreview === true inside Vitest). Tests that need the production/false value must override VIEW_MODE_PREVIEW explicitly; the DI-default test intentionally asserts equality with the live environment import rather than a hardcoded boolean, so it stays correct regardless of which environment the test builder resolves."
  - "CharacterPage's mode gating short-circuits editorMode on the VIEW_MODE_PREVIEW token first, so the exact string 'view' from the query param cannot flip real users into view mode in a production build — this is the load-bearing mechanism for the CHAR-06 prohibition (no edit/view toggle in production, ADR-0003/D-14) and is proven by the dev-vs-production build-diff check, not just by a unit test of the computed's logic."

patterns-established:
  - "Registry-driven nav/picker components (SectionNav, AddPageMenu) that read only SUBDOC_PLUGINS and the page list — no per-type branching, so a future plugin (Phase 4 Gallery, Phase 8 second-gen plugins) needs zero changes to either component."

requirements-completed: [CHAR-04, CHAR-06]

coverage:
  - id: D1
    description: "SectionNav: sticky pill nav (Header + page + section pills in page order), IntersectionObserver scroll-spy (topmost-intersecting wins, previous value kept when nothing intersects), click-to-scroll with page-id fallback for sections not yet in the DOM, hidden in print, mounted only when store.pages().length > 0 (CHAR-06, D-02 to D-04)"
    requirement: "CHAR-06"
    verification:
      - kind: unit
        ref: "apps/web/src/app/components/section-nav/section-nav.component.spec.ts (6 tests)"
        status: pass
      - kind: unit
        ref: "apps/web/src/app/pages/character/character-page.component.spec.ts > CharacterPage: section nav (4 tests: zero-pages absence, single-page pill order incl. #page-header, two-page reorder, unique ids across a fully deferred render)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Modal: reusable dialog / bottom-sheet shell — role dialog, aria-modal, aria-labelledby, cdkTrapFocus auto-capture with focus-trap anchors, Escape and target-checked backdrop close, focus restored to the opener on close (SPEC-frontend-architecture §8)"
    verification:
      - kind: unit
        ref: "apps/web/src/app/components/modal/modal.component.spec.ts (4 tests, InteractivityChecker overridden for jsdom's zero-size-element focusability gap)"
        status: pass
    human_judgment: false
  - id: D3
    description: "AddPageMenu + CharacterPage wiring: '+ Add page' opens a dialog titled 'Add page' listing store.availableTypes() with icon/name/description/18+ badge; picking a row appends the page, closes the dialog, focuses the new title; add button disappears once no types remain (D-09, D-11, D-12, CHAR-04)"
    requirement: "CHAR-04"
    verification:
      - kind: unit
        ref: "apps/web/src/app/components/add-page-menu/add-page-menu.component.spec.ts (2 tests)"
        status: pass
      - kind: unit
        ref: "apps/web/src/app/pages/character/character-page.component.spec.ts > CharacterPage: add page picker (4 tests: dialog contents, pick-appends-and-focuses-and-hides-button, provideTestPlugins remaining-type filtering, Escape closes without adding)"
        status: pass
      - kind: integration
        ref: "apps/web/src/app/integration/intimacy-page.integration.spec.ts (updated to drive the picker dialog instead of the removed direct-add click; real fake-indexeddb reload round trip still passes)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Development-only ?mode=view preview: VIEW_MODE_PREVIEW token (environment.viewModePreview) gates editorMode; in view mode every host gets mode='view'/cdkDragDisabled, the add control and empty-pages message hide, and a .preview-banner renders; a real production build never contains an enabled flag (D-13, D-14)"
    requirement: "CHAR-06"
    verification:
      - kind: unit
        ref: "apps/web/src/app/pages/character/character-page.component.spec.ts > CharacterPage: view mode preview (4 tests: preview+view, no-preview+view, preview+{undefined,edit,VIEW}, DI-default-equals-environment)"
        status: pass
      - kind: other
        ref: "pnpm --filter web exec ng build --configuration development && rg -q 'viewModePreview:\\s*true' apps/web/dist/character-dossier/browser --glob '*.js' (exit 0); pnpm --filter web exec ng build --configuration production && ! rg -q 'viewModePreview:\\s*(true|!0)' apps/web/dist/character-dossier/browser --glob '*.js' (exit 0, i.e. flag absent)"
        status: pass
      - kind: manual_procedural
        ref: "Plan's <human-check>: pnpm dev, compare /c/:id?mode=view against SPEC-intimacy-dossier 'View mode' at 400px/desktop, light/dark; then production build + wrangler:dev confirms the param is inert"
        status: pass
    human_judgment: true
    rationale: "Run by the orchestrator with Playwright (see Post-verification fix). Dev ?mode=view at 400/1280 px, light/dark: banner shown, no page-bar controls, no add control, no editable page inputs, no empty text fields, unset rating cards at 0.7 opacity, no horizontal overflow, zero console warnings. Add-page bottom sheet at 400px: 44px close target, no overflow, focus on first row. Production build under wrangler:dev: ?mode=view renders the normal editable page with no banner."

duration: 45 min
completed: 2026-09-14
status: complete
---

# Phase 02 Plan 07: Section Nav, Add-Page Picker, and Dev-Only View Mode Preview Summary

**Sticky SectionNav with scroll-spy, a reusable Modal/bottom-sheet shell backing an AddPageMenu picker that replaces the old direct-add button, and a VIEW_MODE_PREVIEW-gated `?mode=view` preview wired through angular.json's first environment-file fileReplacements.**

## Performance

- **Duration:** 45 min
- **Started:** 2026-09-14T16:23:00Z
- **Completed:** 2026-09-14T16:34:00Z
- **Tasks:** 3/3 completed
- **Files modified:** 21 (15 created, 6 modified)

## Accomplishments

- `SectionNav` (`cd-section-nav`): builds a `Header` + per-page + per-page-section pill list from `store.pages()` and each plugin's `sections`, tracks the topmost intersecting anchor via `IntersectionObserver` (`aria-current="true"`), and scrolls a clicked target (or its page's element, for a section not yet mounted) with no smooth-scroll animation. `CharacterPage` mounts it whenever pages exist and gives the header card `id="page-header"`.
- `Modal` (`cd-modal`): the base dialog / bottom-sheet shell from `SPEC-frontend-architecture.md` §8 — `cdkTrapFocus` auto-capture, Escape, target-checked backdrop close, focus restored to the opener on close via Angular's own `@if` destroying the trap directive. Desktop is a centered dialog; under 700px it becomes a bottom sheet with a grip and slide-in entrance.
- `AddPageMenu` (`cd-add-page-menu`): one picker row per available type (icon, display name, description, 18+ badge where adult), first row carries `[attr.cdkFocusInitial]`. `CharacterPage`'s `#add-page-button` now opens this inside `Modal` instead of directly adding the first available type; picking a row appends the page, closes the dialog, and focuses the new page's title (D-12).
- Dev-only `?mode=view` preview (D-13, D-14): `apps/web/src/environments/{environment.ts,environment.development.ts}` plus `angular.json`'s new development `fileReplacements`, consumed through the `VIEW_MODE_PREVIEW` injection token. `CharacterPage.editorMode` flips to `'view'` only when the token is true AND the `mode` input is the exact string `'view'`; in view mode every host gets `mode="view"`/`cdkDragDisabled`, the add control and empty-pages message hide, and a `.preview-banner` renders. Verified with a real dev-vs-production build diff, not just a unit test of the gating logic.

## Task Commits

Each task was committed atomically:

1. **Task 1: SectionNav with page and section pills, scroll-spy, and mounting on CharacterPage (CHAR-06, D-02 to D-04)** - `c837102` (feat)
2. **Task 2: Modal shell and AddPageMenu picker wired to "+ Add page" (CHAR-04, D-09, D-12)** - `1b6a124` (feat)
3. **Task 3: Development-only ?mode=view preview through fileReplacements (D-13, D-14)** - `bc8afe6` (feat)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified

- `apps/web/src/app/components/section-nav/section-nav.component.{ts,html,scss,spec.ts}` — `SectionNav`, `NavEntry`
- `apps/web/src/app/components/modal/modal.component.{ts,html,scss,spec.ts}` — `Modal`
- `apps/web/src/app/components/add-page-menu/add-page-menu.component.{ts,html,scss,spec.ts}` — `AddPageMenu`
- `apps/web/src/environments/environment.ts`, `environment.development.ts` — `environment.viewModePreview`
- `apps/web/src/app/pages/character/view-mode-preview.ts` — `VIEW_MODE_PREVIEW` token
- `apps/web/angular.json` — development `fileReplacements`
- `apps/web/src/app/pages/character/character-page.component.{ts,html,scss,spec.ts}` — `navEntries`, `addMenuOpen`/`onPick`, `mode`/`editorMode`, `.preview-banner`
- `apps/web/src/app/integration/intimacy-page.integration.spec.ts` — updated to drive the new picker dialog (deviation, see below)

## Decisions Made

- SectionNav's "keep current pill visible" behavior uses a `viewChildren('navLink')` query paired by index with `entries()`, not a `CSS.escape`d `querySelector` — avoids selector-escaping edge cases and stays index-stable since both arrays render in identical `@for` order.
- `AddPageMenu`'s `[attr.cdkFocusInitial]` is a plain attribute, confirmed (by reading the compiled `@angular/cdk` a11y source) to be the real mechanism `FocusTrap.focusInitialElement()` queries via `querySelector('[cdkFocusInitial]')` — not merely a test hook. The Modal spec proves this is live behavior via an `InteractivityChecker` override (jsdom reports zero-size elements as non-focusable by default).
- Discovered empirically that `@angular/build:unit-test` resolves the same `fileReplacements` as `serve`'s development configuration even though the `test` architect target defines no `configurations` block — `environment.viewModePreview` is `true` inside Vitest. Tests needing the `false` value override `VIEW_MODE_PREVIEW` explicitly; the token-default test asserts equality with the live `environment` import (not a hardcoded boolean) so it stays correct regardless of which environment the test builder resolves in the future.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated the pre-existing Intimacy-page integration spec to use the new picker dialog**
- **Found during:** Task 2
- **Issue:** `apps/web/src/app/integration/intimacy-page.integration.spec.ts` (not in this plan's `files_modified`, written in an earlier plan) clicked `#add-page-button` and asserted the page was added immediately — the exact 02-01 direct-add behavior this plan's Task 2 intentionally replaces ("`#add-page-button` click becomes `addMenuOpen.set(true)`, replacing the 02-01 direct add"). Left as-is, the full monorepo test suite would fail after Task 2's commit.
- **Fix:** Updated the click sequence to open the dialog, then click the resulting `.picker-row` for Intimacy Dossier (the only available type), keeping the rest of the reload-round-trip assertions unchanged.
- **Files modified:** `apps/web/src/app/integration/intimacy-page.integration.spec.ts`
- **Verification:** Full test re-run green (`pnpm test`: schema 65/65, web 225/225); the reload assertions (relationship context value survives) still pass unchanged.
- **Committed in:** `1b6a124` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — pre-existing test broken by this plan's intentional contract change, not a defect this plan introduced).
**Impact on plan:** None on scope; a one-file test-fixture update required for the monorepo suite to stay green after Task 2's `#add-page-button` behavior change.

## Issues Encountered

None beyond the deviation above.

## Post-verification fix

The orchestrator's Playwright run of the Task 3 human-check found overlapping section-nav pills at 400px: the global `.wrap` `* { min-width: 0 }` guard let each pill shrink below its `nowrap` label ("Intimacy Dossier" needed 130px in an 86px pill). `.section-nav a` now has `flex-shrink: 0`, so the nav scrolls horizontally instead; pinned by a compiled-CSS spec in `section-nav.component.spec.ts`. Re-check at 400px and 1280px: no overflowing pills, no overlaps, 44px heights, no page overflow. Commit `d772e9c`.

## User Setup Required

None — no external service configuration required.

## Known Stubs

None — every component wires to real data (`store.pages()`, `store.availableTypes()`, `SUBDOC_PLUGINS`) with no placeholder text or mock data paths.

## Deferred / WINDOWS.md Entries

- **(unrun-verify, not yet appended to WINDOWS.md — this dispatch's instructions reserve that file for the orchestrator):** Task 3's `<human-check>` — side-by-side comparison of `/c/:id?mode=view` against `SPEC-intimacy-dossier.md` "View mode" at 400px and desktop widths, light and dark themes, plus a manual production-build + `wrangler:dev` confirmation that the query param is inert. Browser automation is not available to this executor session; all automated checks (both spec files, dev-build-diff, production-build-diff, `pnpm test`, `pnpm --filter "web..." run build`, `pnpm --filter web run smoke:worker`) pass. Deferred for the orchestrator to run with Playwright (and record in WINDOWS.md) rather than blocking on a checkpoint.

## Next Phase Readiness

- Phase 2's remaining ROADMAP success criteria (unified page nav + add-page picker) are functionally complete and automated-test-proven; the one open item is the visual/UX human-check above, same status as 02-05's and 02-06's own deferred human-checks in this phase.
- `Modal` is generic and ready for the Phase 3 share dialog and Phase 6 print dialog to reuse as-is (per this plan's Flagged Assumptions and RESEARCH's resolved Open Question 1).
- `SectionNav` and `AddPageMenu` are registry-driven (read only `SUBDOC_PLUGINS` and the page list) — Phase 4's Gallery page type and Phase 8's second-generation plugins need no changes to either component, only a `sections` declaration and a `schema.displayName`/`description`/`adult`/`icon` on their own plugin object.
- This is the last plan of Phase 2 (wave 3, depends on 02-04/02-05/02-06); phase-level verification and the consolidated end-of-phase UAT batch (covering this plan's WINDOWS.md #2 alongside 02-05's D3 and 02-06's D6 deferred human-checks) are next.

---
*Phase: 02-intimacy-plugin-unified-page*
*Completed: 2026-09-14*

## Self-Check: PASSED

All 21 created/modified files confirmed present on disk with `[ -f ]`. All 3 task commit hashes (`c837102`, `1b6a124`, `bc8afe6`) confirmed in `git log --oneline`. Full monorepo suite (`pnpm test`: schema 65/65, web 225/225) and `pnpm --filter "web..." run build` (production build, no `anyComponentStyle` budget error) both re-run clean immediately before this SUMMARY was written; `pnpm --filter web run smoke:worker` passed against the production build.

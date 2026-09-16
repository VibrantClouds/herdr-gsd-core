# Phase 2: Intimacy Plugin & Unified Page - Context

**Gathered:** 2026-09-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Delivers the page host and the two plugin registries (`SCHEMA_REGISTRY`, `PLUGIN_REGISTRY`), the Intimacy Dossier as the first registered sub-document type (schema half + editor in both `edit` and `view` modes), and the unified character page mechanics: add page, remove page, reorder by drag and by keyboard, and a sticky section nav. Requirements: CHAR-04, CHAR-05, CHAR-06, INTM-01–05, DSGN-04.

Not in this phase: share page, API, adult interstitial (Phase 3); Gallery type and portrait pipeline (Phase 4); section selector and print dialog (Phase 6); library export/import (Phase 7).

The field inventory, data shape, scales, layout, meter accessibility and view-mode rendering of the Intimacy Dossier are already fixed by `docs/specs/SPEC-intimacy-dossier.md`. Host composition, store API, CDK reorder and `@defer` loading are fixed by `docs/specs/SPEC-subdocument-plugin-contract.md` and `docs/specs/SPEC-frontend-architecture.md` §3, §6. The decisions below cover only what those docs left open, or where this discussion changes them.

</domain>

<decisions>
## Implementation Decisions

### Page frame and section nav
- **D-01:** The host (`SubDocHost`) renders a slim chapter title bar — plugin icon, `displayName`, 18+ badge, drag handle, ▲ ▼, remove — and **not** an enclosing card. The plugin renders its own content below it. The Intimacy editor keeps the prototype's four separate cards (Anatomy & capacity, Themes, BDSM, Preferences) unchanged. No nested cards. In `view` mode the bar reduces to title + adult badge (per contract).
- **D-02:** The sticky section nav shows one pill per page **followed by that page's section pills** in a smaller, secondary style (e.g. `[HEADER] [INTIMACY] ·anatomy ·themes ·bdsm ·prefs`). Plugins declare these through a new **optional** `sections` list on the UI-half `SubDocumentPlugin` (label + anchor id). A plugin without `sections` gets only its page pill. Scroll-spy applies to section pills as well. — **Reversibility:** costly — changes the published plugin contract that Phase 8 types are written against; `docs/specs/SPEC-subdocument-plugin-contract.md` (UI half) and `docs/specs/SPEC-design-system.md` §4.2 must be updated in this phase.
- **D-03:** Section anchor ids must be unique on the page; namespace them by page type (e.g. `page-intimacy-themes`). `scroll-margin-top` applies to section cards as well as page bars.
- **D-04:** Nav visibility: shown whenever the character has **at least one page**; hidden only when the character has no pages. This replaces the design-system rule "hidden when there is one page". Still hidden in print. The share-page rule (Phase 3) follows the same logic. `docs/specs/SPEC-design-system.md` §4.2 and `docs/specs/SPEC-frontend-architecture.md` §6 must be updated.
- **D-05:** Drag-and-drop on tall pages: pressing the drag handle **collapses every page to its title bar** for the duration of the drag; after drop (or cancel) pages expand and the viewport scrolls to the moved page. ▲ ▼ buttons do not collapse anything. Reduced-motion rules from SPEC-design-system §6 still apply.

### Removing a page
- **D-06:** Remove has **no confirm step**. The page is removed immediately and a snackbar shows "<displayName> removed · Undo" for about 8 seconds. Undo re-inserts the page at its original index with its original data. This replaces "remove button with confirm" in the plugin contract's host behaviour. `SnackbarService` gains an action (label + callback) capability.
- **D-07:** The removal is persisted by the normal autosave path (500 ms debounce) — no pending-removal state. The undo payload lives only in memory; navigating away from the character page, reloading, or the snackbar expiring discards it. Undo itself is a normal store mutation and autosaves again.
- **D-08:** Every removal shows the undo snackbar, including pages still equal to `createDefault()`.

### Add page control
- **D-09:** A "+ Add page" button below the last page opens a picker listing `store.availableTypes()` with icon, `displayName`, `description` and 18+ badge. Bottom sheet under 700 px. Selecting a row calls `store.addPage(type)` (appended last) and closes the picker.
- **D-10:** A new character starts with **no pages**. The adult Intimacy page is never added automatically.
- **D-11:** When a character has no pages, a muted line "This dossier has no pages yet." sits under the header, above the add control.
- **D-12:** When every registered type is present, the add control is **hidden** (not disabled). In Phase 2 this happens as soon as Intimacy is added.

### View mode
- **D-13:** The Intimacy editor's `view` mode is built **fully in Phase 2** per SPEC-intimacy-dossier "View mode" and SPEC-design-system §4.6–4.10 (static meters with level word, empty text fields omitted, unset rating cards at 70 % opacity, slider as static track with emphasised word), covered by component specs. The host's view-mode chrome reduction is built too.
- **D-14:** A **dev-build-only** preview: `/c/:id?mode=view` renders the character page in `view` mode for visual UAT. It must be absent from production builds (compile-time, e.g. environment flag / file replacement), so ADR-0003's "no edit-mode toggle" holds for users.

### Claude's Discretion
- Keyboard focus target after a page is removed and after Undo (e.g. next page's title bar, or the add control when none remain).
- Picker presentation on desktop (anchored popover vs. centered dialog), provided it follows SPEC-frontend-architecture §8 modal conventions if it is a dialog.
- Meter keyboard mapping: the two specs differ (SPEC-intimacy-dossier: Space on the checked radio clears; SPEC-design-system §4.7: Space toggles, Home/End jump, Delete/Backspace clears, focus ring on the group). Implement the union, reconcile the two spec texts, and pick roving-tabindex vs. group focus per current ARIA APG guidance.
- Exact undo snackbar duration (~8 s) and the aria-live wording for reorder announcements ("Intimacy Dossier moved to position 1 of 2").
- How section pills are visually de-emphasised, within the design tokens.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Intimacy Dossier type
- `docs/specs/SPEC-intimacy-dossier.md` — full field inventory (46 rating cards, 2 sliders, 10 text fields + capacity fields), ids, scales, `IntimacyDossierV1` shape, `createDefault`, layout, DSGN-04 meter semantics, view mode
- `docs/prototype/character-dossier.html` — visual and behavioural source for the editor (cards, meters, sliders, autosize, section nav)
- `docs/adr/0001-code-defined-subdocument-templates.md` — fixed lists, one instance per type per character

### Page host and plugin contract
- `docs/specs/SPEC-subdocument-plugin-contract.md` — schema half, UI half, host behaviour, "what counts as a host change"; **to be updated** for D-02 (optional `sections`) and D-06 (undo instead of confirm)
- `docs/specs/SPEC-frontend-architecture.md` §1 (layout: `subdocs/`, `components/section-nav`, `meter`, `lean-slider`, `autosize-textarea`, `drag-handle`), §3 (`CharacterStore` API: `addPage`, `removePage`, `reorder`, `updatePage`, `availableTypes`), §6 (unified page composition, `@defer (on viewport)`, CDK reorder, aria-live), §8 (modal/bottom-sheet conventions), §9 (Angular conventions), §12 (invariants); **to be updated** for D-04
- `docs/adr/0003-unified-edit-in-place-page.md` — one scrolling page, array order is display order, no edit-mode toggle
- `docs/adr/0016-angular-signals-no-ui-framework.md` — standalone, signals, zoneless, only `@angular/cdk/drag-drop` (+ `@angular/cdk/a11y`)

### Versioning and validation
- `docs/specs/SPEC-serialization-policy.md` — per-plugin version, migrations, fixture requirement
- `docs/adr/0011-per-plugin-schema-versioning.md` — independent plugin version space
- `docs/adr/0013-adult-gate-interstitial.md` — `adult` flag semantics (INTM-05)

### Design
- `docs/specs/SPEC-design-system.md` §4.2 (section nav; **to be updated** for D-02, D-04), §4.3 (card, drag states), §4.4–4.10 (subhead, field grid, rating card, meter, lean slider, capacity fields, autosize textarea), §4.12 (toast), §4.15 (drag handle), §4.16 (dialog/bottom sheet), §6 (motion, reduced motion for CDK), §7 (accessibility checklist)
- `docs/adr/0015-visual-direction-evolve-dossier.md` — prototype look, anti-patterns

### Planning
- `.planning/REQUIREMENTS.md` — CHAR-04–06, INTM-01–05, DSGN-04
- `.planning/STATE.md` — open advisory: add an out-of-order migration sort spec (WR-02) once this phase registers the first plugin migrations

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/web/src/app/stores/character.store.ts`: `CharacterStore` already has `character`, `core`, `pages`, `dirty`, `restoring`, `load`, `updateCore`, `flush`, and the 500 ms autosave effect + `visibilitychange`/`pagehide` flush. Missing: `updatePage`, `addPage`, `removePage`, `reorder`, `availableTypes`.
- `apps/web/src/app/services/snackbar.service.ts`: `show(message, opts)`, `showInfo/showSuccess/showError`, `dismiss()` — needs an action button for D-06.
- `apps/web/src/app/components/character-header/`: signal input + `coreChange` output pattern to mirror for `SubDocumentEditor` (`data` / `dataChange`); uses `[attr.maxlength]` (NG8002 workaround).
- `packages/schema/src/plugin.ts`: `SubDocumentSchema` interface and an empty frozen `SCHEMA_REGISTRY` — the Intimacy schema is its first entry.
- `packages/schema/src/migrate.ts`: `validateSubDocument` already runs at the repo load boundary for every page; `computeAdult` lives here.
- `packages/schema/src/limits.ts`: single source for string caps (add 200 / 4,000 caps here if not present).
- `packages/schema/src/__tests__/fixture-guard.spec.ts` + `fixture-coverage.ts`: guard must pick up `plugins/intimacy/fixtures/1.0.0.json`.

### Established Patterns
- Zoneless, OnPush, `input()`/`output()`, `@if`/`@for` with `track` — every Phase 1 component follows this.
- `CharacterPage` guards re-entrant `load()` with `loadingId`; do not regress it when adding the page list.
- Errors at load: `UnsupportedVersionError` / `InvalidDocumentError` → snackbar + redirect to `/`.
- Integration specs against real IndexedDB live in `apps/web/src/app/integration/` (`autosave-persist.integration.spec.ts` is the model for the "all 46 cards + sliders + text survive reload" and "reorder persists" specs).
- Library delete uses `window.confirm` — intentionally **not** reused for page removal (D-06).

### Integration Points
- `apps/web/src/app/pages/character/character-page.component.html`: currently header card + save status; the section nav, page list (`cdkDropList`), empty-state hint and add control mount here.
- New directories: `apps/web/src/app/subdocs/` (`plugin.ts`, `subdoc-host/`, `intimacy/`), `packages/schema/src/plugins/intimacy/`.
- `@angular/cdk` is **not yet a dependency** of `apps/web` — add it (drag-drop, a11y).
- Dev-only preview (D-14) needs an environment/build-configuration mechanism; `apps/web/src/environments/` does not exist yet.

</code_context>

<specifics>
## Specific Ideas

- Nav example the user approved: `[HEADER] [INTIMACY] ·anatomy ·themes ·bdsm ·prefs [GALLERY]` — page pills primary, section pills smaller.
- Undo snackbar text shape: "Intimacy Dossier removed · Undo".
- Empty state text: "This dossier has no pages yet."
- The Intimacy page must look like the prototype: four separate cards under a slim chapter bar.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 02-intimacy-plugin-unified-page*
*Context gathered: 2026-09-14*

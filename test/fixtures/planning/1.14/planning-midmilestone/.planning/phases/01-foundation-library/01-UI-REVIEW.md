# Phase 1 — UI Review

**Audited:** 2026-09-11
**Baseline:** docs/specs/SPEC-design-system.md (project design contract), abstract 6-pillar standards for anything the spec doesn't cover
**Screenshots:** not captured — the only server on this project's configured dev ports (4200) was an unrelated third-party Microsoft SSO login page (Armstrong Group tenant), not the CharacterDossier Angular app. No `ng serve`/`wrangler dev` process for this project was found listening. Audit is code-only, evidence taken directly from `.scss`/`.html`/`.ts` source.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 4/4 | Every CTA, empty state, and error message is bespoke and situation-specific; no generic labels found |
| 2. Visuals | 3/4 | Strong hierarchy via tokens, but native `window.confirm()` for delete breaks the editorial visual language |
| 3. Color | 4/4 | Palette is a 1:1, single-source port of the spec's light/dark tables; accent used sparingly (links, primary button, focus, selected segment) |
| 4. Typography | 4/4 | All content typography comes from `--text-*` tokens; a few untokenized chrome literals (18px wordmark, 13px segmented label) are minor, not scale drift |
| 5. Spacing | 4/4 | `--space-*` tokens used throughout; the few raw px values match the spec's own literal component specs (section 4) verbatim |
| 6. Experience Design | 2/4 | Unexpected `CharacterStore.load()` errors are rethrown uncaught inside a fire-and-forget effect — silent failure with no user feedback; no loading affordance on the library list |

**Overall: 21/24**

---

## Top 3 Priority Fixes

1. **Unhandled promise rejection on unexpected load errors (`character-page.component.ts:53-63`)** — `loadCharacter()`'s catch block only handles `CharacterNotFoundError`/`UnsupportedVersionError`/`InvalidDocumentError`; any other error (e.g. a `StorageUnavailableError` mid-navigation, an IndexedDB transaction failure) falls to `else { throw err; }` inside `void this.loadCharacter(id)` — an unhandled rejection with zero UI feedback. User is left staring at a page that never renders the header and never explains why. Fix: add a catch-all branch that shows a generic "Something went wrong opening this character" snackbar and navigates home, same pattern as the three handled cases.

2. **No loading affordance on the Library page (`library-page.component.html:15`, `library.store.ts:19`)** — `store.loading()` is only used to suppress the "No characters yet" empty state from flashing before the first `refresh()` resolves; there is no visible skeleton, spinner, or "Loading…" text during that window, so on a slow IndexedDB open (or the in-memory-fallback path added in 01-04) the user sees a blank page under the header with no indication anything is happening. Fix: render a lightweight loading line (matching the `.loading-line` pattern already used on `CharacterPage`) while `store.loading()` is true.

3. **Destructive delete uses native `window.confirm()` (`library-page.component.ts`, referenced from `01-05-SUMMARY.md`)** — every other surface in this phase (toasts, buttons, cards, fields) follows the burgundy-on-paper editorial system in `SPEC-design-system.md`; a native browser confirm dialog is an unstyled, un-themed interruption that breaks that system exactly at the highest-stakes action (irreversible delete). Section 4.16 of the spec already defines a Dialog/bottom-sheet component vocabulary this could use. Acceptable as a phase-1 tracer shortcut, but flag it now rather than let it silently become the permanent pattern once more destructive actions (page removal, share revocation) are added in later phases.

---

## Detailed Findings

### Pillar 1: Copywriting (4/4)
- Empty state: "No characters yet" / "Create your first character to see it here." — specific, actionable (`library-page.component.html:17-18`).
- Rejected-records notice explains cause and reassures no data was altered: "...were saved by a newer version of Character Dossier or are damaged, and have not been changed." (`library-page.component.html:9-12`).
- Load-error copy is differentiated per failure mode, each explicitly stating the record was left untouched (`character-page.component.ts:8-10`): not-found, unsupported-version, invalid-document all get distinct, honest messages — not a single generic "Something went wrong."
- Action labels are contextual: `aria-label="Duplicate {name}"` / `"Delete {name}"` rather than bare "Duplicate"/"Delete" for assistive tech (`library-page.component.html:37,45`).
- Save-status line uses plain-language states ("Saving…" / "All changes saved") rather than technical terms (`character-page.component.html:9-11`).
- No grep hits for generic `Submit`/`OK`/`Cancel`/`Click Here`/`went wrong`-without-context patterns anywhere in `apps/web/src`.

### Pillar 2: Visuals (3/4)
- Clear focal point on the character page: the masthead's portrait frame + large `--text-title` name draws the eye first, exactly as `SPEC-design-system.md §4.1` intends.
- Icon-only elements are labeled: the sticky-toast dismiss `✕` button carries `aria-label="Dismiss"` (`snackbar.component.html`); no other icon-only controls exist yet in this phase.
- Hierarchy is real, not just font-size noise: eyebrow (11px mono muted) → title (clamp 26-40px display) → meta fields (14.5px body) → field labels (11px mono uppercase) is a deliberate four-tier scale matching the spec.
- **Gap:** delete uses `window.confirm()` (see Priority Fix #3) — a jarring, unstyled OS dialog inside an otherwise fully-themed surface. This is a visible, real inconsistency a user will notice on the very first destructive action they take.
- Portrait frame is monogram-only for the entirety of Phase 1 (no image upload until Phase 4) — this is explicitly scoped as expected per `SPEC-design-system.md §4.1` ("exact frame sizing is decided in Phase 4"), not a defect.

### Pillar 3: Color (4/4)
- `_theme.scss` reproduces the spec's color table exactly, token-for-token, light and dark (`_theme.scss:6-53` vs `SPEC-design-system.md §1.1`); dark values are declared once as a `$dark` SCSS map and mixed into both the media-query and `data-theme` blocks so they structurally cannot drift (`_theme.scss:26-31`).
- Accent (`var(--accent)`) usage is restrained: 14 occurrences across the codebase, all on links, the primary button, focus rings, meta-field focus borders, and the selected theme-segment state — no decorative overuse.
- Zero hardcoded hex/rgb colors found outside `_theme.scss` itself (`grep -rln "#[0-9a-fA-F]{3,8}" apps/web/src --include=*.scss` returns only the token file).
- Danger/success semantics correctly reserved for their roles (`button.danger`, `.toast.error`, `.toast.success`) rather than reused decoratively.

### Pillar 4: Typography (4/4)
- Every content typography role (title, h2, body, input, hint, label, eyebrow) pulls from `--text-*` tokens defined once in `_theme.scss` and used identically across `styles.scss`, `character-header.component.scss`, `library-page.component.scss`.
- Font stacks (`--font-display`/`--font-body`/`--font-mono`) match the spec's Fraunces/Source Sans 3/IBM Plex Mono assignment with real fallback stacks (`_theme.scss:59-61`).
- Minor, non-blocking: three untokenized literal sizes exist outside the content-typography table — the app wordmark (`18px`, `app.component.scss:16`), the segmented theme-control label (`13px`, `app.component.scss:78`), and the toast dismiss glyph (`16px`, `snackbar.component.scss`). These are app-chrome, not prose/field typography, and the spec's token table doesn't claim to cover chrome — noted for future token-table expansion, not a violation.

### Pillar 5: Spacing (4/4)
- `--space-1` through `--space-10` used consistently for margins/gaps/padding across every component file audited.
- The raw pixel values that do appear (button `8px 13px`, field `9px 11px`, card `24px 24px 26px`, toast `10px 18px`) are not arbitrary — they are the spec's own literal component measurements in `SPEC-design-system.md §4.3/4.5/4.11/4.12`, reproduced verbatim.
- `.wrap` gutter correctly implements the "never below 16px" rule via `padding: 0 max(16px, var(--gutter)) 80px` (`styles.scss:27`), matching `§3`.
- 400px-safe patterns are structurally present: `min-width: 0` on `.wrap` descendants, `overflow-wrap: anywhere`, flex-wrap on header/row actions — though the actual no-horizontal-scroll behavior at 400px remains an open `<human-check>` per every Phase 1 SUMMARY (01-04 D3, 01-05 D6, 01-06 D5), not yet verified against a live viewport.

### Pillar 6: Experience Design (2/4)
- Autosave is well covered: 500ms debounce, reference-identity suppression during load, `pagehide`/`visibilitychange` flush, first-write-only persistence request (`character.store.ts`, verified by 10 unit tests + an integration spec per 01-06-SUMMARY).
- Storage-blocked fallback is real UX, not just a stub: in-memory backend plus a sticky, dismiss-button snackbar explaining the situation (`app.component.ts:39`, `native-indexeddb.service.ts`).
- Load-boundary error routing (not-found / unsupported-version / invalid-document) is specific and non-destructive — each path leaves the stored record untouched and explains why (Priority Fix context above).
- **Gap (Priority Fix #1):** the same `loadCharacter()` method that handles three named error types falls through to an uncaught `throw` for anything else, producing a silent failure with no snackbar and no navigation — a real path to a stuck, blank character page.
- **Gap (Priority Fix #2):** no visible loading state on the Library page during the initial `refresh()` — `store.loading()` exists but is only used to gate the empty-state message, not to render any loading affordance of its own.
- Delete is confirm-gated (native `confirm()`, Priority Fix #3) — functionally safe, but not integrated into the app's own dialog vocabulary.
- Disabled states are handled correctly where present: "New character" disables during `store.creating()` with a shared in-flight promise guard preventing duplicate characters from a double-click (`library.store.ts`, 01-05-SUMMARY D4).

---

## Files Audited

- `docs/specs/SPEC-design-system.md`
- `apps/web/src/styles.scss`
- `apps/web/src/styles/_theme.scss`
- `apps/web/src/app/app.component.{ts,html,scss}`
- `apps/web/src/app/pages/library/library-page.component.{ts,html,scss}`
- `apps/web/src/app/pages/character/character-page.component.{ts,html,scss}`
- `apps/web/src/app/components/character-header/character-header.component.{ts,html,scss}`
- `apps/web/src/app/components/snackbar/snackbar.component.{ts,html,scss}`
- `apps/web/src/app/stores/library.store.ts`
- `apps/web/src/app/stores/character.store.ts`
- `apps/web/src/app/services/native-indexeddb.service.ts`
- All six `.planning/phases/01-foundation-library/01-0[1-6]-SUMMARY.md` and matching `-PLAN.md` files

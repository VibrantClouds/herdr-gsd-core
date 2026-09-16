---
phase: 01-foundation-library
plan: 06
subsystem: ui
tags: [angular-signals, autosave, indexeddb, routing, tdd]

requires:
  - phase: 01-foundation-library
    provides: "CharacterRepo load boundary (01-01/01-03), SnackbarService and design tokens (01-04), LibraryStore/LibraryPage create+duplicate+delete (01-05)"
provides:
  - "CharacterStore: character/core/pages/dirty/restoring signals, load/updateCore/flush, 500ms autosave effect, pagehide/visibilitychange flush, first-write-only persistence request"
  - "CharacterHeader: masthead with name/species/pronouns/orientation inputs and a non-circular monogram portrait frame (D-P1)"
  - "CharacterPage at /c/:characterId: uuidv4 pre-check, load-error routing with specific snackbar messages, save-status line, header composition"
  - "Route c/:characterId (lazy) plus withComponentInputBinding(); LibraryPage's New character awaits store.create() and navigates to the new character"
affects: ["02-*"]

actuals:
  tokens: 10464
  tasks: 3
  commits: 6

plan_head_before: 0eb4dab57bab8575c2bc8d6a0601dcb6680aa5d1

tech-stack:
  added: []
  patterns:
    - "Autosave suppression by reference identity: the effect compares character() against a private lastPersisted field (not just restoring()), because by the time a zoneless effect runs, load()'s finally has already reset restoring() back to false — the reference check is what actually blocks the load-triggered save (ADR-0003)"
    - "Root-effect re-entrancy guard: CharacterPage tracks a private loadingId and skips loadCharacter when the effect callback re-fires for an id it has already started loading, since a change-detection pass can re-invoke an unchanged-dependency effect and a repeat store.load() would otherwise clobber a live edit with a stale re-fetch"
    - "Control-char stripping exported as a pure function (stripControlCharsExceptTabAndNewline) so the TAB/LF-kept half of the rule is unit-testable directly — a single-line <input>'s value-sanitization algorithm strips LF before any JS runs, so a real DOM input event can only prove the BEL/CR-stripped half"

key-files:
  created:
    - apps/web/src/app/stores/character.store.ts
    - apps/web/src/app/stores/character.store.spec.ts
    - apps/web/src/app/integration/autosave-persist.integration.spec.ts
    - apps/web/src/app/components/character-header/character-header.component.ts
    - apps/web/src/app/components/character-header/character-header.component.html
    - apps/web/src/app/components/character-header/character-header.component.scss
    - apps/web/src/app/components/character-header/character-header.component.spec.ts
    - apps/web/src/app/pages/character/character-page.component.ts
    - apps/web/src/app/pages/character/character-page.component.html
    - apps/web/src/app/pages/character/character-page.component.scss
    - apps/web/src/app/pages/character/character-page.component.spec.ts
  modified:
    - apps/web/src/app/app.routes.ts
    - apps/web/src/app/app.config.ts
    - apps/web/src/app/pages/library/library-page.component.ts
    - apps/web/src/app/pages/library/library-page.component.spec.ts

key-decisions:
  - "CharacterPage's characterId effect guards against re-entrant firing with a loadingId field — a change-detection pass can re-run an effect whose tracked signal value hasn't changed, and without the guard a repeat store.load() call overwrites an in-progress, unsaved edit with the record just re-fetched from IndexedDB (Rule 1 bug, found writing the save-status test)"
  - "CharacterHeader's maxlength binding uses [attr.maxlength], not [maxlength] — Angular's DOM schema registry does not recognize 'maxlength' as a bindable property of <input> (NG8002); attr binding writes the HTML attribute directly and the browser reflects it to the maxLength IDL property (Rule 3 blocking fix)"
  - "stripControlCharsExceptTabAndNewline is exported from character-header.component.ts so the control-char stripping rule can be unit-tested independent of DOM value sanitization"

requirements-completed: [CHAR-01, CHAR-03, SCHM-03, DSGN-02]

coverage:
  - id: D1
    description: "CharacterStore autosaves within 500ms of the last edit, resets the debounce on each edit, suppresses autosave for the whole of load(), flushes on tab-hide/pagehide, and requests persistent storage only after the first successful write"
    requirement: CHAR-03
    verification:
      - kind: unit
        ref: "apps/web/src/app/stores/character.store.spec.ts (10 tests)"
        status: pass
      - kind: integration
        ref: "apps/web/src/app/integration/autosave-persist.integration.spec.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "CharacterHeader masthead: name/species/pronouns/orientation inputs in DOM order with correct labels and maxlength caps, control-character stripping, and a bordered, aspect-ratio 3:4, never-circular monogram portrait frame (D-P1)"
    requirement: CHAR-01
    verification:
      - kind: unit
        ref: "apps/web/src/app/components/character-header/character-header.component.spec.ts (9 tests)"
        status: pass
      - kind: other
        ref: "rg checks: aspect-ratio 3/4 present, radius-full|50% absent, Intl.Segmenter present, 4x maxlength"
        status: pass
    human_judgment: false
  - id: D3
    description: "CharacterPage validates the id with the schema's uuidv4 check before any repo lookup, and routes CharacterNotFoundError/UnsupportedVersionError/InvalidDocumentError to '/' each with a specific snackbar message, never mutating the stored record"
    requirement: SCHM-03
    verification:
      - kind: unit
        ref: "apps/web/src/app/pages/character/character-page.component.spec.ts (5 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Create lands on /c/:id: LibraryPage's New character awaits store.create() and navigates to ['/c', id]; the character page renders the header, edits forward through store.updateCore, and the save-status line toggles Saving.../All changes saved"
    requirement: CHAR-01
    verification:
      - kind: unit
        ref: "apps/web/src/app/pages/library/library-page.component.spec.ts (New character navigates), character-page.component.spec.ts (valid-id render/edit/status test)"
        status: pass
    human_judgment: true
    rationale: "The full click-through (New character -> /c/:id -> fill fields -> back -> see it in the library, at 400px width) is the plan's own <human-check> and needs a live browser; unit tests prove each piece (navigate call, header render, store wiring) but not the end-to-end Router-driven flow. Deferred to end-of-phase UAT per workflow.human_verify_mode=end-of-phase."
  - id: D5
    description: "Under 700px the header meta fields stack to one column in DOM order, and the portrait frame sits above the name at 400px width (DSGN-02 ordering edge)"
    requirement: DSGN-02
    verification: []
    human_judgment: true
    rationale: "Declared verification: backstop in the plan's must_haves — a responsive-layout truth that needs a human resizing a live browser window, not an automatable assertion. Deferred to end-of-phase UAT."

duration: 24min
completed: 2026-09-11
status: complete
---

# Phase 1 Plan 6: Character Page with Autosave Summary

**CharacterStore (500ms debounced whole-document autosave, restoring suppression, tab-hide flush), CharacterHeader (non-circular monogram masthead), and CharacterPage (`/c/:characterId` with total-rejection load-error routing) — create now lands on the edit-in-place character page.**

## Performance

- **Duration:** 24 min
- **Started:** 2026-09-11T21:20:00Z
- **Completed:** 2026-09-11T21:44:00Z
- **Tasks:** 3
- **Files modified:** 15 (11 created, 4 modified; 6 commits)

## Accomplishments

- `CharacterStore`: `character`/`core`/`pages`/`dirty`/`restoring` signals, `load`/`updateCore`/`flush`, a 500ms debounced autosave `effect()` suppressed by reference identity against `lastPersisted` (not just `restoring()`, since the effect runs after `load()`'s `finally` already reset it), `pagehide`/`visibilitychange`-hidden flush, and `CharacterNotFoundError`
- `CharacterHeader` (`cd-character-header`): eyebrow, `Intl.Segmenter`-based grapheme-aware monogram (uppercased, empty for an empty name), name/species/pronouns/orientation inputs (maxlength 120/200), BEL/CR stripped while TAB/LF are kept, and a bordered `aspect-ratio: 3 / 4` portrait frame that is never a circle or square (D-P1)
- `CharacterPage` (`cd-character-page`) at `c/:characterId`: uuidv4 pre-check before any repo lookup, `CharacterNotFoundError`/`UnsupportedVersionError`/`InvalidDocumentError` each route to `/` with a specific snackbar message and leave the stored record unchanged, header composition with a `Saving…`/`All changes saved` status line, and a `loadingId` guard against a re-entrant effect clobbering a live edit
- `app.routes.ts`/`app.config.ts`: lazy `c/:characterId` route plus `withComponentInputBinding()`; `LibraryPage`'s New character now awaits `store.create()` and navigates to `['/c', id]`

## Task Commits

Each task followed the TDD RED -> GREEN cycle (no REFACTOR commit needed — all three GREEN implementations were clean on the first pass):

1. **Task 1 RED: failing CharacterStore/integration tests** - `702e1fc` (test)
2. **Task 1 GREEN: CharacterStore autosave/restoring/flush** - `7309a3b` (feat)
3. **Task 2 RED: failing CharacterHeader tests** - `e6df2b1` (test)
4. **Task 2 GREEN: CharacterHeader masthead + monogram frame** - `89c0b58` (feat)
5. **Task 3 RED: failing CharacterPage/LibraryPage tests** - `29d8fe1` (test)
6. **Task 3 GREEN: CharacterPage route + create-then-navigate** - `b067fbe` (feat)

**Plan metadata:** committed alongside this SUMMARY.

## TDD Gate Compliance

| Task | RED | GREEN | REFACTOR | Status |
|------|-----|-------|----------|--------|
| Task 1 (CharacterStore) | `702e1fc` (all 10 target cases genuinely failed: real assertion mismatches and `Error: not implemented`, not compile/import crashes) | `7309a3b` (10/10 pass) | none needed | Pass |
| Task 2 (CharacterHeader) | `e6df2b1` (4/9 target behavior cases genuinely failed on real assertion mismatches; the other 5 structure-only cases passed unchanged against the already-built HTML markup, a real assertion over real data, not a tautology — same pattern documented in 01-05's SUMMARY) | `89c0b58` (9/9 pass) | none needed | Pass |
| Task 3 (CharacterPage/LibraryPage) | `29d8fe1` (all 6 target cases genuinely failed: real timeouts on `navigateSpy`/`showErrorSpy` assertions against stubs) | `b067fbe` (13/13 pass, full suite 59/59) | none needed | Pass |

`gsd_run check tdd-red-evidence` was not invoked — as noted in every prior Phase 1 SUMMARY, it parses Node's `--test` TAP output and this project's Vitest-backed `@angular/build:unit-test` runner produces a different format. RED compliance was verified manually for every RED commit by reading the full Vitest failure output before committing: each failure traces to the missing target behavior (a thrown `not implemented`, a stub returning `''`/no-op, a compile-time stub with no navigation call), never an import/compile/fixture crash.

## Files Created/Modified

- `apps/web/src/app/stores/character.store.ts`, `character.store.spec.ts` — autosave store and its 10 unit tests
- `apps/web/src/app/integration/autosave-persist.integration.spec.ts` — create, load, edit four core fields, reload, all four survive
- `apps/web/src/app/components/character-header/` — `CharacterHeader` (`.ts`/`.html`/`.scss`) and its 9 unit tests
- `apps/web/src/app/pages/character/` — `CharacterPage` (`.ts`/`.html`/`.scss`) and its 5 unit tests
- `apps/web/src/app/app.routes.ts` — added the lazy `c/:characterId` route
- `apps/web/src/app/app.config.ts` — added `withComponentInputBinding()`
- `apps/web/src/app/pages/library/library-page.component.ts`, `.spec.ts` — `createCharacter()` now awaits `store.create()` and navigates; added the navigate-to-new-character test

## Decisions Made

- `CharacterPage`'s `characterId` effect guards against re-entrant firing with a private `loadingId` field. Discovered while writing the save-status test: a change-detection pass can re-run an `effect()` whose tracked signal value is unchanged, and without the guard a repeat `store.load()` call overwrote an in-progress, unsaved edit with the record just re-fetched from IndexedDB.
- `[attr.maxlength]` instead of `[maxlength]` in `CharacterHeader`'s template — Angular's DOM schema registry does not recognize `maxlength` as a bindable property of `<input>` (`NG8002`); attribute binding writes the HTML attribute directly and the browser reflects it to the `maxLength` IDL property, so `HTMLInputElement.maxLength` still reads correctly in tests.
- `stripControlCharsExceptTabAndNewline` is exported from `character-header.component.ts` rather than kept private, because a single-line `<input>`'s value-sanitization algorithm strips LF out of `.value` before any JS runs — the "TAB and LF are kept" half of the stripping rule can only be proven by calling the function directly, not by dispatching a DOM input event.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] CharacterPage's characterId effect could re-invoke loadCharacter for an unchanged id, clobbering a live edit**
- **Found during:** Task 3, writing the valid-id render/edit/save-status test
- **Issue:** The constructor's `effect(() => { const id = this.characterId(); void this.loadCharacter(id); })` fired again on a later change-detection pass even though `characterId()`'s value had not changed, and each re-fire re-ran `store.load(id)` — re-fetching the original stored record and overwriting an edit made in the meantime.
- **Fix:** Added a private `loadingId` field; the effect body returns early when `id === this.loadingId`, so `loadCharacter` runs at most once per distinct id.
- **Files modified:** `apps/web/src/app/pages/character/character-page.component.ts`
- **Verification:** `character-page.component.spec.ts`'s save-status test asserts `store.character()?.core.name` still holds the edited value after the debounce window; full web suite green (59/59)
- **Committed in:** `b067fbe` (Task 3 GREEN commit)

**2. [Rule 3 - Blocking] `[maxlength]` property binding is not a known property of `<input>` in Angular's DOM schema**
- **Found during:** Task 2, first `ng test` run on `character-header.component.spec.ts`
- **Issue:** `NG8002: Can't bind to 'maxlength' since it isn't a known property of 'input'` — compile error, blocking the whole test bundle.
- **Fix:** Switched the four `[maxlength]` bindings to `[attr.maxlength]`.
- **Files modified:** `apps/web/src/app/components/character-header/character-header.component.html`
- **Verification:** build and tests pass; `HTMLInputElement.maxLength` reads correctly in the spec (browser reflects the attribute)
- **Committed in:** `89c0b58` (Task 2 GREEN commit, folded into the RED stub's markup which was already correct — the fix landed before the RED/GREEN split since it is a template-compile issue affecting both stub and real implementation identically)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking).
**Impact on plan:** Both auto-fixes necessary for correctness (Rule 1) and compilation (Rule 3). No scope creep.

## Issues Encountered

- A DOM-level test for "BEL and CR stripped, TAB and LF kept" could not exercise the LF half through a real `<input>` `input` event: the HTML value-sanitization algorithm strips LF out of a single-line text input's `.value` before any application JS runs, in both real browsers and jsdom. Resolved by exporting the stripping function and unit-testing it directly for the LF case, while the DOM-dispatched test covers the BEL/CR/TAB case that is actually DOM-observable (see Decisions).
- `gsd_run check tdd-red-evidence`'s Node `--test` TAP parser does not apply to this project's Vitest-backed Angular test runner (same finding as every prior Phase 1 plan) — RED compliance was verified manually per commit instead.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 1 (Foundation + Library) is now feature-complete for its scope: create/open/duplicate/delete characters, autosave with tab-hide flush, total-rejection load-boundary routing, and the D-P1-scoped portrait frame are all in place.
- Two coverage items (D4's full click-through, D5's 400px responsive stacking) are deferred to end-of-phase UAT per `workflow.human_verify_mode=end-of-phase`, alongside the two carried over from 01-04 (OS dark-mode follow, 400px/44px shell) and one from 01-05 (400px library row actions) — five `<human-check>` items total awaiting one consolidated UAT pass.
- Page add/remove/reorder (`CharacterStore.updatePage`/`addPage`/`removePage`/`reorder`), the section nav, and the plugin registry are explicitly out of scope here and land in Phase 2 (CHAR-04/05) — `CharacterStore.pages` is already a read-only `computed()` ready for those methods to be added without touching the autosave effect.
- No blockers for Phase 2 planning.

---
*Phase: 01-foundation-library*
*Completed: 2026-09-11*

## Self-Check: PASSED

- All 11 created files verified present on disk (`[ -f ]`).
- All 6 task commits (`702e1fc`, `7309a3b`, `e6df2b1`, `89c0b58`, `29d8fe1`, `b067fbe`) verified in `git log --oneline --all`.
- Every task's `<acceptance_criteria>` re-run and passing (rg checks for `untracked(`, `lastPersisted`, `'pagehide'`, `'visibilitychange'`, absence of `navigator.storage`; `aspect-ratio: 3 / 4` present and `radius-full|50%` absent; `Intl.Segmenter` present; 4x `maxlength`; `c/:characterId` and `loadComponent` in routes; `withComponentInputBinding` in app.config; `navigate(['/c'` in library page).
- Plan-level `<verification>`: `pnpm --filter "web..." run build` exits 0; `pnpm --filter @dossier/schema build && pnpm --filter web exec ng test --watch=false` exits 0 (59/59); `pnpm -r test` exits 0 (schema 36/36, web 59/59).

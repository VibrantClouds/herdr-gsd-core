---
phase: 02-intimacy-plugin-unified-page
plan: 05
subsystem: ui
tags: [angular, cdk-drag-drop, cdk-a11y, snackbar, autosave, zoneless]

# Dependency graph
requires:
  - phase: 02-intimacy-plugin-unified-page
    provides: "02-01 tracer (SUBDOC_PLUGINS token, SubDocHost/PluginOutlet host chain, CharacterStore page API, CharacterPage list); 02-04 (@angular/cdk installed at core-matched 22.1.6)"
provides:
  - SnackbarService toast action (ToastAction, id-returning show, id-scoped dismiss, runAction) and SnackbarComponent .toast-action button
  - CharacterStore.removePage/restorePage/reorder — immutable, same-character-only restore, array-order-only reorder (no order/position field)
  - Synthetic test-notes plugin (apps/web/src/app/testing/test-plugins.ts) for multi-page specs while only Intimacy is registered in @dossier/schema's SCHEMA_REGISTRY
  - IconComponent (cd-icon) and DragHandle (cd-drag-handle) — first inline-SVG icon and CDK drag handle primitives in the app
  - SubDocHost chapter title bar (D-01) — icon, 18+ badge, drag handle, accessible ▲▼ with LiveAnnouncer + focus retention, remove
  - CharacterPage cdkDropList with drag-triggered collapse (D-05) and 8s Undo removal orchestration (D-06 to D-08)
affects: [02-06 Intimacy editor cards (host chrome now final), 02-07 picker, Phase 4 Gallery (first real second page type to exercise multi-real-page reorder), Phase 6 print rules (.drag-handle/.reorder/.remove print hiding already in place)]

actuals:
  tokens: 17400
  tasks: 3
  commits: 6
plan_head_before: 032412a56ee8b1b31ce1a97421491080e7715309

tech-stack:
  added: []
  patterns:
    - "SUBDOC_PLUGINS test-double pattern (established in 02-01, used here): apps/web/src/app/testing/test-plugins.ts registers a synthetic 'test-notes' type via TestBed provider override. It is NEVER round-tripped through CharacterStore.load()/CharacterRepo.get() — validateCharacter (packages/schema) always validates against SCHEMA_REGISTRY with no override seam, so any persisted record containing an unregistered type throws UnsupportedVersionError on load. Multi-page UI specs seed an empty (registry-safe) character, let the component load it normally, then call store.addPage(...) in-memory to add the synthetic page — addPage/removePage/restorePage/reorder never call validateCharacter."
    - "afterNextRender(fn, { injector }) for DOM-timing-dependent focus/scroll restoration after a signal-driven reorder/remove/drag, matching the codebase's existing PluginOutlet afterRenderEffect pattern for outlet wiring."
    - "SnackbarService's id-returning show()/id-scoped dismiss(id?) keeps the single-slot queue additive: an action's onClick can itself call show() (queuing) and the wrapping dismiss() then presents it, so 'Undo shows a follow-up toast' composes without special-casing."

key-files:
  created:
    - apps/web/src/app/testing/test-plugins.ts
    - apps/web/src/app/components/icon/icon.component.ts
    - apps/web/src/app/components/icon/icon.component.html
    - apps/web/src/app/components/drag-handle/drag-handle.component.ts
    - apps/web/src/app/components/drag-handle/drag-handle.component.html
    - apps/web/src/app/components/drag-handle/drag-handle.component.scss
    - apps/web/src/app/components/snackbar/snackbar.component.spec.ts
    - apps/web/src/app/subdocs/subdoc-host/subdoc-host.component.scss
    - apps/web/src/app/subdocs/subdoc-host/subdoc-host.component.spec.ts
    - apps/web/src/app/integration/reorder-persist.integration.spec.ts
  modified:
    - apps/web/src/app/services/snackbar.service.ts
    - apps/web/src/app/services/snackbar.service.spec.ts
    - apps/web/src/app/components/snackbar/snackbar.component.ts
    - apps/web/src/app/components/snackbar/snackbar.component.html
    - apps/web/src/app/components/snackbar/snackbar.component.scss
    - apps/web/src/app/stores/character.store.ts
    - apps/web/src/app/stores/character.store.spec.ts
    - apps/web/src/app/subdocs/subdoc-host/subdoc-host.component.ts
    - apps/web/src/app/subdocs/subdoc-host/subdoc-host.component.html
    - apps/web/src/app/pages/character/character-page.component.ts
    - apps/web/src/app/pages/character/character-page.component.html
    - apps/web/src/app/pages/character/character-page.component.scss
    - apps/web/src/app/pages/character/character-page.component.spec.ts

key-decisions:
  - "IconComponent's 'ph-heart' path is an authored outline heart (two nested heart curves with fill-rule=evenodd), not a literal copy of the Phosphor asset — no network access was available this session to fetch the real phosphor-icons/core SVG, so an equivalent outline shape was hand-authored in the same 256x256 viewBox rather than risk misattributing an unverified path as the real asset. Visually a heart-ring outline; exact stroke uniformity was not a design requirement."
  - "Multi-page CharacterPage-level specs never persist-then-load a record containing the synthetic test-notes type (see tech-stack pattern above) — this was discovered empirically (first draft of the reorder/remove specs failed with 0 rendered hosts because store.load() threw UnsupportedVersionError), matching the plan's own <interfaces> note about validateCharacter's registry, and confirms it applies to CharacterPage-level fixtures too, not only CharacterStore-level ones."
  - "endDrag's pointerup/pointercancel fallback listeners are added/removed manually (not {once:true}) so armDrag can explicitly detach them from endDrag regardless of which of the three trigger paths (onDrop, cdkDragEnded, or the fallback itself) fired first."

patterns-established: []

requirements-completed: [CHAR-04, CHAR-05]

coverage:
  - id: D1
    description: "SubDocHost's chapter title bar (D-01): icon, display name, 18+ badge (adult types only), drag handle, ▲▼, remove in edit mode; view mode renders only title + badge with edit chrome compile-time-absent from the DOM"
    requirement: "CHAR-05"
    verification:
      - kind: unit
        ref: "apps/web/src/app/subdocs/subdoc-host/subdoc-host.component.spec.ts#SubDocHost (13 tests) + IconComponent (2 tests) + reorderAnnouncement (1 test)"
        status: pass
    human_judgment: false
  - id: D2
    description: "▲▼ keyboard reorder with LiveAnnouncer announcements, disabled-at-ends buttons, and focus retention on the surviving enabled arrow after a move"
    requirement: "CHAR-05"
    verification:
      - kind: unit
        ref: "apps/web/src/app/subdocs/subdoc-host/subdoc-host.component.spec.ts#clicking down/up ... calls store.reorder ... and announces; ...focus lands on the up button"
        status: pass
    human_judgment: false
  - id: D3
    description: "Drag-and-drop reorder through cdkDropList/cdkDragHandle: pressing the handle collapses every page to its title bar until drop/cancel/release-without-drag, then pages expand and the moved page scrolls into view (D-05)"
    requirement: "CHAR-05"
    verification:
      - kind: unit
        ref: "apps/web/src/app/pages/character/character-page.component.spec.ts#dragArmed from one host sets collapsed on every host; ...dragArmed followed by a document pointerup with no drag start clears collapsed"
        status: pass
      - kind: integration
        ref: "apps/web/src/app/integration/reorder-persist.integration.spec.ts#reorder(0, 1) persists array order, and every stored page carries exactly the keys adult, data, type, version"
        status: pass
      - kind: manual_procedural
        ref: "Plan's <human-check>: press/release the drag handle at 400px and desktop width and confirm collapse/expand/handle-tracking; two-real-page drag feel deferred to Phase 4 Gallery per the plan's Flagged Assumptions"
        status: unknown
    human_judgment: true
    rationale: "The <verify> block's <human-check> requires driving a running dev server in a real browser at two viewport widths. No Playwright MCP tool (or other browser-automation tool) was available in this executor's tool list this session, so it could not be driven directly per the dispatch instruction ('drive it yourself with Playwright MCP tools if available... only return a checkpoint if Playwright cannot perform the check'). Recorded here for the end-of-phase UAT harvest (workflow.human_verify_mode defaults to end-of-phase) rather than halting a fully green, fully committed plan mid-flight."
  - id: D4
    description: "Remove with no confirm step; 8s Undo snackbar restores index and original data reference for the same character only; both remove and undo persist through normal autosave (D-06 to D-08, CHAR-04)"
    requirement: "CHAR-04"
    verification:
      - kind: unit
        ref: "apps/web/src/app/pages/character/character-page.component.spec.ts#remove on the intimacy host ...; #invoking the captured action.onClick restores both pages ...; #removing the only remaining page focuses #add-page-button; #destroying the page fixture calls snackbar.dismiss ..."
        status: pass
      - kind: unit
        ref: "apps/web/src/app/stores/character.store.spec.ts#CharacterStore remove, restore and reorder (11 tests)"
        status: pass
      - kind: integration
        ref: "apps/web/src/app/integration/reorder-persist.integration.spec.ts#removePage followed immediately by pagehide is written to IndexedDB within 400ms; #remove then restore round-trips the same edited data through the default registry"
        status: pass
    human_judgment: false
  - id: D5
    description: "Undo safety: restorePage refuses a page for any character other than the one loaded (navigation-after-remove is a no-op, silent); calling the captured onClick a second time, or after the type was re-added meanwhile, changes no state (at most an info toast)"
    requirement: "CHAR-04"
    verification:
      - kind: unit
        ref: "apps/web/src/app/stores/character.store.spec.ts#restorePage for a different characterId returns false ...; #restorePage for a type already present returns false, and a second identical restorePage returns false"
        status: pass
      - kind: unit
        ref: "apps/web/src/app/pages/character/character-page.component.spec.ts#calling the captured onClick after loading a different character leaves that character unchanged and shows no restore; #calling onClick when the type was re-added meanwhile calls snackbar.showInfo"
        status: pass
    human_judgment: false
  - id: D6
    description: "SnackbarService gains an id-returning show(), id-scoped dismiss(id?), and runAction() for the Undo action button; SnackbarComponent renders .toast-action/.toast-sep"
    verification:
      - kind: unit
        ref: "apps/web/src/app/services/snackbar.service.spec.ts#SnackbarService: actions and id-scoped dismiss (9 tests)"
        status: pass
      - kind: unit
        ref: "apps/web/src/app/components/snackbar/snackbar.component.spec.ts (2 tests)"
        status: pass
    human_judgment: false
  - id: D7
    description: "Order is stored only as pages array order; every persisted page has exactly the keys type, version, adult, data; reorder(from, to) rejects out-of-range/non-integer/equal indices without writing"
    requirement: "CHAR-05"
    verification:
      - kind: unit
        ref: "apps/web/src/app/stores/character.store.spec.ts#reorder(0, 1) ...; #reorder(%s, %s) leaves character() the same reference (4 edge cases: 0/0, -1/0, 0/2, 0.5/1); #persisted pages carry exactly the keys adult, data, type, version"
        status: pass
      - kind: integration
        ref: "apps/web/src/app/integration/reorder-persist.integration.spec.ts#reorder(0, 1) persists array order, and every stored page carries exactly the keys adult, data, type, version"
        status: pass
    human_judgment: false

duration: 21 min
completed: 2026-09-14
status: complete
---

# Phase 02 Plan 05: Reorder, Remove-with-Undo and Chapter Title Bar Summary

**SubDocHost grew a full chapter title bar (icon, 18+ badge, drag handle, accessible ▲▼, remove) and CharacterPage gained cdkDropList drag-and-drop with a collapse-while-dragging effect, plus an 8-second-Undo remove flow, on top of new CharacterStore.removePage/restorePage/reorder and a SnackbarService action-button capability.**

## Performance

- **Duration:** 21 min
- **Tasks:** 3/3 completed
- **Files modified:** 23 (10 created, 13 modified)

## Accomplishments
- `SnackbarService` gained an id-returning `show()`, id-scoped `dismiss(id?)`, and `runAction()` so a toast can carry a labeled action (Undo) that calls its handler exactly once and dismisses; `SnackbarComponent` renders the `.toast-action` button.
- `CharacterStore` gained `removePage`, `restorePage` (same-character-only, type/PAGES_MAX/registry guarded), and `reorder` (integer-bounds-only) — all following the existing new-object/new-array immutability discipline so autosave keeps firing correctly.
- `SubDocHost` now renders the full D-01 chapter title bar: a new `IconComponent` (`cd-icon`, inline SVG, no icon package dependency) and `DragHandle` (`cd-drag-handle`, non-focusable, CSS six-dot glyph) plus ▲▼ buttons that call `store.reorder`, announce via CDK `LiveAnnouncer`, and restore focus to the surviving enabled arrow after a page moves out from under it.
- `CharacterPage` wraps its page list in a `cdkDropList`, collapses every page to its title bar for the duration of a drag (D-05, with scroll-position preservation and a pointerup fallback for a press-without-drag), and orchestrates remove-with-8s-Undo (D-06 to D-08): no confirm dialog, focus management after both remove and Undo, an "already on this dossier" info toast if Undo's target type was re-added meanwhile, and undo-toast cleanup on page destroy.
- A synthetic `test-notes` plugin (`apps/web/src/app/testing/test-plugins.ts`) lets specs exercise real two-page reorder/remove/persist behavior while only Intimacy is registered in `@dossier/schema`'s `SCHEMA_REGISTRY` in Phase 2 — discovered during this plan that it must never be persisted-then-loaded through `CharacterStore.load()`, only added in-memory via `store.addPage()` after a registry-safe character has already loaded.

## Task Commits

Each task followed the plan's RED/GREEN TDD split (test commit, then implementation commit):

1. **Task 1: Snackbar action/id-scoped dismiss; store remove/restore/reorder; synthetic test plugin**
   - `228b757` (test) — pinned all behavior bullets across 3 spec files + the test-notes plugin
   - `51c05f1` (feat) — SnackbarService/SnackbarComponent + CharacterStore implementation
2. **Task 2: SubDocHost chapter title bar (D-01)**
   - `378e335` (test) — pinned IconComponent, `reorderAnnouncement`, and all SubDocHost behavior bullets
   - `a690e7c` (feat) — IconComponent, DragHandle, SubDocHost implementation
3. **Task 3: CharacterPage drop list, drag collapse, undo orchestration, reorder-persist integration**
   - `1d68a75` (test) — pinned CharacterPage reorder/remove specs + the integration spec
   - `207d78c` (feat) — CharacterPage implementation

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `apps/web/src/app/services/snackbar.service.ts` — `ToastAction`, `action?` on `Toast`/`ShowOptions`, id-returning `show()`, id-scoped `dismiss(id?)`, `runAction()`
- `apps/web/src/app/components/snackbar/snackbar.component.{ts,html,scss,spec.ts}` — `.toast-action`/`.toast-sep` rendering and click wiring
- `apps/web/src/app/stores/character.store.ts` — `removePage`, `restorePage`, `reorder`
- `apps/web/src/app/testing/test-plugins.ts` — `TestNotesEditor`, `TEST_NOTES_PLUGIN`, `provideTestPlugins()`
- `apps/web/src/app/components/icon/icon.component.{ts,html}` — `IconComponent` (`cd-icon`), `ICON_PATHS`
- `apps/web/src/app/components/drag-handle/drag-handle.component.{ts,html,scss}` — `DragHandle` (`cd-drag-handle`)
- `apps/web/src/app/subdocs/subdoc-host/subdoc-host.component.{ts,html,scss,spec.ts}` — chapter title bar, `move()`, exported `reorderAnnouncement`
- `apps/web/src/app/pages/character/character-page.component.{ts,html,scss,spec.ts}` — `.page-list` drop list, `dragging`, `armDrag`, `endDrag`, `onDrop`, `onRemove`, `undo`, `undoToastIds`
- `apps/web/src/app/integration/reorder-persist.integration.spec.ts` — reorder/remove/restore against real fake-indexeddb

## Decisions Made
- IconComponent's `ph-heart` path is an authored equivalent outline heart (evenodd double-heart-curve technique), not a verified copy of the real Phosphor asset — no network access this session to fetch and diff against the actual SVG. Documented as a deviation candidate if pixel-fidelity to Phosphor's actual heart glyph matters later.
- Multi-page `CharacterPage`-level specs seed a registry-safe empty character and add the synthetic `test-notes` page in-memory via `store.addPage()` after load succeeds, never by persisting a `test-notes` page and loading it — `validateCharacter` always validates against `@dossier/schema`'s `SCHEMA_REGISTRY` with no injectable override, so a persisted unregistered-type record throws `UnsupportedVersionError` on load. This was discovered empirically when the first draft of the `CharacterPage` reorder/remove specs rendered zero hosts.
- `endDrag`'s pointerup/pointercancel fallback listeners are added/removed manually rather than via `{once: true}`, so they can be explicitly detached from inside `endDrag` regardless of which of its three trigger paths (`onDrop`, `cdkDragEnded`, or the fallback itself) fires first.

## Deviations from Plan

None — plan executed exactly as written. No Rule 1/2/3 auto-fixes were needed; the two items above were plan-consistent discretionary choices (the outline-heart authoring was explicitly permitted by the plan's action text, and the never-persist-test-notes constraint was explicitly called out in the plan's `<interfaces>` section).

## Issues Encountered

- jsdom logs `Not implemented: Window's scrollBy() method` to stderr during the `CharacterPage` drag tests (via `armDrag`'s scroll-position-preservation call). This is jsdom's own non-functional stub for `window.scrollBy` (already defined, so `test-setup.ts`'s `typeof window.scrollBy === 'undefined'` guard does not patch it) — cosmetic test-log noise, not a test failure; all assertions pass. Not fixed here since `test-setup.ts` is shared test infrastructure outside this plan's `files_modified` and the noise does not affect correctness.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Plan 02-06 (Intimacy editor's remaining four cards) can build against the now-final `SubDocHost` chrome without further host-side changes.
- Plan 02-07 (picker) can reuse the `provideTestPlugins()` synthetic-second-type pattern established in 02-01 and exercised again here.
- Phase 4 (Gallery) will be the first real second page type; the plan's own Flagged Assumptions note that true two-real-page drag-and-drop feel is proven here only through the synthetic type and raw IndexedDB assertions, and remains a manual UAT item once Gallery ships.
- The `<human-check>` portion of Task 3's `<verify>` (drag handle press/release feel at 400px and desktop width) was not driven this session (no Playwright/browser-automation tool available) — flagged as coverage `D3` with `human_judgment: true` for the end-of-phase UAT harvest.

---
*Phase: 02-intimacy-plugin-unified-page*
*Completed: 2026-09-14*

## Self-Check: PASSED

All 23 key files confirmed present on disk with `[ -f ]`; all 6 task commits (228b757, 51c05f1, 378e335, a690e7c, 1d68a75, 207d78c) confirmed in `git log --oneline --all`. Full web test suite (152 tests, 19 files) passed; `pnpm test` (schema + web) passed; `pnpm --filter "web..." run build` passed with no component style budget error; `rg -q 'testing/test-plugins' apps/web/dist` exited 1 (absent from the production bundle) after that build.

## Post-verification fix

The orchestrator drove Task 3's `<human-check>` with Playwright against `pnpm dev` (coverage `D3`, previously `human_judgment: true` / `status: unknown` above) and found the drag-handle collapse itself worked (page body hides while dragging, re-expands on release, `.drag-placeholder` is 56px) but the `.cdk-drag-preview` clone was broken:

- The drag handle rendered ~32px below the pointer at pickup (desktop 1280px: pointer y=500, preview handle box y=510–554; 400px: handle 735–779, pointer 756, covered only because the handle's 44px hit area happened to reach it).
- The p

<!-- FIXTURE TRUNCATED at 20 KiB by M0-G capture; original size 35525 bytes -->

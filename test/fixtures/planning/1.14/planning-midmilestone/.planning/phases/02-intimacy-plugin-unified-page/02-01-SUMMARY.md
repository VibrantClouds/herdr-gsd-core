---
phase: 02-intimacy-plugin-unified-page
plan: 01
subsystem: ui
tags: [angular, zod, subdocument-plugin, indexeddb, zoneless]

# Dependency graph
requires:
  - phase: 01-foundation-library
    provides: SubDocumentSchema contract, characterSchema/validateCharacter load boundary, CharacterStore autosave, CharacterRepo, empty SCHEMA_REGISTRY/PLUGIN_REGISTRY scaffolding
provides:
  - First registered SubDocumentPlugin (intimacy) proving the plugin architecture end to end
  - SUBDOC_PLUGINS injection token as the host-side plugin lookup for store/host/outlet
  - CharacterStore.availableTypes/addPage/updatePage
  - PluginOutlet and SubDocHost as the reusable lazy-load + @defer host chain for every future page type
  - CharacterPage empty-state, page list, add-page control
affects: [02-intimacy-plugin-unified-page remaining plans (02-05 reorder, 02-06 editor cards, 02-07 picker), phase 3 sharing/print (adult flag gating), phase 8 (sections contract)]

actuals:
  tokens: 12409
  tasks: 2
  commits: 2
plan_head_before: 4b2da8d01839c81d0fd58745639f699a421521ed

tech-stack:
  added: []
  patterns:
    - "Subdocument plugin split: schema half in packages/schema/src/plugins/<type>/, UI half in apps/web/src/app/subdocs/<type>/, wired through two frozen registries (SCHEMA_REGISTRY, PLUGIN_REGISTRY/SUBDOC_PLUGINS)"
    - "PluginOutlet manually subscribes to the dynamically-loaded editor's dataChange OutputEmitterRef via viewChild(NgComponentOutlet) + effect, because NgComponentOutlet has no output-binding syntax"
    - "SubDocHost defers each page's outlet with @defer (on viewport), so N pages only construct their heavy editors as they scroll into view"
    - "Store mutations for pages follow the same new-object/new-array immutability rule as updateCore, required for the reference-identity-gated autosave effect"

key-files:
  created:
    - packages/schema/src/plugins/intimacy/v1.ts
    - packages/schema/src/plugins/intimacy/schema.ts
    - packages/schema/src/plugins/intimacy/migrations.ts
    - packages/schema/src/plugins/intimacy/index.ts
    - packages/schema/src/plugins/intimacy/fixtures/1.0.0.json
    - packages/schema/src/__tests__/intimacy.spec.ts
    - apps/web/src/app/subdocs/plugin.ts
    - apps/web/src/app/subdocs/intimacy/index.ts
    - apps/web/src/app/subdocs/intimacy/intimacy-editor.component.ts
    - apps/web/src/app/subdocs/intimacy/intimacy-editor.component.html
    - apps/web/src/app/subdocs/plugin-outlet/plugin-outlet.component.ts
    - apps/web/src/app/subdocs/plugin-outlet/plugin-outlet.component.html
    - apps/web/src/app/subdocs/subdoc-host/subdoc-host.component.ts
    - apps/web/src/app/subdocs/subdoc-host/subdoc-host.component.html
    - apps/web/src/app/integration/intimacy-page.integration.spec.ts
  modified:
    - packages/schema/src/plugin.ts
    - packages/schema/src/index.ts
    - apps/web/src/test-setup.ts
    - apps/web/src/app/stores/character.store.ts
    - apps/web/src/app/stores/character.store.spec.ts
    - apps/web/src/app/pages/character/character-page.component.ts
    - apps/web/src/app/pages/character/character-page.component.html
    - apps/web/src/app/pages/character/character-page.component.scss

key-decisions:
  - "INTIMACY_MIGRATIONS is [] for the sole supported version, following the plugin contract checklist and fixture-coverage.ts rather than ADR-0011's 'initial, no-op entry' wording — a discrepancy to reconcile if ADR-0011 is revisited"
  - "Task 2's 47 new assertions (schema + store) all passed against the Task 1 implementation unmodified — no Rule 1/2/3 fixes were needed"

patterns-established:
  - "Pattern 1: SUBDOC_PLUGINS injection token (not the raw PLUGIN_REGISTRY constant) is the host-side read path, so specs registering a synthetic second type (02-05, 02-07) can override via DI instead of mutating the frozen registry"
  - "Pattern 2: addPage/updatePage no-op on every invalid precondition (no character, unregistered/duplicate type, PAGES_MAX, non-own key via Object.hasOwn) rather than throwing — callers never need try/catch around a user click"

requirements-completed: [CHAR-04, INTM-05]

coverage:
  - id: D1
    description: "A character with no pages shows the empty-state line and '+ Add page'; clicking it adds one Intimacy Dossier page and the control hides once nothing is left to add (CHAR-04, D-10, D-11, D-12)"
    requirement: "CHAR-04"
    verification:
      - kind: integration
        ref: "apps/web/src/app/integration/intimacy-page.integration.spec.ts#adds an Intimacy Dossier page, edits its relationship context, and the value survives a reload"
        status: pass
      - kind: manual_procedural
        ref: "Playwright walkthrough at http://localhost:4433, 400px viewport (see Issues Encountered) — empty state, add, edit, reload, no console errors"
        status: pass
    human_judgment: false
  - id: D2
    description: "The Intimacy type is registered adult:true in both registries, and the flag is registry-derived (not envelope-derived) at both add and load time (INTM-05)"
    requirement: "INTM-05"
    verification:
      - kind: unit
        ref: "packages/schema/src/__tests__/intimacy.spec.ts#intimacySchema is registered with adult true..."
        status: pass
      - kind: unit
        ref: "packages/schema/src/__tests__/intimacy.spec.ts#validateSubDocument — adult flag is registry-derived"
        status: pass
    human_judgment: false
  - id: D3
    description: "The Intimacy schema's literal scales, required keys, length/control-char caps, and whitespace handling are pinned by specs"
    verification:
      - kind: unit
        ref: "packages/schema/src/__tests__/intimacy.spec.ts (29 tests across rejects/boundaries/control-characters/whitespace)"
        status: pass
    human_judgment: false
  - id: D4
    description: "CharacterStore's addPage/updatePage/availableTypes edges (idempotency, Object.hasOwn prototype-key rejection, reference-identity no-ops, and a persistence-failure privacy guarantee) are pinned by specs"
    verification:
      - kind: unit
        ref: "apps/web/src/app/stores/character.store.spec.ts#CharacterStore pages (9 tests)"
        status: pass
    human_judgment: false

duration: 2 sessions (Task 1 tracer + human-verify checkpoint, then Task 2 continuation ~15min)
completed: 2026-09-14
status: complete
---

# Phase 02 Plan 01: Intimacy Plugin Tracer Summary

**First subdocument plugin (Intimacy Dossier) registered end to end — schema, both registries, store, lazy-loaded editor host chain, and page UI — with its validation edges and store page-API edges pinned by 38+9 unit specs.**

## Performance

- **Tasks:** 2/2 completed
- **Files modified:** 23 (15 created, 8 modified)
- **Commits:** 2 task commits (177878c, 5160ed1) + this metadata commit

## Accomplishments
- The plugin architecture is proven live: adding an Intimacy Dossier page, editing its relationship context, and reloading round-trips through schema validation, both registries, the store, the lazy `@defer`-loaded `PluginOutlet`/`SubDocHost` chain, and IndexedDB — verified by an integration spec and, per the checkpoint response, an actual Playwright walkthrough of the running app.
- `SCHEMA_REGISTRY.intimacy` and `PLUGIN_REGISTRY.intimacy` (via the `SUBDOC_PLUGINS` DI token) are the first two non-empty registry entries in the codebase; every later plugin in this phase and beyond follows the same two-registry, two-directory split.
- The Intimacy schema's literal scales (`Level` 0-6, `Lean` 0-4), required-key enforcement, `shortText` caps at 200/4000 code points, and control-character/whitespace handling are pinned by 29 unit tests, plus 9 more pinning `CharacterStore`'s `availableTypes`/`addPage`/`updatePage` edges (idempotency, prototype-key rejection via `Object.hasOwn`, reference-identity no-ops, and a persistence-failure privacy guarantee).
- `adult: true` is proven registry-derived, not envelope-derived: `validateSubDocument` corrects a stored `adult: false` envelope back to `true` on load.

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end "add an Intimacy Dossier page, edit its relationship context, reload" (tracer)** - `177878c` (feat)
2. **Task 2: Pin the Intimacy schema's validation edges and the store's page-API edges** - `5160ed1` (test)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `packages/schema/src/plugins/intimacy/v1.ts` - id tuples, `IntimacyDossierV1`, `createIntimacyDefault()`
- `packages/schema/src/plugins/intimacy/schema.ts` - `intimacyDossierV1Schema` (literal scales, required keys, `shortText` caps)
- `packages/schema/src/plugins/intimacy/migrations.ts` - `INTIMACY_MIGRATIONS: []`
- `packages/schema/src/plugins/intimacy/index.ts` - `intimacySchema: SubDocumentSchema<IntimacyDossierV1>`
- `packages/schema/src/plugins/intimacy/fixtures/1.0.0.json` - fully populated 1.0.0 envelope (46 ratings, all text fields, one interior newline)
- `packages/schema/src/plugin.ts` - `SCHEMA_REGISTRY = Object.freeze({ intimacy: intimacySchema })`
- `packages/schema/src/index.ts` - exports the intimacy tuples, types, `createIntimacyDefault`, `intimacySchema`
- `packages/schema/src/__tests__/intimacy.spec.ts` - 29 tests pinning the schema (Task 2)
- `apps/web/src/app/subdocs/plugin.ts` - `EditorMode`, `SubDocumentEditor`, `PluginSection`, `SubDocumentPlugin`, `PLUGIN_REGISTRY`, `SUBDOC_PLUGINS` token
- `apps/web/src/app/subdocs/intimacy/index.ts` - `intimacyPlugin` (lazy `load()`, icon, sections)
- `apps/web/src/app/subdocs/intimacy/intimacy-editor.component.{ts,html}` - `IntimacyEditor`, relationship-context field
- `apps/web/src/app/subdocs/plugin-outlet/plugin-outlet.component.{ts,html}` - `PluginOutlet`, lazy `NgComponentOutlet` + manual `dataChange` re-subscription
- `apps/web/src/app/subdocs/subdoc-host/subdoc-host.component.{ts,html}` - `SubDocHost`, `@defer (on viewport)` wrapper
- `apps/web/src/app/integration/intimacy-page.integration.spec.ts` - UI-level add/edit/reload round trip
- `apps/web/src/test-setup.ts` - jsdom `IntersectionObserver`/`scrollIntoView`/`scrollBy` no-op stubs
- `apps/web/src/app/stores/character.store.ts` - `availableTypes`, `addPage`, `updatePage`
- `apps/web/src/app/stores/character.store.spec.ts` - 9 new tests pinning the page API (Task 2)
- `apps/web/src/app/pages/character/character-page.component.{ts,html,scss}` - empty-state line, page list, add-page button

## Decisions Made
- `INTIMACY_MIGRATIONS` is `[]` (not a no-op entry) for the sole supported version 1.0.0, following the plugin contract checklist and `fixture-coverage.ts` rather than ADR-0011's "initial, no-op entry" wording (RESEARCH Pitfall 3). Recorded here as the discrepancy the plan asked to surface; ADR-0011's wording should be reconciled against this precedent if revisited.
- Task 2 was written as characterization specs against the already-committed Task 1 implementation rather than a strict pre-implementation RED phase — `workflow.tdd_mode` is not enabled for this project (config-verified), and the plan's own Task 2 instructions frame it as "write specs first against the Task 1 code; if any behavior fails, fix the implementation." All 47 new assertions passed on the first run with zero implementation changes required.

## Deviations from Plan

None - plan executed exactly as written. No Rule 1/2/3 auto-fixes were needed in Task 2; the Task 1 implementation already satisfied every pinned edge case (literal-scale rejections, required-key enforcement, boundary caps, control-character/whitespace handling, `Object.hasOwn` prototype-key rejection, and the write-failure privacy guarantee).

## Issues Encountered

None during Task 2. Task 1's `checkpoint:human-verify` was resolved in a prior turn: the orchestrator drove every `how-to-verify` step with Playwright against `http://localhost:4433` at a 400px viewport — new character created, empty state and add button shown, add click renders the "Intimacy Dossier" heading and hides the add button, typed "single, open, married" into Relationship context, "All changes saved" appeared, and the value survived a full reload with no horizontal overflow and 0 console errors/warnings. One non-blocking observation was recorded for plan 02-06: the "e.g. single, open, married" hint under the field renders at body text size rather than as muted hint text — not fixed here since plan 02-06 owns the editor's remaining card styling and this task's template only had to prove the wiring, not finalize the hint's typography.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- The plugin architecture (schema half, UI half, both registries, `SUBDOC_PLUGINS` token, `PluginOutlet`/`SubDocHost` host chain) is proven and ready for plan 02-06 to build out the Intimacy editor's four remaining cards without changing `IntimacyEditor`'s inputs/outputs.
- Plans 02-05 (reorder) and 02-07 (picker) can register a synthetic second plugin type via `SUBDOC_PLUGINS` DI override for their specs, per the pattern established here.
- Non-blocking styling note for 02-06: the relationship-context hint text needs a muted/hint-size treatment (see Issues Encountered).
- Flagged assumption (unresolved, carried from the plan): INTM-05's adult-flag behavior for shares and print is Phase 3 (GATE-01/02) and Phase 6 scope — this plan only covers the registry flag plus load-time correction.

---
*Phase: 02-intimacy-plugin-unified-page*
*Completed: 2026-09-14*

## Self-Check: PASSED

All 15 key files and the SUMMARY itself confirmed present on disk; both task commits (177878c, 5160ed1) confirmed in `git log`.

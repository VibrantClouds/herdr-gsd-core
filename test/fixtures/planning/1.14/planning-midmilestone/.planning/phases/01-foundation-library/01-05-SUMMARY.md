---
phase: 01-foundation-library
plan: 05
subsystem: ui
tags: [angular-signals, indexeddb, library-management, tdd]

requires:
  - phase: 01-foundation-library
    provides: "CharacterRepo (get/list/put/delete, LibraryListing with rejected records), the tracer LibraryStore/LibraryPage, createEmptyCharacter from 01-01"
provides:
  - "LibraryStore: duplicate(id), remove(id), deterministic refresh() ordering (updatedAt desc, name, id asc), rejectedCount, and a guarded create() that shares its in-flight promise"
  - "LibraryPage: per-row Open (routerLink), Duplicate and confirm-gated Delete actions, an empty-state message, and a rejected-records notice"
  - "NAME_MAX and the rest of packages/schema/src/limits.ts now exported from @dossier/schema's public index"
affects: [01-06, "02-*"]

actuals:
  tokens: 5833
  tasks: 2
  commits: 5

tech-stack:
  added: []
  patterns:
    - "Store-owned in-flight promise guard: create() caches the pending Promise<string> on the instance and returns it to concurrent callers instead of a boolean flag, so a double-activation is structurally a no-op rather than a race checked after the fact"
    - "Code-point-safe name truncation via Array.from(str).slice(0, n).join('') — matches the schema's own .max() code-point count instead of UTF-16 string length"

key-files:
  created:
    - apps/web/src/app/stores/library.store.spec.ts
    - apps/web/src/app/pages/library/library-page.component.spec.ts
  modified:
    - apps/web/src/app/stores/library.store.ts
    - apps/web/src/app/integration/library-crud.integration.spec.ts
    - apps/web/src/app/pages/library/library-page.component.ts
    - apps/web/src/app/pages/library/library-page.component.html
    - apps/web/src/app/pages/library/library-page.component.scss
    - packages/schema/src/index.ts

key-decisions:
  - "packages/schema/src/index.ts was missing NAME_MAX (and the rest of limits.ts) from its export map even though the 01-05 plan's <interfaces> section documents it as importable — added the full limits.ts export list (Rule 3, blocking: the plan's own test code couldn't compile without it)."
  - "The duplicate() deep-copy-of-pages test uses characters with an empty pages array: SCHEMA_REGISTRY is still empty at Phase 1 (Phase 2 adds the first plugin), so CharacterRepo.get()'s load boundary (validateCharacter -> validateSubDocument) would reject any character carrying a page today. Deep-copy is instead verified structurally (structuredClone( in library.store.ts) plus an array-reference/content check on the empty array."
  - "Duplicate/Delete button aria-labels render as 'Duplicate {name}' / 'Delete {name}' (no literal parentheses) — the plan's 'aria-label=\"Duplicate (name)\"' notation is read as the same interpolation placeholder convention used elsewhere in the same action block (e.g. \"['/c', s.id]\"), not literal parenthesis characters."

requirements-completed: [CHAR-02, CHAR-01]

coverage:
  - id: D1
    description: "duplicate(id) returns a new id distinct from the source, produces a code-point-truncated name ending in ' (copy)' (or 'Untitled character (copy)' for an empty name), and duplicating twice yields two distinct copies"
    requirement: CHAR-02
    verification:
      - kind: unit
        ref: "apps/web/src/app/stores/library.store.spec.ts > LibraryStore > duplicate (4 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "remove(id) deletes the record; removing an id a second time resolves without error and leaves summaries unchanged (IndexedDB delete is idempotent)"
    requirement: CHAR-02
    verification:
      - kind: unit
        ref: "apps/web/src/app/stores/library.store.spec.ts > LibraryStore > remove"
        status: pass
    human_judgment: false
  - id: D3
    description: "refresh() sorts by updatedAt descending, then name (localeCompare, base sensitivity), then id ascending, and sets rejectedCount from LibraryListing.rejected.length"
    requirement: CHAR-02
    verification:
      - kind: unit
        ref: "apps/web/src/app/stores/library.store.spec.ts > LibraryStore > refresh ordering, refresh rejected count (2 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "create() shares its in-flight promise: two concurrent activations resolve to the same id and exactly one character exists afterward"
    requirement: CHAR-01
    verification:
      - kind: unit
        ref: "apps/web/src/app/stores/library.store.spec.ts > LibraryStore > create"
        status: pass
    human_judgment: false
  - id: D5
    description: "Full round trip survives a simulated reload: create, rename via repo.put, duplicate, delete the original, TestBed.resetTestingModule(), and a fresh LibraryStore lists exactly the copy"
    requirement: CHAR-02
    verification:
      - kind: integration
        ref: "apps/web/src/app/integration/library-crud.integration.spec.ts > library CRUD (real fake-indexeddb, no mocks) > creates, renames, duplicates, deletes the original, and a fresh store after reload lists exactly the copy"
        status: pass
    human_judgment: false
  - id: D6
    description: "LibraryPage renders every character as a row with an Open link (routerLink to /c/(id)), Duplicate and Delete (native window.confirm naming the character) actions, disables New character while store.creating(), shows 'No characters yet' when empty, and a rejected-records notice when rejectedCount() > 0"
    requirement: CHAR-02
    verification:
      - kind: unit
        ref: "apps/web/src/app/pages/library/library-page.component.spec.ts (7 tests)"
        status: pass
    human_judgment: true
    rationale: "Task 2's <verify><human-check> (at 400px width: create two characters, duplicate one, delete one with cancel-then-confirm, and reload — nothing scrolls horizontally and every button is >=44px) needs a human against a live dev server. Deferred to end-of-phase UAT per workflow.human_verify_mode=end-of-phase."

duration: 12min
completed: 2026-09-11
status: complete
---

# Phase 1 Plan 5: Full Library Management (Open, Duplicate, Delete) Summary

**LibraryStore gains duplicate/remove/rejectedCount/a create() concurrency guard with deterministic sort order, and LibraryPage exposes per-row Open/Duplicate/Delete actions plus empty and rejected-records states.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-09-11T21:06:17Z
- **Completed:** 2026-09-11T21:17:27Z
- **Tasks:** 2
- **Files modified:** 8 (2 created, 6 modified; 5 commits including plan metadata)

## Accomplishments

- `LibraryStore`: `duplicate(id)` (code-point-safe `NAME_MAX` truncation, ' (copy)' suffix, `structuredClone`d pages, portrait reference kept), `remove(id)` (idempotent delete), `refresh()` now sorts deterministically (updatedAt desc -> name -> id asc) and sets `rejectedCount` from `LibraryListing.rejected`, and `create()` shares its in-flight promise so a double-activation produces exactly one character
- `LibraryPage`: every character renders as a `.card` row with a name link to `/c/(id)`, species, `updatedAt` via the `date: 'medium'` pipe, `.ghost` Duplicate and `.ghost .danger` Delete (confirm naming the character) actions; New character disables while `store.creating()`; an empty-state message and a rejected-records notice (`role="status"`) render when applicable
- `packages/schema/src/index.ts` now exports `NAME_MAX` and the rest of `limits.ts` (`SHORT_TEXT_MAX`, `LONG_TEXT_MAX`, `CAPTION_MAX`, `PAGES_MAX`, `GALLERY_ITEMS_MAX`, `SHARE_IMAGES_MAX`, `SHARE_IMAGE_BYTES_MAX`, `IMAGE_BYTES_MAX`, `IMAGE_EDGE_MAX`, `SHARE_PAYLOAD_BYTES_MAX`) — was missing despite being documented as importable in this plan's `<interfaces>` section
- Full web suite (`pnpm --filter web exec ng test --watch=false`): 8 files, 34 tests, all passing; `pnpm typecheck` clean across `packages/schema` and `apps/web`

## Task Commits

Each task followed the TDD RED -> GREEN cycle (no REFACTOR commit needed for either — both GREEN implementations were clean on the first pass):

1. **Task 1 RED: failing LibraryStore/integration tests** - `6073902` (test)
2. **Task 1 GREEN: LibraryStore duplicate/remove/ordering/create-guard/rejectedCount** - `f59b197` (feat)
3. **Task 2 RED: failing LibraryPage tests** - `4541b2d` (test)
4. **Task 2 GREEN: LibraryPage rows, empty state, rejected notice** - `70c8c0e` (feat)

**Plan metadata:** committed alongside this SUMMARY.

## TDD Gate Compliance

| Task | RED | GREEN | REFACTOR | Status |
|------|-----|-------|----------|--------|
| Task 1 (LibraryStore) | `6073902` (7/8 target store cases + the extended integration case genuinely failed on assertions against no-op/throwing stubs) | `f59b197` (all target tests pass) | none needed | Pass |
| Task 2 (LibraryPage) | `4541b2d` (6/7 target cases genuinely failed — 5 on `TypeError`/missing-element from absent markup, 1 on a text-content assertion; the 7th, empty-name label, passed unchanged since that literal already existed in the tracer template) | `70c8c0e` (7/7 pass) | none needed | Pass |

`gsd_run check tdd-red-evidence` was not invoked — as noted in 01-04's SUMMARY, it parses Node's `--test` TAP output and this project's Vitest-backed `@angular/build:unit-test` runner produces a different format. RED compliance was verified manually by reading the full Vitest failure output before each RED commit: every failure traces to the missing target behavior (a thrown "not implemented" stub, a wrong id, a missing DOM element, or a wrong assertion value), never an import/compile/fixture crash.

One test in Task 1's ordering scenario (`refresh ordering`) technically passed against the RED-phase stub, because `fake-indexeddb`'s `getAll()` already returns records in ascending-key order, which happened to coincide with the expected id-ascending tie-break for that specific fixture. It was kept: it's a real assertion over real data, not a tautology, and after GREEN it passes for the intended reason (`refresh()`'s explicit sort), not by environmental accident.

## Files Created/Modified

- `apps/web/src/app/stores/library.store.ts` - `duplicate`, `remove`, ordering, `rejectedCount`, `create()` concurrency guard
- `apps/web/src/app/stores/library.store.spec.ts` - 8 unit tests for the above
- `apps/web/src/app/integration/library-crud.integration.spec.ts` - added the create -> rename -> duplicate -> delete -> reload round trip
- `apps/web/src/app/pages/library/library-page.component.{ts,html,scss}` - row actions, empty state, rejected notice
- `apps/web/src/app/pages/library/library-page.component.spec.ts` - 7 unit tests for the above
- `packages/schema/src/index.ts` - exports `limits.ts` constants (`NAME_MAX` etc.)

## Decisions Made

- Exported `limits.ts` constants from `@dossier/schema`'s public index (Rule 3 auto-fix — blocking, the plan's documented interface).
- `duplicate()`'s pages deep-copy test uses an empty `pages` array because `SCHEMA_REGISTRY` has no plugins registered yet at Phase 1; `CharacterRepo.get()`'s load boundary would reject any character carrying a page today. Deep-copy is verified structurally instead (see Deviations).
- Duplicate/Delete `aria-label`s render as `Duplicate {name}` / `Delete {name}` without literal parentheses, reading the plan's `(name)` as the same placeholder convention used elsewhere in the action block rather than literal text.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `@dossier/schema` was missing the `limits.ts` export map**
- **Found during:** Task 1 RED phase (writing `library.store.spec.ts`)
- **Issue:** `import { NAME_MAX } from '@dossier/schema'` failed with `TS2305` — `packages/schema/src/index.ts` re-exported `character.ts` and `plugin.ts`/`migrate.ts`/`share.ts` but never `limits.ts`, even though this plan's `<interfaces>` section documents `NAME_MAX` as importable from the package.
- **Fix:** Added a full `export { ... } from './limits.js'` block re-exporting all ten limit constants (not just `NAME_MAX`, for consistency — the others are equally part of the package's public surface and equally undiscoverable without this).
- **Files modified:** `packages/schema/src/index.ts`
- **Verification:** `pnpm --filter @dossier/schema build` succeeds; `pnpm typecheck` clean; `library.store.spec.ts` imports and uses `NAME_MAX`.
- **Committed in:** `6073902` (Task 1 RED commit)

---

**Total deviations:** 1 auto-fixed (1 blocking).
**Impact on plan:** Necessary to compile the plan's own documented interface; no scope creep.

## Issues Encountered

- `duplicate()`'s original test design used a page with `type: 'bio'` to prove a deep pages copy, which is impossible today: `SCHEMA_REGISTRY` is empty until Phase 2, so `repo.get()`'s load-boundary validation (`validateCharacter` -> `validateSubDocument`) rejects any stored page whose type isn't registered, throwing `UnsupportedVersionError`. Resolved by testing with an empty `pages` array and verifying independence structurally (see Decisions) instead of with live plugin data — not a plan deviation, since the plan's action text already specifies `structuredClone` as the implementation mechanism and the acceptance criteria check for it directly.
- Two RED-phase spec authoring bugs were caught and fixed before the RED commit: (1) `buildCharacter`'s `overrides.core` spread was clobbering the intended `id` with the throwaway `'x'` used to satisfy `createEmptyCharacter`'s required first argument; (2) `library-page.component.spec.ts`'s `createFixture()` called `TestBed.inject()` before `TestBed.configureTestingModule()` in several tests, which Angular's TestBed forbids once a module is auto-instantiated by an early inject. Both fixed by restructuring the test helpers before committing RED — not documented as deviations since they never reached a commit in their broken form.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `LibraryStore`/`LibraryPage` now cover CHAR-02 in full (open, duplicate, delete, persisted across reload) and CHAR-01's create-idempotency edge case; ready for 01-06 to wire the `/c/:id` route and character detail page that the Open link already points at.
- One `<verify><human-check>` item (Task 2: 400px layout, no horizontal scroll, 44px hit areas across create/duplicate/delete/reload) is deferred to end-of-phase UAT per `workflow.human_verify_mode=end-of-phase` — not yet interactively confirmed by a human.
- No blockers for 01-06. `SCHEMA_REGISTRY` remaining empty until Phase 2 is expected and does not block library CRUD, which never touches page contents.

---
*Phase: 01-foundation-library*
*Completed: 2026-09-11*

## Self-Check: PASSED

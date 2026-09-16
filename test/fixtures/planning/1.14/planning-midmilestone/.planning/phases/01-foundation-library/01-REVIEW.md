---
phase: 01-foundation-library
reviewed: 2026-09-11T21:55:29Z
depth: standard
files_reviewed: 78
files_reviewed_list:
  - .editorconfig
  - .gitignore
  - package.json
  - pnpm-workspace.yaml
  - tsconfig.base.json
  - packages/schema/package.json
  - packages/schema/tsconfig.json
  - packages/schema/tsconfig.build.json
  - packages/schema/vitest.config.ts
  - packages/schema/src/index.ts
  - packages/schema/src/limits.ts
  - packages/schema/src/character.ts
  - packages/schema/src/plugin.ts
  - packages/schema/src/migrate.ts
  - packages/schema/src/share.ts
  - packages/schema/src/fixtures/envelope/1.0.0.json
  - packages/schema/src/__tests__/character.spec.ts
  - packages/schema/src/__tests__/fixture-coverage.ts
  - packages/schema/src/__tests__/fixture-guard.spec.ts
  - packages/schema/src/__tests__/import-meta-glob.d.ts
  - packages/schema/src/__tests__/migrate.spec.ts
  - packages/schema/src/__tests__/no-framework-deps.spec.ts
  - packages/schema/src/__tests__/share.spec.ts
  - apps/web/.gitignore
  - apps/web/.prettierrc
  - apps/web/.vscode/extensions.json
  - apps/web/.vscode/launch.json
  - apps/web/.vscode/tasks.json
  - apps/web/README.md
  - apps/web/angular.json
  - apps/web/package.json
  - apps/web/tsconfig.json
  - apps/web/tsconfig.app.json
  - apps/web/tsconfig.spec.json
  - apps/web/wrangler.jsonc
  - apps/web/_worker.js
  - apps/web/scripts/smoke-worker.mjs
  - apps/web/scripts/check-built-css.mjs
  - apps/web/src/index.html
  - apps/web/src/main.ts
  - apps/web/src/styles.scss
  - apps/web/src/styles/_theme.scss
  - apps/web/src/test-setup.ts
  - apps/web/src/app/app.component.html
  - apps/web/src/app/app.component.scss
  - apps/web/src/app/app.component.spec.ts
  - apps/web/src/app/app.component.ts
  - apps/web/src/app/app.config.ts
  - apps/web/src/app/app.routes.ts
  - apps/web/src/app/utils/storage-errors.ts
  - apps/web/src/app/services/indexeddb-config.ts
  - apps/web/src/app/services/native-indexeddb.service.ts
  - apps/web/src/app/services/native-indexeddb.service.spec.ts
  - apps/web/src/app/services/character.repo.ts
  - apps/web/src/app/services/character.repo.spec.ts
  - apps/web/src/app/services/prefs.repo.ts
  - apps/web/src/app/services/theme.service.ts
  - apps/web/src/app/services/theme.service.spec.ts
  - apps/web/src/app/services/snackbar.service.ts
  - apps/web/src/app/services/snackbar.service.spec.ts
  - apps/web/src/app/stores/library.store.ts
  - apps/web/src/app/stores/library.store.spec.ts
  - apps/web/src/app/stores/character.store.ts
  - apps/web/src/app/stores/character.store.spec.ts
  - apps/web/src/app/components/snackbar/snackbar.component.html
  - apps/web/src/app/components/snackbar/snackbar.component.scss
  - apps/web/src/app/components/snackbar/snackbar.component.ts
  - apps/web/src/app/components/character-header/character-header.component.html
  - apps/web/src/app/components/character-header/character-header.component.scss
  - apps/web/src/app/components/character-header/character-header.component.spec.ts
  - apps/web/src/app/components/character-header/character-header.component.ts
  - apps/web/src/app/pages/library/library-page.component.html
  - apps/web/src/app/pages/library/library-page.component.scss
  - apps/web/src/app/pages/library/library-page.component.spec.ts
  - apps/web/src/app/pages/library/library-page.component.ts
  - apps/web/src/app/pages/character/character-page.component.html
  - apps/web/src/app/pages/character/character-page.component.scss
  - apps/web/src/app/pages/character/character-page.component.spec.ts
  - apps/web/src/app/pages/character/character-page.component.ts
  - apps/web/src/app/integration/library-crud.integration.spec.ts
  - apps/web/src/app/integration/autosave-persist.integration.spec.ts
  - docs/specs/SPEC-design-system.md
  - docs/specs/SPEC-frontend-architecture.md
  - docs/specs/SPEC-gallery-and-portrait.md
findings:
  critical: 1
  warning: 5
  info: 3
  total: 9
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-09-11T21:55:29Z
**Depth:** standard
**Files Reviewed:** 78
**Status:** issues_found

## Summary

Reviewed the `@dossier/schema` package (versioned envelope/sub-document validation, migration
walker, share-payload schema) and the `apps/web` Angular shell (IndexedDB wrapper with an
in-memory fallback, character/library repos and stores, autosave, theme/snackbar services, and
the library/character pages), plus the Cloudflare Workers asset shim and the three docs/specs
files touched by this phase's own edits.

The schema package is careful and well-tested: total-rejection load-boundary semantics, code-point
(not UTF-16) string length limits, and control-character stripping are all correct and covered by
targeted tests. The web app's autosave/debounce/flush machinery in `CharacterStore` is intricate
but internally consistent for the scenarios its tests exercise.

The one blocker is a workspace tooling defect, confirmed by reproduction: `pnpm typecheck` (and its
`pnpm lint` alias) fails on a clean checkout because `apps/web` resolves `@dossier/schema`'s types
through `dist/index.d.ts`, and only the `test` script (not `typecheck`/`lint`) builds the schema
package first. This breaks the project's own documented CI gate (`SPEC-deployment.md` §7: "`pnpm
typecheck && pnpm test` green at the workspace root").

The remaining findings are lower-severity robustness/consistency gaps: an unhandled-error path in
`CharacterPage`'s load effect, an unenforced ordering invariant in the migration walker, a
regex-based "no framework deps" guard test with real blind spots, and a couple of minor
duplications/UI mismatches.

## Critical Issues

### CR-01: `pnpm typecheck` / `pnpm lint` fail on a clean checkout — schema package is never built first

**File:** `package.json:11-12`
**Issue:** The root scripts are:
```json
"typecheck": "pnpm -r typecheck",
"lint": "pnpm -r typecheck",
```
`apps/web` depends on `@dossier/schema` via its `exports` map (`packages/schema/package.json:6-11`),
which points at `./dist/index.d.ts` — a build artifact, gitignored (`.gitignore:2`) and not produced
by `packages/schema`'s own `typecheck` script (`tsc -p tsconfig.json --noEmit`, which never emits
`dist/`). Only the `test` script special-cases this (`"test": "pnpm --filter @dossier/schema build
&& pnpm -r test"`); `typecheck`/`lint` do not.

Reproduced directly: with `packages/schema/dist/` removed (the state of a fresh clone before any
build/test run), `pnpm --filter web typecheck` fails with
`error TS2307: Cannot find module '@dossier/schema' or its corresponding type declarations.` in
every file that imports from the schema package (`character-header.component.ts`,
`character-page.component.ts`, `character.repo.ts`, `character.store.ts`, `library.store.ts`).

This breaks the project's own deploy checklist (`docs/specs/SPEC-deployment.md` §7, step 1: "`pnpm
typecheck && pnpm test` green at the workspace root") on the very first run in any fresh environment
(new contributor clone, CI cache miss, etc.), and would give a false-negative typecheck failure
that has nothing to do with the code being changed.

**Fix:** Build the schema package before recursive typecheck/lint, mirroring the `test` script:
```json
"typecheck": "pnpm --filter @dossier/schema build && pnpm -r typecheck",
"lint": "pnpm --filter @dossier/schema build && pnpm -r typecheck",
```
or add a root `pretypecheck`/`prebuild`-style step, or have `packages/schema`'s own `typecheck`
script build first (`tsc -p tsconfig.build.json && tsc -p tsconfig.json --noEmit`).

## Warnings

### WR-01: Unknown errors from `store.load()` become an unhandled promise rejection in `CharacterPage`

**File:** `apps/web/src/app/pages/character/character-page.component.ts:53-65`
**Issue:** `loadCharacter` catches `CharacterNotFoundError`, `UnsupportedVersionError`, and
`InvalidDocumentError` explicitly, and re-throws anything else:
```ts
} else {
  throw err;
}
```
`loadCharacter` is invoked as `void this.loadCharacter(id)` from the constructor's `effect(...)`
(line 39). A re-thrown error inside an `async` function becomes a rejected promise that nothing
awaits or catches — it surfaces only as an unhandled rejection in the console. The user is left on
a page stuck showing the "Loading…" line forever (`store.restoring()` never resolves to a rendered
state) with no snackbar and no navigation away, for any error `CharacterRepo.get`/`validateCharacter`
can throw that isn't one of the three known types (e.g. a genuine IndexedDB failure, or a defensive
`InvalidDocumentError`-adjacent throw added later without updating this list).
**Fix:** Fall back to a generic error path instead of re-throwing into the void:
```ts
} else {
  console.error('[CharacterPage] unexpected load failure', err);
  this.rejectLoad(INVALID_DOCUMENT_MESSAGE);
}
```

### WR-02: Migration walker trusts `plugin.migrations` to be declared in ascending `from`-version order, with nothing enforcing it

**File:** `packages/schema/src/migrate.ts:62-67`
**Issue:**
```ts
let data: unknown = doc.data;
for (const migration of plugin.migrations) {
  if (compareVersions(migration.from, doc.version) >= 0) {
    data = migration.migrate(data);
  }
}
```
The doc comment above `migrateSubDocument` (lines 50-52) states migrations "run, in array order" —
i.e. correctness depends on `plugin.migrations` being listed in ascending version order in the
registry. Nothing in `migrate.ts`, `plugin.ts`, or `fixture-coverage.ts`'s `checkFixtureCoverage`
validates that ordering. A plugin author (this lands in Phase 2+) who appends a new migration out
of order, or reorders an array during a refactor, gets silently wrong migrated data — each
migration mutates whatever the previous one produced, so an out-of-order list can apply a
later-stage transform to earlier-stage data with no error raised anywhere.
**Fix:** Either sort defensively before applying (`[...plugin.migrations].sort((a, b) =>
compareVersions(a.from, b.from))`), or add an assertion in `checkFixtureCoverage` (or a new guard)
that `migrations` is strictly ascending by `from`.

### WR-03: `no-framework-deps.spec.ts`'s import scanner has real blind spots

**File:** `packages/schema/src/__tests__/no-framework-deps.spec.ts:32-48`
**Issue:** The regex `/(?:import|export)[^'"]*from\s+['"]([^'"]+)['"]/g` only matches
`import/export ... from '...'` forms. It does not catch:
- side-effect-only imports: `import 'node:fs';`
- dynamic imports: `await import('node:fs')` or `import('node:fs')`
- `require('node:fs')` (relevant if the package is ever built/consumed as CJS, or a stray `.cts`
  file is added)

This is the sole automated guard for SCHM-01 ("zero framework dependencies"); a future change that
introduces a Node built-in via any of the above forms would pass this test silently while violating
the requirement it exists to enforce.
**Fix:** Broaden the regex to also match bare `import '...'` and `import(...)`/`require(...)` call
forms, e.g. add a second pattern: `/\b(?:import|require)\(\s*['"]([^'"]+)['"]\s*\)/g` and a bare
`import\s+['"]([^'"]+)['"]` pattern, unioning offenders from all three.

### WR-04: HTML `maxlength` on the name field is measured in UTF-16 units while the schema caps code points, silently under-permitting astral text

**File:** `apps/web/src/app/components/character-header/character-header.component.html:13`
**Issue:** `[attr.maxlength]="nameMax"` sets the DOM `maxlength` attribute to `NAME_MAX` (120). Per
the HTML spec, `maxlength` counts UTF-16 code units, whereas Zod 4's `.max()` (used by
`shortText()` in `character.ts`) counts Unicode code points (confirmed in
`node_modules/zod/v4/core/checks.cjs`: `util.codePointLength`). For any name containing astral
characters (e.g. many emoji), the input element will refuse further typing at 60 characters (120
UTF-16 units ÷ 2), well short of the 120 code points the schema and `character.spec.ts` (`accepts
120 astral emoji and rejects 121`) actually allow. This is not a data-loss or validation bug — it
never lets through more than the schema permits — but it's a real, silently-inconsistent UX cap
that contradicts the schema's own documented and tested limit.
**Fix:** Either accept the UX inconsistency explicitly in a comment, or drop the DOM `maxlength`
enforcement for astral-heavy fields and rely on `stripControlCharsExceptTabAndNewline` plus a
code-point-aware truncation on input (mirroring `LibraryStore.duplicate`'s `Array.from(...).slice(...)`
approach at `apps/web/src/app/stores/library.store.ts:86-88`).

### WR-05: `CharacterStore`'s `dirty()` flag update depends on effect scheduling, and `flush()` is a no-op until it runs

**File:** `apps/web/src/app/stores/character.store.ts:40-53, 92-100`
**Issue:** `updateCore()` (lines 82-90) only writes the `character` signal; `dirty.set(true)` happens
inside the `effect()` registered in the constructor, which Angular schedules asynchronously
relative to the signal write (tests rely on `TestBed.tick()` to force this — see
`character.store.spec.ts:66,69,88` etc.). `flush()` is guarded by `if (!this.dirty() || !c) return;`.
The `visibilitychange`/`pagehide` handlers (lines 55-63) call `flush()` directly, with no
`tick()`/microtask wait first. If a user's last keystroke and a tab-hide/pagehide event land in the
same synchronous turn before Angular's effect scheduler has run (plausible on mobile: type a
character, then immediately background the app), `dirty()` can still read `false` at the moment
`flush()` runs, and the edit is silently dropped until the next tick reschedules the debounce timer
— which itself gets raced by the same backgrounding event. The existing tests only assert the timer
fires per the 500ms debounce or via the visibility/pagehide path in isolation; none exercises this
same-turn race.
**Fix:** Make `flush()`'s condition track the underlying pending write instead of only the
`dirty()` signal, e.g. flush based on `character() !== lastPersisted` (which is written
synchronously by the effect body once it runs, but could also be tracked with a plain boolean field
set synchronously inside `updateCore()` itself rather than deferred into the effect).

## Info

### IN-01: Control-character-stripping regex duplicated between schema and web app with no shared source

**File:** `apps/web/src/app/components/character-header/character-header.component.ts:7`,
`packages/schema/src/character.ts:16`
**Issue:** `CONTROL_CHARS_EXCEPT_LF_TAB` is defined independently in both files (with different
flags — `u` in the schema's `.test()` usage, `gu` in the component's `.replace()` usage). They
currently agree, but nothing keeps them in sync if the rule is ever tightened or loosened in one
place.
**Fix:** Export the stripping function (or the bare pattern) from `@dossier/schema` and have the
component import it, rather than re-deriving the same rule.

### IN-02: `resolveMemoryKey` silently collapses a missing key path to the literal string `"undefined"`

**File:** `apps/web/src/app/services/native-indexeddb.service.ts:248-260`
**Issue:** When the memory-fallback backend is active and `data` doesn't have the store's declared
`keyPath` (e.g. `core.id` missing or `core` itself missing), `resolveMemoryKey` returns
`String(undefined)` = `"undefined"`. Two such malformed records would silently overwrite each other
under that one key instead of erroring. Not reachable in this phase's flows (all writers construct
well-typed `Character`/pref records), but the real IndexedDB path would instead throw a
`DataError` for a keyPath miss, so the two backends diverge in this edge case.
**Fix:** Throw when the resolved key path segment is `undefined`, matching native IndexedDB's
behavior of rejecting a record it can't key.

### IN-03: `SHARE_PAYLOAD_BYTES_MAX` is exported but has no enforcement point yet

**File:** `packages/schema/src/limits.ts:12`, `packages/schema/src/share.ts`
**Issue:** `SHARE_PAYLOAD_BYTES_MAX` (512 KB) is exported from the package and re-exported from
`index.ts`, but `sharePayloadSchema` never checks the serialized payload size against it (only
`SHARE_IMAGE_BYTES_MAX` is enforced, via the `images` array refinement). Per
`SPEC-frontend-architecture.md` line 262, this budget is meant to be read by the share/print dialog
UI (a later phase) for a client-side byte estimate, so this is not a defect in this phase's scope —
flagging only so the constant doesn't look like dead code to a future reviewer, and so whichever
phase adds the share dialog remembers this cap has no schema-level backstop (a maliciously large
`pages`/`core` payload would only be caught by transport-layer limits, not by `sharePayloadSchema`).
**Fix:** No action required in this phase; when the share dialog phase lands, consider also adding
a `.refine()` on `sharePayloadSchema` bounding `JSON.stringify(payload).length` for defense in depth
beyond the client-side estimate.

---

_Reviewed: 2026-09-11T21:55:29Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

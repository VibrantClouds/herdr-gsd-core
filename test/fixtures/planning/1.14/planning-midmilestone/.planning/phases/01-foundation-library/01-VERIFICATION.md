---
phase: 01-foundation-library
verified: 2026-09-14T12:20:00Z
status: passed
score: 7/7 must-haves verified
behavior_unverified: 0
overrides_applied: 0
covered_files: [".planning/REQUIREMENTS.md", ".planning/phases/01-foundation-library/01-01-PLAN.md", ".planning/phases/01-foundation-library/01-01-SUMMARY.md", ".planning/phases/01-foundation-library/01-02-PLAN.md", ".planning/phases/01-foundation-library/01-02-SUMMARY.md", ".planning/phases/01-foundation-library/01-03-PLAN.md", ".planning/phases/01-foundation-library/01-03-SUMMARY.md", ".planning/phases/01-foundation-library/01-04-PLAN.md", ".planning/phases/01-foundation-library/01-04-SUMMARY.md", ".planning/phases/01-foundation-library/01-05-PLAN.md", ".planning/phases/01-foundation-library/01-05-SUMMARY.md", ".planning/phases/01-foundation-library/01-06-PLAN.md", ".planning/phases/01-foundation-library/01-06-SUMMARY.md", ".planning/phases/01-foundation-library/01-UAT.md", "apps/web/_worker.js", "apps/web/scripts/check-built-css.mjs", "apps/web/scripts/smoke-worker.mjs", "apps/web/src/app/app.config.ts", "apps/web/src/app/app.routes.ts", "apps/web/src/app/components/character-header/character-header.component.html", "apps/web/src/app/components/character-header/character-header.component.spec.ts", "apps/web/src/app/components/character-header/character-header.component.ts", "apps/web/src/app/pages/character/character-page.component.html", "apps/web/src/app/pages/character/character-page.component.ts", "apps/web/src/app/pages/library/library-page.component.html", "apps/web/src/app/pages/library/library-page.component.ts", "apps/web/src/app/services/character.repo.ts", "apps/web/src/app/services/native-indexeddb.service.ts", "apps/web/src/app/services/prefs.repo.ts", "apps/web/src/app/services/theme.service.ts", "apps/web/src/app/stores/character.store.ts", "apps/web/src/app/stores/library.store.ts", "apps/web/src/styles/_theme.scss", "apps/web/wrangler.jsonc", "docs/specs/SPEC-design-system.md", "docs/specs/SPEC-frontend-architecture.md", "docs/specs/SPEC-gallery-and-portrait.md", "packages/schema/src/__tests__/fixture-coverage.ts", "packages/schema/src/__tests__/fixture-guard.spec.ts", "packages/schema/src/__tests__/no-framework-deps.spec.ts", "packages/schema/src/character.ts", "packages/schema/src/index.ts", "packages/schema/src/limits.ts", "packages/schema/src/migrate.ts", "packages/schema/src/plugin.ts", "packages/schema/src/share.ts"]
covered_digest: "v1:sha256:72b1d556d0630c57c91553f83d4b1606a150074628a135797fec1d176c07d982"
re_verification:
  previous_status: human_needed
  previous_score: 7/7 must-haves verified (4 human verification items outstanding)
  gaps_closed:
    - "Truth 4b (400px, no horizontal scroll, 44px touch targets): rendered geometry measured in 01-UAT.md tests 1, 3, 4"
    - "Human item 1 (400px layout, touch targets, reduced motion): 01-UAT.md test 1 pass"
    - "Human item 2 (theme follows system live, override persists): 01-UAT.md test 2 pass"
    - "Human item 3 (library CRUD end-to-end at 400px): 01-UAT.md test 3 pass"
    - "Human item 4 (character creation round trip, portrait frame): 01-UAT.md test 4 pass"
  gaps_remaining: []
  regressions: []
advisory:
  - finding: "WR-05 same-turn flush path (edit then visibilitychange/pagehide before the autosave effect runs) has no dedicated test; existing flush/pagehide/visibilitychange specs call TestBed.tick() after the edit, so dirty() is already true and they exercise the pre-existing path, not the new one."
    category: other
    reason: "Change is a strict widening of the flush guard (reference identity against lastPersisted, which load() and persist() both set); no truth depends on the uncovered path. A spec that calls flush() immediately after updateCore() without TestBed.tick() would close it."
    evidence_status: "none provided"
  - finding: "WR-02 defensive migration sort has no out-of-order-registry test; SCHEMA_REGISTRY is empty in Phase 1, so no production path reaches it yet."
    category: other
    reason: "Worth a spec once Phase 2 registers the first plugin migrations."
    evidence_status: "none provided"
---

# Phase 1: Foundation + Library Verification Report

**Phase Goal:** A working app shell where users can create, view and persist characters, on a validated shared schema foundation.
**Verified:** 2026-09-14T12:20:00Z
**Status:** passed
**Re-verification:** Yes. The earlier report (2026-09-11T21:52:00Z, human_needed) went stale when code-review fixes WR-01 to WR-05 (6e4c2ce, 44ba3e6, 1247b9e, 0f611f8, a74c320) changed covered files. The four human verification items were run on 2026-09-14, after all five fixes, and recorded in 01-UAT.md.

## Regression Review of the Code-Review Fixes

I read each fix commit's diff against the truths it could affect, then re-ran every behavioral check below against the current tree.

| Fix | Files | Truth at risk | Finding |
|-----|-------|---------------|---------|
| WR-01 (6e4c2ce) | `character-page.component.ts` | SCHM-03 load-error routing | An unexpected load error now logs and routes through `rejectLoad(INVALID_DOCUMENT_MESSAGE)` instead of rethrowing. That is stricter than before: every load failure lands on `/` with a message. No regression. |
| WR-02 (44ba3e6) | `packages/schema/src/migrate.ts` | SCHM-02/03 migration walker | Migrations are applied from a copy of `plugin.migrations` sorted by `compareVersions(a.from, b.from)`. The registry array is not mutated, and the unsupported-version check still runs before any migration. `migrate.spec.ts` (including "migrates … through both steps in order") passes. No regression. |
| WR-03 (1247b9e) | `no-framework-deps.spec.ts` | SCHM-01 zero framework deps | The scanner now also catches side-effect `import '…'`, dynamic `import(…)` and `require(…)`. It still passes against the schema sources, so the stronger check found no hidden framework imports. |
| WR-04 (0f611f8) | `character-header.component.{html,ts,spec.ts}` | CHAR-01 name entry | DOM `maxlength` was removed from the name input. Truncation now happens in `onFieldInput` by code points (`Array.from(...).slice(0, 120)`), matching the schema's code-point limit. A new spec checks that 121 astral characters are cut to 120, and the other three inputs keep maxlength 200. No regression. |
| WR-05 (a74c320) | `character.store.ts` | CHAR-03 autosave/flush | The `flush()` guard is now `!c \|\| c === this.lastPersisted` instead of `!this.dirty()`. `load()` (line 74) and `persist()` (line 109) both set `lastPersisted`, so flush is still a no-op right after load and after a save. It now also writes an edit made in the same turn, before the autosave effect has marked the store dirty. The flush-idempotence, visibilitychange and pagehide specs plus `autosave-persist.integration.spec.ts` pass. No regression. The new path itself has no dedicated test (see Advisory). |

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can create a character (name, species/build, pronouns, orientation) and see it appear in the library view | ✓ VERIFIED | The `character-header` inputs call `CharacterStore.updateCore`, and `LibraryStore.doCreate` writes through `CharacterRepo.put`. The library page renders `store.summaries()`. Web suite 60/60 passing, including the create tests in `library.store.spec.ts`, `library-crud.integration.spec.ts`, and the new WR-04 code-point truncation spec. UAT test 4: created a character and saw it listed after "← Library". |
| 2 | Reloading the browser preserves every character and its edits; the browser has requested persistent storage | ✓ VERIFIED | `autosave-persist.integration.spec.ts` passes: four edited core fields survive a simulated reload. `CharacterRepo.put()` calls `requestPersistence()` once, after the first successful write, and `character.store.spec.ts` checks that ("never on load alone"). After WR-05, `flush()` still writes exactly once per edit (flush-idempotence spec passes). UAT test 4: "All changes saved" appeared 641ms after typing, and all four values were intact after a real browser reload. |
| 3 | User can open, duplicate, and delete any character from the library | ✓ VERIFIED | The library page's Open (`routerLink`), Duplicate and `window.confirm`-gated Delete buttons are wired to `LibraryStore.duplicate` and `.remove`, and the `library.store.spec.ts` duplicate/remove specs pass. UAT test 3: duplicate produced "(copy)", cancelling the delete left the list unchanged, confirming removed the item, and the list was identical after reload. |
| 4a | Theme follows system preference with a persisting manual override (DSGN-01) | ✓ VERIFIED | `theme.service.spec.ts` passes, and `ThemeService.init()` runs before first render via `provideAppInitializer`. UAT test 2 (emulated color scheme): dark by default under OS dark. An explicit Light or Dark choice beat the OS setting and survived reload in both directions. In System mode the attribute was removed and the app followed the OS dark-to-light-to-dark without a reload. |
| 4b | App shell works at 400px width, no horizontal scrolling, 44px touch targets (DSGN-02) | ✓ VERIFIED | `check-built-css.mjs` confirms `--touch-target-min: 44px` is in the built CSS. The rendered geometry was measured in 01-UAT.md tests 1, 3 and 4 (Playwright, 400x800): `scrollWidth` 400 = `clientWidth` on the library and character pages, and every control is 44px tall (New character 108x44, theme radios 82/70/67x44, card link 135x44, Duplicate 81x44, Delete 64x44, Display options 114x44). This was the backstop-tagged truth; the UAT measurements settle it. |
| 4c | Animation disabled when reduced-motion is set (DSGN-03) | ✓ VERIFIED | The global `prefers-reduced-motion: reduce` rule is in the built CSS (`check-built-css.mjs` PASS). UAT test 1: computed `transition-duration` is 0.12s normally and 1e-06s under `reducedMotion: reduce`. |
| 5 | Fixture-guard test passes; app builds via the standard Angular builder; deploys to Cloudflare Workers static assets with SPA fallback | ✓ VERIFIED | `pnpm -r build` exits 0 (schema `tsc`, then `ng build`). Schema suite 36/36, including `fixture-guard.spec.ts`. `smoke-worker.mjs` against a live `wrangler dev`: 11/11 PASS (SPA root and deep link 200, no-cache HTML, CSP on both, no inline onload, immutable hashed bundle, non-immutable favicon). |

**Score:** 7/7 truths verified (0 present, behavior-unverified)

### Advisory (New Scope, Unevidenced)

| # | Finding | Category | Why Advisory |
|---|---------|----------|--------------|
| 1 | WR-05's same-turn flush path (edit, then tab hide before the effect runs) has no dedicated spec | other | New scope from the fix, no failing evidence; no truth depends on it |
| 2 | WR-02's defensive migration sort has no out-of-order-registry spec | other | New scope, no failing evidence; `SCHEMA_REGISTRY` is empty in Phase 1 |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/schema/src/character.ts` | envelope schema, createEmptyCharacter | ✓ VERIFIED | Unchanged since the initial verification; used by CharacterRepo and library.store |
| `packages/schema/src/migrate.ts` | UnsupportedVersionError, InvalidDocumentError, compareVersions, migrate/validate walker | ✓ VERIFIED | WR-02 added a sorted copy of the migrations; all named exports still present |
| `packages/schema/src/plugin.ts` | Migration, SubDocumentSchema, SCHEMA_REGISTRY (empty in Phase 1) | ✓ VERIFIED | Unchanged |
| `packages/schema/src/share.ts` | ShareKind, SharePayload, sharePayloadSchema | ✓ VERIFIED | Unchanged |
| `packages/schema/src/__tests__/fixture-guard.spec.ts` | mechanical fixture-coverage guard | ✓ VERIFIED | Passing in the 36/36 schema run |
| `packages/schema/src/__tests__/no-framework-deps.spec.ts` | SCHM-01 zero-framework-deps guard | ✓ VERIFIED | WR-03 widened the scanner; still passing |
| `apps/web/src/app/stores/character.store.ts` | load/updateCore/flush, 500ms autosave, tab-hide flush | ✓ VERIFIED | 118 lines; WR-05 guard change reviewed above |
| `apps/web/src/app/stores/library.store.ts` | create/duplicate/remove/refresh with ordering | ✓ VERIFIED | Unchanged |
| `apps/web/src/app/components/character-header/*` | masthead core-field inputs | ✓ VERIFIED | WR-04 code-point truncation, with spec |
| `apps/web/src/app/pages/library/library-page.component.ts`/`.html` | open/duplicate/delete rows, empty state, rejected notice | ✓ VERIFIED | Unchanged; confirmed rendered in UAT test 3 |
| `apps/web/src/app/pages/character/character-page.component.ts`/`.html` | masthead editor, load-error routing | ✓ VERIFIED | WR-01: unknown errors now reject and route instead of rethrowing |
| `apps/web/src/app/services/theme.service.ts` | ThemeService with theme signal, init(), set() | ✓ VERIFIED | Unchanged; wired via `provideAppInitializer` |
| `apps/web/src/styles/_theme.scss` | design tokens, theming rule, reduced-motion rule | ✓ VERIFIED | Unchanged; present in the built CSS |
| `docs/specs/SPEC-*.md` (3) | D-P1/D-P2 spec corrections | ✓ VERIFIED | Unchanged |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `library-page.component.html` | `library.store.ts` | duplicate/delete click handlers (delete behind `window.confirm`) | ✓ WIRED | Exercised end to end in UAT test 3 |
| `character-page.component.ts` | `character.store.ts` | `store.load(id)` in an `effect()`, error branches for the named error classes plus a generic fallback | ✓ WIRED | WR-01 added the generic fallback |
| `character-header.component.ts` | `character.store.ts` | `coreChange` output to `updateCore` | ✓ WIRED | Round trip confirmed in UAT test 4 |
| `character.repo.ts` | `packages/schema` (`validateCharacter`) | `get()`/`list()` validate every record | ✓ WIRED | Unchanged |
| `character.repo.ts` | `native-indexeddb.service.ts` (`requestPersistence`) | `put()`, once, after the first successful write | ✓ WIRED | Unchanged |
| `app.config.ts` | `theme.service.ts` | `provideAppInitializer` | ✓ WIRED | Unchanged |
| `apps/web/wrangler.jsonc` | `apps/web/_worker.js` | `main`, `assets.run_worker_first: true` | ✓ WIRED | Live `smoke-worker.mjs` 11/11 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `library-page.component.html` | `store.summaries()` | `LibraryStore.refresh()` → `CharacterRepo.list()` → IndexedDB `getAll` | Yes (UAT 3: list identical after reload) | ✓ FLOWING |
| `character-page.component.html` | `store.core()` | `CharacterStore.load()` → `CharacterRepo.get()` → IndexedDB `getByKey` | Yes (UAT 4: values intact after reload) | ✓ FLOWING |
| `_theme.scss` tokens | CSS custom properties | Static design tokens | N/A (static by design) | ✓ FLOWING (by design) |

### Behavioral Spot-Checks

All of these were re-run on 2026-09-14 against the current tree (HEAD a513c84, which includes all five fixes).

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Monorepo builds (schema before web) | `pnpm -r build` | exit 0; schema `tsc`, then `ng build` (main 255.68 kB, styles 4.59 kB) | ✓ PASS |
| Full schema test suite | `pnpm exec vitest run` (packages/schema) | 5 files / 36 tests passed | ✓ PASS |
| Full web test suite | `npx ng test --watch=false` (apps/web) | 12 files / 60 tests passed (59 previously, plus the WR-04 astral truncation spec) | ✓ PASS |
| Built CSS tokens, theming, reduced-motion, banned patterns | `node apps/web/scripts/check-built-css.mjs` | 8/8 PASS | ✓ PASS |
| Workers SPA fallback, CSP and caching against live `wrangler dev` | `node apps/web/scripts/smoke-worker.mjs` | 11/11 PASS, exit 0 | ✓ PASS |
| Rendered 400px geometry, live theme tracking, CRUD and creation round trip | Playwright UAT, recorded in 01-UAT.md | 4/4 pass (2026-09-14, after the fixes) | ✓ PASS |

### Probe Execution

This phase declares no `scripts/*/tests/probe-*.sh` probes. `check-built-css.mjs` and `smoke-worker.mjs` do that job and were run directly for this re-verification.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| CHAR-01 | 01-01, 01-02, 01-05, 01-06 | Create character with name/species/pronouns/orientation | ✓ SATISFIED | Header inputs and store wiring; unit tests; UAT 4 |
| CHAR-02 | 01-05 | Library view: open/duplicate/delete | ✓ SATISFIED | LibraryPage and LibraryStore; unit tests; UAT 3 |
| CHAR-03 | 01-01, 01-04, 01-06 | Autosave within 1s, survives reload, requests persistent storage on first write | ✓ SATISFIED | 500ms debounce; integration spec; UAT 4 (saved at 641ms, values intact after reload) |
| SCHM-01 | 01-01, 01-03 | Shared schema validates identically browser/server | ✓ SATISFIED | Widened `no-framework-deps.spec.ts` passes |
| SCHM-02 | 01-02, 01-03 | Versioned migration registry + fixture guard | ✓ SATISFIED | `fixture-guard.spec.ts`; sorted walker (WR-02) |
| SCHM-03 | 01-03, 01-06 | Unsupported version rejected outright, nothing partially applied | ✓ SATISFIED | `migrate.spec.ts`; load-error routing including the WR-01 generic fallback |
| OPS-02 | 01-01, 01-04 | Angular standard builder + Cloudflare Workers static assets + SPA fallback | ✓ SATISFIED | Build exit 0; `smoke-worker.mjs` 11/11 |
| DSGN-01 | 01-04 | Light/dark themes, system preference, persisting override | ✓ SATISFIED | `theme.service.spec.ts`; UAT 2 |
| DSGN-02 | 01-04, 01-06 | 400px width, 44px touch targets, no horizontal scroll | ✓ SATISFIED | Built-CSS token; UAT 1/3/4 measured geometry |
| DSGN-03 | 01-04 | Disable animation under reduced-motion | ✓ SATISFIED | Built-CSS rule; UAT 1 (1e-06s under reduce) |

No orphaned requirements. All 10 Phase 1 IDs in REQUIREMENTS.md appear in the plans' frontmatter.

### Anti-Patterns Found

None. I scanned the seven files changed by the fixes for `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER|not yet implemented` and found zero matches. The rest of the covered set is unchanged since the initial scan, which was also clean.

### Human Verification Required

None outstanding. All four earlier items were run on 2026-09-14, after the five code-review fixes, and passed. Playwright evidence is in `.planning/phases/01-foundation-library/01-UAT.md` (status: complete, 4 passed, 0 issues):

| # | Item | UAT result |
|---|------|------------|
| 1 | 400px layout, 44px touch targets, reduced motion | pass (UAT test 1) |
| 2 | Theme follows system live; override persists in both directions | pass (UAT test 2) |
| 3 | Library CRUD end to end at 400px | pass (UAT test 3) |
| 4 | Character creation round trip; non-circular 3:4 portrait frame | pass (UAT test 4: `.portrait-frame` 96x128, aspect-ratio 3/4, border-radius 10px) |

### Gaps Summary

No gaps and no regressions. The five code-review fixes each narrow a failure mode (unhandled load errors, registry ordering, scanner blind spots, UTF-16 vs code-point truncation, a same-turn flush race) without weakening any truth. Every automated check passes against the current tree: build exit 0, schema 36/36, web 60/60, built CSS 8/8, live Workers smoke 11/11. The only truth that couldn't be settled by code inspection before, 400px/44px rendered geometry, was measured in UAT. The two advisory items are missing tests for new defensive paths and do not block the phase.

---

_Verified: 2026-09-14T12:20:00Z_
_Verifier: Claude (gsd-verifier)_

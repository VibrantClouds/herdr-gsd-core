---
phase: 01-foundation-library
fixed_at: 2026-09-11T22:19:13Z
review_path: .planning/phases/01-foundation-library/01-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 01: Code Review Fix Report

**Fixed at:** 2026-09-11T22:19:13Z
**Source review:** .planning/phases/01-foundation-library/01-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 6 (1 critical, 5 warning; `fix_scope: critical_warning` — Info findings IN-01 through IN-03 excluded by scope)
- Fixed: 6
- Skipped: 0

**Verification note:** All fixes were applied and verified inside an isolated git worktree (`.claude/worktrees/rf-01-1426119-1789164806`, no `node_modules` present by design). Tier 1 (re-read) verification was performed for every fix; Tier 2 (syntax check) was applied where a checker was available without a project install (`node -e "JSON.parse(...)"` for `package.json`). TypeScript/Angular files fell back to Tier 3 (Tier 1 only) since `tsc`/`ng` require `node_modules`, which the isolated worktree intentionally does not have. **The numbers above are not yet confirmed by a live `pnpm typecheck && pnpm test` run** — that should happen in the main checkout (where `node_modules` exists) before this phase is considered verified.

## Fixed Issues

### CR-01: `pnpm typecheck` / `pnpm lint` fail on a clean checkout — schema package is never built first

**Files modified:** `package.json`
**Commit:** `8dca8dc`
**Applied fix:** Changed the root `typecheck` and `lint` scripts to build `@dossier/schema` first, mirroring the existing `test` script: `"pnpm --filter @dossier/schema build && pnpm -r typecheck"`.

### WR-01: Unknown errors from `store.load()` become an unhandled promise rejection in `CharacterPage`

**Files modified:** `apps/web/src/app/pages/character/character-page.component.ts`
**Commit:** `6e4c2ce`
**Applied fix:** Replaced the re-throw in the final `else` branch of `loadCharacter`'s catch block with `console.error(...)` plus `this.rejectLoad(INVALID_DOCUMENT_MESSAGE)`, matching the existing rejection pattern used for the three known error types. Any unexpected error now shows a snackbar and navigates away instead of leaving the page stuck on "Loading…" with an unhandled rejection.

### WR-02: Migration walker trusts `plugin.migrations` to be declared in ascending `from`-version order, with nothing enforcing it

**Files modified:** `packages/schema/src/migrate.ts`
**Commit:** `44ba3e6`
**Applied fix:** `migrateSubDocument` now sorts a copy of `plugin.migrations` by `from`-version (via `compareVersions`) before applying them, so registry ordering can never silently apply migrations out of sequence. Updated the function's doc comment to describe "ascending `from`-version order" instead of "array order" to match.
**Note:** Scoped to `migrateSubDocument` per the finding's cited file/lines (`migrate.ts:62-67`). `migrateEnvelope` (lines 92-96 in the reviewed version) has the same unenforced-ordering shape but was not cited by this finding and was left untouched — flagging as a possible follow-up, not applied here (see improvements list below).

### WR-03: `no-framework-deps.spec.ts`'s import scanner has real blind spots

**Files modified:** `packages/schema/src/__tests__/no-framework-deps.spec.ts`
**Commit:** `1247b9e`
**Applied fix:** Added two additional regex patterns alongside the existing `from '...'` pattern: a bare side-effect import (`import '...'`) pattern, and a dynamic `import(...)`/`require(...)` call pattern. All three patterns are now scanned per source file, with results merged into the same `offenders` list. Verified no existing legitimate `import(`/`require(` usage exists in `packages/schema/src` outside `__tests__`, so no new true offenders are introduced by broadening the scan.

### WR-04: HTML `maxlength` on the name field is measured in UTF-16 units while the schema caps code points, silently under-permitting astral text

**Files modified:** `apps/web/src/app/components/character-header/character-header.component.html`, `apps/web/src/app/components/character-header/character-header.component.ts`, `apps/web/src/app/components/character-header/character-header.component.spec.ts`
**Commit:** `0f611f8`
**Applied fix:** Took the review's second fix option (functional fix over comment-only): removed `[attr.maxlength]="nameMax"` from the name `<input>` and added code-point-aware truncation to `NAME_MAX` inside `onFieldInput` for the `name` field only (mirroring `LibraryStore.duplicate`'s `Array.from(...).slice(...).join('')` pattern cited in the review). Updated the existing spec test that asserted `maxLength === 120` (now `-1`, since the DOM attribute is gone) and added a new spec test proving 121 astral characters truncate to 120 code points on input, matching the schema's own limit.

### WR-05: `CharacterStore`'s `dirty()` flag update depends on effect scheduling, and `flush()` is a no-op until it runs

**Files modified:** `apps/web/src/app/stores/character.store.ts`
**Commit:** `a74c320`
**Applied fix:** Changed `flush()`'s guard from `!this.dirty() || !c` to `!c || c === this.lastPersisted`. `character.set(...)` inside `updateCore()` runs synchronously, so this reference comparison diverges from `lastPersisted` immediately on edit — unlike `dirty()`, which is only set `true` inside the constructor's `effect()` on its next scheduled run. This closes the same-turn race where a `visibilitychange`/`pagehide` event fires before the effect has had a chance to run. Traced through `load()`'s existing `await this.flush()` call and the `persist()`/effect interplay to confirm behavior is unchanged for all previously-passing scenarios (first load, no-op flush, debounce, double-flush).
**Status:** `fixed: requires human verification` — this is a logic/timing fix for a race condition; Tier 1/2 verification confirms the code is syntactically intact and internally consistent with existing call sites, but the actual same-turn race scenario (edit + immediate backgrounding within one synchronous turn, before Angular's effect scheduler runs) is not exercised by the existing test suite and was not able to be run in this isolated worktree (no `node_modules`). Recommend running `apps/web/src/app/stores/character.store.spec.ts` and, ideally, adding a same-turn race regression test before considering this fully verified.

## Skipped Issues

None — all in-scope findings were fixed.

## Improvements Noticed (not applied — out of scope for this fix pass)

- `migrateEnvelope` (`packages/schema/src/migrate.ts`, envelope-level migration loop) has the same unenforced-ordering shape as WR-02's `migrateSubDocument`, but was not cited by the finding and was left unsorted. Consider a follow-up finding/fix if envelope migrations are expected to grow past a handful of entries.
- The `species`/`pronouns`/`orientation` fields in `character-header.component.html` still use `[attr.maxlength]="shortTextMax"`, which has the same UTF-16-vs-code-point mismatch as the name field did (WR-04). Not cited by the review (which named only `character-header.component.html:13`, the name field), so left unchanged.

---

_Fixed: 2026-09-11T22:19:13Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_

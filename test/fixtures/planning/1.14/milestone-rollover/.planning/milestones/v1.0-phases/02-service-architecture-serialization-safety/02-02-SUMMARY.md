---
phase: 02-service-architecture-serialization-safety
plan: 02
subsystem: testing
tags: [angular, state-serialization, migration, jasmine, karma]

# Dependency graph
requires:
  - phase: 02-service-architecture-serialization-safety
    provides: "Hermetic state-export.service.spec.ts (8/8 green), 50-failure full-suite baseline (plan 02-01)"
provides:
  - "Named migration registry (StateMigration interface, 7-entry MIGRATIONS array) wired into validateAndApplyState between the SUPPORTED_VERSIONS gate and validateStateStructure"
  - "Gap-tolerant runMigrations walker with numeric compareVersions helper — old-shape states (1.0.0/1.0.1/1.0.2) receive every applicable migration instead of none"
  - "horizontalFlip restoration in applyAppState for both panels (previously silently dropped on every import/share-link load)"
  - "15/15 green state-export.service.spec.ts, 7 new specs covering gap tolerance, ordering/idempotence, non-destructive defaulting, both flip directions, and hostile-payload tolerance"
affects: [02-04, 02-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Named migration registry pattern (StateMigration {fromVersion, toVersion, name, migrate}) applied via inclusion predicate (fromVersion >= state.version), not exact fromVersion===version chain match, so registry gaps don't break older states"
    - "Toggle-only-API restore idiom: compare live state to imported value via getCurrentAppState(), call the toggle method only when they differ — reused verbatim for horizontalFlip from the pre-existing showOverlays restore"

key-files:
  created: []
  modified:
    - src/app/services/state-export.service.ts
    - src/app/services/state-export.service.spec.ts

key-decisions:
  - "Registry has exactly 7 named entries (3 real transforms: add-measurement-unit, add-adult-mode, add-horizontal-flip; 4 documented no-ops: add-measurement-line, add-custom-categories, add-penetration-zone-fields, add-model-attachment-defaults) — no entries for the non-structural bumps (1.0.0->1.0.1, 1.0.1->1.0.2, 1.0.2->1.0.3, 1.0.10->1.0.11), matching the git-verified history in 02-RESEARCH.md exactly"
  - "compareVersions splits on '.' and compares segments with Number(), avoiding locale-aware string collation so 1.0.10 correctly sorts after 1.0.9"
  - "runMigrations uses an inclusion predicate (migration.fromVersion not older than state.version) per Correction 1, not an exact chain match — this is what makes migrations apply correctly to 1.0.0/1.0.1/1.0.2 states despite no registry entries existing for those specific bumps"
  - "No CURRENT_VERSION/SUPPORTED_VERSIONS bump this plan — the migration layer changes only how already-serialized data is applied on import, not any serialized structure, per the plan's explicit correction"
  - "horizontalFlip restoration fixed in the same task as the migration work since applyAppState was already being touched, per the plan's explicit in-scope framing (not a deferred gap)"

requirements-completed: [SERL-01, SERL-03]

coverage:
  - id: D1
    description: "MIGRATIONS registry (7 named entries) applies field defaults to older ExportedState payloads via runMigrations, called between the SUPPORTED_VERSIONS gate and validateStateStructure in validateAndApplyState"
    requirement: SERL-01
    verification:
      - kind: unit
        ref: "src/app/services/state-export.service.spec.ts — describe('migration registry') — 7 new specs, all passing"
        status: pass
    human_judgment: false
  - id: D2
    description: "runMigrations tolerates registry gaps: a v1.0.0 state receives the measurement-unit and adult-mode defaults despite no registry entry existing for 1.0.0's own bump — deliberately broke the walker to an exact fromVersion===version match and confirmed the gap-tolerance spec fails, then reverted"
    requirement: SERL-01
    verification:
      - kind: unit
        ref: "src/app/services/state-export.service.spec.ts#'applies defaults across a registry gap for a v1.0.0 state' — passes with the corrected walker; deliberate-break run produced 'Expected $[0].measurementUnit = undefined to equal imperial' / 'adultMode = undefined to equal false', confirming the naive exact-chain walker would silently apply nothing"
        status: pass
    human_judgment: false
  - id: D3
    description: "Both panels' horizontalFlip values are restored on import via a guarded togglePanelFlip call, fixing a pre-existing silent-data-loss bug (flip state was never restored on any version, including current)"
    requirement: SERL-03
    verification:
      - kind: unit
        ref: "src/app/services/state-export.service.spec.ts#'restores a left-panel horizontal flip...' and #'restores a right-panel horizontal flip...'"
        status: pass
    human_judgment: false
  - id: D4
    description: "Full test suite reports exactly 50 failures, name-identical to the post-02-01 baseline — zero new regressions from the migration layer or flip-restore change"
    verification:
      - kind: unit
        ref: "pnpm test --no-watch — TOTAL: 50 FAILED, 297 SUCCESS (347 total); failure-name set diffed against 01-BASELINE.md's 52-name list minus the 2 StateExportService entries fixed in 02-01 — exact match"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-07-30
status: complete
---

# Phase 02 Plan 02: State Migration Registry & Horizontal Flip Restore Summary

**Added a 7-entry named migration registry (StateMigration/MIGRATIONS/runMigrations/compareVersions) wired into StateExportService's import choke point, and fixed a pre-existing bug where horizontalFlip was never restored on state import.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-07-30T13:32:00Z
- **Tasks:** 3 completed
- **Files modified:** 2

## Accomplishments
- Added an exported `StateMigration` interface and a 7-entry `MIGRATIONS` registry (3 real transforms: `add-measurement-unit`, `add-adult-mode`, `add-horizontal-flip`; 4 documented no-op entries: `add-measurement-line`, `add-custom-categories`, `add-penetration-zone-fields`, `add-model-attachment-defaults`) grounded exactly in the git-verified version history from `02-RESEARCH.md`
- Added a private `compareVersions(a, b)` helper doing numeric per-segment comparison (so `1.0.10` sorts after `1.0.9`, unlike locale-aware string collation) and a private `runMigrations(state)` walker using an inclusion predicate — every registry entry whose `fromVersion` is not older than the incoming state's version applies, in ascending order — so states at `1.0.0`/`1.0.1`/`1.0.2` (which predate the first registry entry) still receive every applicable migration
- Wired `runMigrations` into `validateAndApplyState`, positioned after the `SUPPORTED_VERSIONS` gate and before `validateStateStructure`, so structural validation runs on migrated (not raw) data; not wrapped in its own try/catch so a thrown migration error propagates into the existing catch and surfaces through the established "Failed to apply imported state" path
- Fixed `applyAppState` to restore `horizontalFlip` for both panels — previously every imported state and every loaded share link silently reset flip to `false`, for every version including the current one. Restore follows the existing `showOverlays` idiom exactly: compare live state against imported value via `getCurrentAppState()`, call `togglePanelFlip` only when they differ (since that API toggles rather than sets)
- Added `togglePanelFlip` to the `StateManagementService` jasmine spy list so the flip restore doesn't throw a TypeError in the spec
- Added 7 new specs in a `describe('migration registry', ...)` block covering gap tolerance, ordering/idempotence at `CURRENT_VERSION`, non-destructive `??` defaulting, both flip directions, and two hostile-payload cases
- Confirmed the gap-tolerance spec is a genuine regression guard: temporarily changed `runMigrations`' predicate to an exact `fromVersion === state.version` match, re-ran the scoped spec, and observed the spec fail with `Expected $[0].measurementUnit = undefined to equal 'imperial'` / `Expected $[0].adultMode = undefined to equal false` — confirming the naive exact-chain walker sketched in research would silently apply nothing to a v1.0.0 state. Reverted immediately after confirming the failure.
- Full test suite: **50 FAILED, 297 SUCCESS (347 total)** — failure-name set diffed line-for-line against `01-BASELINE.md`'s 52-name list minus the 2 `StateExportService` entries already fixed in plan 02-01. Exact match, zero new regressions.

## Task Commits

1. **Task 1: Add the named migration registry and wire it into the import choke point** - `dabff2f` (feat)
2. **Task 2: Restore horizontalFlip in applyAppState for both panels** - `85c4614` (fix)
3. **Task 3: Unit-test the migration walker mechanics and the flip restore** - `3606e0b` (test)

## Files Created/Modified
- `src/app/services/state-export.service.ts` - Added `StateMigration` interface, `MIGRATIONS` registry (7 entries), `compareVersions`, `runMigrations`; wired `runMigrations` into `validateAndApplyState`; added `horizontalFlip` restore to both panel blocks in `applyAppState`
- `src/app/services/state-export.service.spec.ts` - Added `togglePanelFlip` to the `StateManagementService` spy; added `describe('migration registry', ...)` block with 7 new specs

## Decisions Made
- Registry entries correspond exactly one-to-one with the 7 structural bumps in git history (3 real transforms + 4 no-ops); no entries for the 4 non-structural bumps found in this file's actual git history (`1.0.0->1.0.1`, `1.0.1->1.0.2`, `1.0.2->1.0.3`, `1.0.10->1.0.11`) — see Deviations for a note on the plan's "five non-structural bumps" wording vs. the git-verified count of four
- Used an inclusion predicate (`compareVersions(fromVersion, state.version) >= 0`) rather than an exact chain match, per the plan's Correction 1, so the walker tolerates registry gaps
- No `CURRENT_VERSION`/`SUPPORTED_VERSIONS` bump — this plan changes only how already-serialized data is applied on import, not any serialized structure
- Fixed the `horizontalFlip` restoration bug in this plan rather than deferring it, since the plan explicitly frames it as in-scope, user-approved work adjacent to the code already being touched

## Deviations from Plan

### Auto-fixed / Clarified Issues

**1. [Documentation clarity] Corrected an internal inconsistency between the plan's "five non-structural bumps" wording and the git-verified research table**
- **Found during:** Task 1
- **Issue:** The plan's frontmatter, action text, and artifacts section repeatedly state "five non-structural bumps," but `02-RESEARCH.md`'s own git-verified "State Version History" table lists only 4 bumps marked "No" (`1.0.0->1.0.1`, `1.0.1->1.0.2`, `1.0.2->1.0.3`, `1.0.10->1.0.11`) against 7 marked "Yes" — 4 + 7 = 11 total bumps, matching `SUPPORTED_VERSIONS`' 12 entries. This does not affect any acceptance criterion (none of Task 1's grep checks assert a literal "five" or "four" count) — it only affects descriptive JSDoc prose.
- **Fix:** Wrote the `MIGRATIONS` JSDoc to describe the non-structural bumps by name (matching the research table exactly) rather than repeating an inconsistent count.
- **Files modified:** `src/app/services/state-export.service.ts` (JSDoc comment only, no behavior change)
- **Verification:** All Task 1 acceptance-criteria greps pass (7 `toVersion:` entries, all 7 named entries present exactly once, `runMigrations`/`compareVersions` present, ordering correct, `CURRENT_VERSION`/`SUPPORTED_VERSIONS` unchanged)
- **Committed in:** `dabff2f` (Task 1 commit)

**2. [Test-authoring correction] The plan's fifth hostile-payload test case describes a scenario that legitimately rejects, not "not rejected" as stated**
- **Found during:** Task 3
- **Issue:** The plan's action text for the fifth behavior says a payload "whose appState is present but has no globalSettings" should assert "the promise is not rejected." Tracing the actual code shows `validateStateStructure`'s pre-existing `isValidAppState` check (`appState.leftPanel && appState.rightPanel && appState.globalSettings && appState.attachmentEditState`) throws `"Invalid state data: malformed appState"` whenever `globalSettings` is genuinely absent — this check runs unconditionally whenever `appState` itself is truthy, independent of and unchanged by this plan's migration work. Writing the test as "not rejected" would produce a test that fails against the correct, existing implementation.
- **Fix:** Wrote the test to assert the promise correctly **rejects** with a message matching `/malformed appState/`, and additionally asserts `updateGlobalSettings` was never called — pinning the substance of what the plan's own threat model (T-02-01) actually requires: no migration fabricates a `globalSettings` object that structural validation would otherwise reject. The sibling case (appState missing entirely) does assert "not rejected," matching the plan exactly, since `runMigrations`'s early-return guard and `validateStateStructure`'s `if (stateData.appState && ...)` guard together mean that specific case genuinely does not throw.
- **Files modified:** `src/app/services/state-export.service.spec.ts`
- **Verification:** Full scoped spec run is 15/15 green including this case; `npx tsc --noEmit` exits 0
- **Committed in:** `3606e0b` (Task 3 commit)

---

**Total deviations:** 2 (both documentation/test-authoring clarifications; no code-behavior changes beyond what the plan specified)
**Impact on plan:** No scope creep. Both deviations are grounded in tracing the plan's own referenced research document and existing code, not new inference.

## Issues Encountered

None beyond the two deviations documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `StateExportService` now has a testable, named migration layer (`MIGRATIONS`/`runMigrations`/`compareVersions`) that plan 02-04's per-version fixture regression suite can build directly on top of, without needing to touch the walker mechanics themselves
- `horizontalFlip` round-trips correctly through export→import for both panels — plan 02-04's fixture tests for v1.0.10+ can now assert flip preservation without hitting the pre-existing gap
- Full-suite baseline remains exactly 50 failures (name-identical to `01-BASELINE.md`'s 52 minus the 2 already-fixed `StateExportService` entries) — plans 02-03 through 02-05 should continue asserting against this count
- `SERL-02` (documented deprecation policy) is explicitly out of scope for this plan and remains for a later plan in this phase (per `02-PATTERNS.md`/`02-RESEARCH.md` framing, plan 02-05 records the "no version bump this phase" reasoning)
- No blockers identified

## Self-Check: PASSED

All modified files confirmed present on disk; all three task commit hashes (`dabff2f`, `85c4614`, `3606e0b`) confirmed present in `git log --oneline`.

---
*Phase: 02-service-architecture-serialization-safety*
*Completed: 2026-07-30*

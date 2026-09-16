---
phase: 02-service-architecture-serialization-safety
plan: 05
subsystem: documentation
tags: [angular, state-serialization, migration, documentation, phase-gate]

# Dependency graph
requires:
  - phase: 02-service-architecture-serialization-safety
    provides: "Named migration registry + horizontalFlip restore (02-02), CategoryService direct constructor injection (02-03), twelve-fixture regression suite + coverage guard (02-04)"
provides:
  - "Corrected .claude/rules/state-serialization.md worked example (CURRENT_VERSION/SUPPORTED_VERSIONS now match code exactly, twelve entries not five)"
  - "Version Deprecation Policy section: supported-versions source of truth, three-part bump procedure, retirement process, unsupported-version rejection behavior"
  - "Known Gaps and Scope Decisions section: Phase-5 test-scaffolding pull-forward, indexeddb-user-model.service.ts coverage gap, state-export.migrations.ts extraction threshold"
  - "Verified phase close-out: all five ROADMAP.md Phase 2 success criteria confirmed with recorded command evidence"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Deprecation-policy-as-mechanically-enforced-prose pattern: the documented supported-version list is tied to a grep-verifiable literal in state-export.service.ts and to the fixture-coverage guard spec added in 02-04, so the prose cannot silently drift again without a failing test or a failing acceptance grep"

key-files:
  created: []
  modified:
    - .claude/rules/state-serialization.md
    - .planning/phases/02-service-architecture-serialization-safety/02-05-SUMMARY.md
    - .planning/REQUIREMENTS.md

key-decisions:
  - "Version Deprecation Policy section inserted between the existing 'When to Bump Version' table and 'What Gets Serialized' section (a natural read order: what to bump -> the fuller policy around bumping -> what's actually serialized), rather than appended at the end, so a reader following the existing document top-to-bottom encounters the corrected example immediately before the expanded policy that explains it"
  - "Known Gaps and Scope Decisions appended at the very end, after the pre-existing 'Do NOT' section, so it reads as a closing note rather than interrupting the operational rules a contributor consults day-to-day"
  - "No CURRENT_VERSION/SUPPORTED_VERSIONS bump in this plan — confirmed via direct grep against state-export.service.ts, both before and after Task 1's edits, since this plan only corrects documentation and closes out the phase"
  - "The live share-link round-trip check (SERL-03's cross-cutting manual verification) and this plan's own human-check on the policy document are Manual-Only Verifications per 02-VALIDATION.md — both require either a human reader or a live share API this environment doesn't have credentials/network access to reach, and are recorded as pending human verification rather than fabricated as passed"

requirements-completed: [SERL-02]

coverage:
  - id: D1
    description: "state-serialization.md worked example corrected to match state-export.service.ts exactly (CURRENT_VERSION '1.0.11', twelve-entry SUPPORTED_VERSIONS), and the stale four-versions-old example is gone"
    requirement: SERL-02
    verification:
      - kind: unit
        ref: "grep -c \"CURRENT_VERSION = '1.0.4'\" .claude/rules/state-serialization.md returns 0; grep -c \"'1.0.11'\" returns 3; grep -c \"'1.0.10', '1.0.11'\" returns 2"
        status: pass
    human_judgment: false
  - id: D2
    description: "Version Deprecation Policy section (supported versions, bump procedure, retirement, unsupported-version behavior) and Known Gaps and Scope Decisions section both present exactly once, front matter untouched"
    requirement: SERL-02
    verification:
      - kind: unit
        ref: "grep -c '## Version Deprecation Policy' returns 1; grep -c '## Known Gaps and Scope Decisions' returns 1; grep -c 'MIGRATIONS' returns 3; grep -c 'state-export.migrations.ts' returns 1; grep -c 'indexeddb-user-model' returns 1; head -3 shows paths: front matter intact"
        status: pass
    human_judgment: false
  - id: D3
    description: "Full suite reports exactly 50 failures, name-identical to the 52-name Phase 1 baseline minus the 2 StateExportService entries retired by plan 02-01 — zero new regressions; no NG0200/circular-dependency diagnostics; production build and type check both clean"
    requirement: SERL-02
    verification:
      - kind: unit
        ref: "npx tsc --noEmit exit 0; pnpm run build exit 0 (775.94 kB initial, pre-existing budget warning only); CHROME_BIN=... pnpm test --no-watch -> TOTAL: 50 FAILED, 341 SUCCESS (391 total); comm -13/-23 diff of extracted failure names against 01-BASELINE.md's 52-name list shows zero new names and exactly the 2 StateExportService entries missing"
        status: pass
    human_judgment: false
  - id: D4
    description: "All five ROADMAP.md Phase 2 success criteria verified with recorded command evidence (see Criterion Verdicts table below)"
    requirement: SERL-02
    verification:
      - kind: unit
        ref: "See '## Phase 2 Close-Out: Five-Criterion Verdict' table"
        status: pass
    human_judgment: true

duration: 35min
completed: 2026-07-30
status: complete
---

# Phase 02 Plan 05: Version-Deprecation Policy & Phase Close-Out Summary

**Corrected `.claude/rules/state-serialization.md`'s four-versions-stale worked example, added a Version Deprecation Policy plus a Known Gaps and Scope Decisions section, and verified all five of ROADMAP.md's Phase 2 success criteria against the code as it actually stands.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-07-30
- **Tasks:** 2 completed
- **Files modified:** 3 (`.claude/rules/state-serialization.md`, this SUMMARY, `.planning/REQUIREMENTS.md`)

## Accomplishments

### Task 1 — Version-deprecation policy and drift correction

- Corrected the worked example under "Version Management Requirement": `CURRENT_VERSION` now shows `'1.0.11'` (was the four-versions-stale `'1.0.4'`), and `SUPPORTED_VERSIONS` now shows all twelve entries `'1.0.0'` through `'1.0.11'` (was a five-entry list) — verified entry-for-entry against the live `SUPPORTED_VERSIONS` literal in `state-export.service.ts`.
- Added `## Version Deprecation Policy` with four subsections:
  - **Supported Versions** — states `SUPPORTED_VERSIONS` is the single source of truth, names all twelve current entries, and points at the fixture-coverage guard spec (`state-export.service.spec.ts`) by name as the mechanical backstop that fails if a version is added without a matching fixture.
  - **What a Bump Now Requires** — documents the full three-part procedure (increment `CURRENT_VERSION`, append to `SUPPORTED_VERSIONS`, append a named `MIGRATIONS` entry — even a no-op one with an explanatory comment) plus the fixture obligation, and records as a decision (not an assertion) that the `1.0.2`→`1.0.3` historical bump fired for a pure behavior change with no schema delta, that this phase deliberately did not repeat that precedent for the migration-layer/flip-restore work, and that structural change is the governing test going forward.
  - **Retirement** — defines the four-step process (drop from `SUPPORTED_VERSIONS`, keep `MIGRATIONS` entries since newer states still traverse them, drop the fixture, record the rationale), the criterion for when retirement is appropriate (no persisted/shared state at that version can plausibly exist — a high bar given share links are server-stored indefinitely-lifetime and exports are user-kept files), and the default posture that no version has been retired to date.
  - **Unsupported-Version Behavior** — describes the existing hard-rejection behavior in `validateAndApplyState` (throws before any migration or structural check runs, names the rejected version, all four import entry points wrap it into their own user-facing error) and states explicitly this is a hard rejection with no partial application.
- Added `## Known Gaps and Scope Decisions` recording three items a future contributor would otherwise rediscover as surprises: the Phase-5 test-scaffolding work (`state-export.service.spec.ts` DI mock fix, `category.service.spec.ts` creation) pulled forward into this phase as a deliberate scope call; `indexeddb-user-model.service.ts`'s still-missing spec file as an adjacent, out-of-scope gap; and the `state-export.migrations.ts` extraction threshold (~700 lines) for the currently-inline migration registry.
- All edits were scoped `Edit` replacements — the pre-existing "When to Bump Version", "What Gets Serialized", "Share Links vs Full Export", "Backward Compatibility", and "Do NOT" sections, and the front-matter `paths` key, are byte-identical to before.

### Task 2 — Phase close-out gate

Ran the full verification stack and checked each ROADMAP.md Phase 2 success criterion against the code as it now stands. See the verdict table below for the exact evidence per criterion.

## Task Commits

1. **Task 1: Write the version-deprecation policy and correct the drifted examples** - `961823d` (docs)
2. **Task 2: Phase close-out gate against the roadmap's five success criteria** - this SUMMARY.md + `.planning/REQUIREMENTS.md` (SERL-02 checkbox), committed together as the plan's closing commit

## Phase 2 Close-Out: Five-Criterion Verdict

| # | ROADMAP.md Criterion | Command Run | Exact Output Evidence | Verdict |
|---|---|---|---|---|
| 1 | `state-export.service` applies named migration functions per version when importing older schemas, rather than only checking version equality | `grep -vE "^\s*(//\|\*\|/\*)" src/app/services/state-export.service.ts \| grep -c "toVersion: '"` | Returns `7` — a seven-entry named `MIGRATIONS` registry. Direct read of `validateAndApplyState` confirms `stateData = this.runMigrations(stateData);` is called immediately after the `SUPPORTED_VERSIONS` gate (`if (!this.SUPPORTED_VERSIONS.includes(...)) throw`) and immediately before `this.validateStateStructure(stateData);` | **PASS** |
| 2 | A documented version-deprecation policy exists in-repo | `grep -c '## Version Deprecation Policy' .claude/rules/state-serialization.md` and `grep -c '## Known Gaps and Scope Decisions' .claude/rules/state-serialization.md` | Both return `1`. Direct read confirms all four required subsections (Supported Versions, What a Bump Now Requires, Retirement, Unsupported-Version Behavior) are present with substantive content, not stubs | **PASS** |
| 3 | Automated regression tests load a fixture state for each supported version and confirm it deserializes without error | `grep -c 'const FIXTURE_V1_0_' src/app/services/state-export.service.spec.ts` returns `12`; `CHROME_BIN=... npx ng test --no-watch --browsers=ChromeHeadless --include='**/state-export.service.spec.ts'` | Fixture count returns `12` (one per `SUPPORTED_VERSIONS` entry). Scoped spec run: `TOTAL: 57 SUCCESS` — all-green, zero failures | **PASS** |
| 4 | `CategoryService` no longer uses the lazy `Injector` workaround or `any` typing to reach `IndexedDBUserModelService` | `grep -c 'private userModelService: IndexedDBUserModelService' src/app/services/category.service.ts` returns `1`; `grep -vE "^\s*(//\|\*\|/\*)" src/app/services/category.service.ts \| grep -nE '\bInjector\b\|:\s*any\b\|as any'` | Typed constructor param confirmed present (count `1`). The `Injector`/`any` grep against non-comment lines returns **zero matches** — both removed symbols are structurally absent. `CHROME_BIN=... npx ng test --no-watch --browsers=ChromeHeadless --include='**/category.service.spec.ts'` -> `TOTAL: 6 SUCCESS` | **PASS** |
| 5 | `CURRENT_VERSION`/`SUPPORTED_VERSIONS` bump semantics preserved (no bump owed by this phase) | `grep -c "CURRENT_VERSION = '1.0.11'" src/app/services/state-export.service.ts` returns `1`; `grep -c "'1.0.0', '1.0.1', ..., '1.0.10', '1.0.11'"` (full twelve-entry literal) returns `1` | Both literals confirmed unchanged from the phase-start values recorded in 02-02-SUMMARY.md/02-04-SUMMARY.md ("No `CURRENT_VERSION`/`SUPPORTED_VERSIONS` bump this plan" recorded in both prior plans; this plan's own Task 1 changed only documentation, not `state-export.service.ts`) | **PASS** |

**Full-suite baseline confirmation:**

- `npx tsc --noEmit` — exit `0`
- `pnpm run build` — exit `0`; `Initial total 775.94 kB` (pre-existing bundle-budget warning, 25.94 kB over the 750 kB budget — not a new regression, not a build failure)
- `CHROME_BIN=/home/user/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome pnpm test --no-watch` — `Chrome 148.0.0.0 (Linux 0.0.0): Executed 391 of 391 (50 FAILED)` / `TOTAL: 50 FAILED, 341 SUCCESS`
- Zero `NG0200` lines, zero `Circular dependency` lines in the full-suite output
- Extracted all 50 distinct failing spec names from the run and diffed them against `01-BASELINE.md`'s 52-name list using `comm -23`/`comm -13`:
  - `comm -23 current baseline` (current failures NOT in baseline) — **empty output**, confirming zero new regressions
  - `comm -13 current baseline` (baseline names no longer failing) — exactly two names: `StateExportService should validate state structure correctly` and `StateExportService should export complete state as JSON`, the two entries plan 02-01 retired by fixing the DI mock
  - This is the exact expected relationship: 52 baseline − 2 retired = 50 current, name-for-name

## Decisions Made

- Placed the new "Version Deprecation Policy" section between the existing "When to Bump Version" table and "What Gets Serialized" section rather than at the document's end, so the corrected example is read immediately alongside the fuller policy explaining it.
- Placed "Known Gaps and Scope Decisions" after the pre-existing "Do NOT" section (i.e. at the very end) so it reads as a closing note rather than interrupting the day-to-day operational rules.
- No `CURRENT_VERSION`/`SUPPORTED_VERSIONS` bump in this plan — this plan is documentation-only for Task 1 and verification-only for Task 2; both were confirmed unchanged via direct grep, consistent with 02-02 and 02-04's recorded decision that neither the migration layer nor the fixture suite changed any serialized structure.

## Deviations from Plan

None — the plan executed exactly as written. Task 1's scoped edits landed the corrected example and both new sections without touching the untouched sections or front matter. Task 2's verification produced clean PASS verdicts on all five criteria on the first run, with no auto-fixes required.

## Manual-Only Verifications (Not Performed By This Agent)

Two checks in `02-VALIDATION.md`'s "Manual-Only Verifications" table require either a human reader or live infrastructure this execution environment does not have access to, and are recorded here as outstanding rather than fabricated as passed:

1. **Policy document human read-through** (this plan's Task 1 `<human-check>`): a human should read `.claude/rules/state-serialization.md` end-to-end and confirm it lists every currently-supported version, states the retirement process, states unsupported-version behavior, and records this phase's scope decisions and known gaps, cross-checking the version list against `SUPPORTED_VERSIONS`. This agent performed the equivalent verification programmatically (entry-for-entry diff against the source literal, grep-based structural checks against every acceptance criterion) but a human confirmation is still recommended before merge.
2. **Live share-link round trip** (this plan's Task 2 `<human-check>`, and SERL-03's cross-cutting manual verification): generate a share link on the pre-change build with both panels populated, an overlay attached, a non-default scale, and one panel flipped; after the phase's changes are in place, load that same link and confirm both panels, overlays, scales, and flip state restore identically. This depends on the live `generateShareLink`/`loadFromShareLink` API (`environment.apiBaseUrl`), which is not reachable from this execution environment. The flip restoration itself is unit-tested end-to-end in `state-export.service.spec.ts`'s cross-instance flip round-trip spec (added in plan 02-04, demonstrated to fail against the pre-02-02 code path), so the underlying logic is proven — only the live end-to-end path through the real share API remains a human/CI-environment verification.

## Issues Encountered

None.

## User Setup Required

**Recommended before merging this phase:** perform the two Manual-Only Verifications listed above — a human read-through of the policy document and a live share-link round trip against the deployed/dev share API. Neither is a blocker for this plan's automated acceptance criteria, all of which passed.

## Next Phase Readiness

- Phase 2 (Service Architecture & Serialization Safety) is now feature-complete: all four requirements (`SERL-01`, `SERL-02`, `SERL-03`, `DEP-01`) are checked off in `.planning/REQUIREMENTS.md`, and all five ROADMAP.md success criteria are verified with recorded evidence in this SUMMARY.
- Full-suite baseline remains exactly 50 failures, name-identical to the running Phase 2 baseline (52 minus the 2 `StateExportService` entries retired in plan 02-01) — any future phase should continue asserting against this count until a further baseline-changing fix lands.
- `.claude/rules/state-serialization.md` is now accurate and will stay accurate under future changes: the fixture-coverage guard from plan 02-04 mechanically ties the documented supported-version list to `SUPPORTED_VERSIONS`, so a version bump without a fixture fails a test before it could make the policy prose stale again.
- No blockers identified. The two Manual-Only Verifications above are recommended, not blocking, per `02-VALIDATION.md`'s own framing of them as environment-dependent human checks.

## Self-Check: PASSED

- `.claude/rules/state-serialization.md` confirmed present on disk with all required sections (verified via grep, matching every Task 1 acceptance criterion).
- `02-05-SUMMARY.md` confirmed present on disk at `.planning/phases/02-service-architecture-serialization-safety/02-05-SUMMARY.md`.
- Task 1 commit hash `961823d` and Task 2 commit hash `3d90d7a` both confirmed present via `git log --oneline`.
- `.planning/REQUIREMENTS.md` confirmed updated (`SERL-02` checkbox now `[x]`).
- All five Phase 2 criteria confirmed PASS via direct command execution in this session, not assumed.

---
*Phase: 02-service-architecture-serialization-safety*
*Completed: 2026-07-30*

---
phase: 05-test-coverage-hardening
plan: 02
subsystem: testing
tags: [angular, karma, jasmine, state-export, msgpack, test-scaffolding]

# Dependency graph
requires:
  - phase: 02-service-architecture-serialization-safety
    provides: twelve per-version share-link fixtures in state-export.service.spec.ts (02-04-PLAN)
provides:
  - "src/app/testing/state-export-fixtures.ts exporting FIXTURE_V1_0_0, FIXTURE_V1_0_3, FIXTURE_V1_0_11, and the ExportedStateFixture type alias"
  - "src/app/integration/ directory with README.md documenting its naming, mocking, and cleanup conventions"
affects: [05-10, 05-11]

# Actuals (#2632)
actuals:
  tokens: 3724
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared test fixture module (src/app/testing/) importable across spec files, replacing describe-block-nested unexported consts"
    - "src/app/integration/ as the documented home for multi-unit integration specs, naming by user-facing flow rather than by participating class"

key-files:
  created:
    - src/app/testing/state-export-fixtures.ts
    - src/app/integration/README.md
  modified:
    - src/app/services/state-export.service.spec.ts

key-decisions:
  - "Did not annotate the exported fixture consts with the new ExportedStateFixture type — annotating them would collapse their inferred literal shape to Record<string, unknown>, breaking every downstream spread (e.g. FIXTURE_V1_0_4..10's `...FIXTURE_V1_0_0.appState.leftPanel`) that relies on TypeScript inferring the real nested shape from the object literal. ExportedStateFixture stays available for consumers (e.g. the TEST-03 integration spec) that want to reference the shape by name without forcing it onto these particular consts."

patterns-established:
  - "New shared fixture/harness modules that are imported by specs but are not themselves specs belong in src/app/testing/, not src/app/integration/ (documented in the new README's Sibling directory section)."

requirements-completed: [TEST-03, TEST-04]

coverage:
  - id: D1
    description: "src/app/testing/state-export-fixtures.ts exports FIXTURE_V1_0_0, FIXTURE_V1_0_3, FIXTURE_V1_0_11 and ExportedStateFixture; state-export.service.spec.ts imports the three extracted fixtures and its full suite (including the fixture-coverage guard) still passes"
    requirement: "TEST-03"
    verification:
      - kind: unit
        ref: "CHROME_BIN=... pnpm exec ng test --no-watch --browsers=ChromeHeadless --include='**/state-export.service.spec.ts' (57/57 SUCCESS)"
        status: pass
      - kind: other
        ref: "git diff --exit-code src/app/services/state-export.service.ts (unchanged, exit 0)"
        status: pass
    human_judgment: false
  - id: D2
    description: "src/app/integration/ exists with README.md documenting membership rule, naming pattern (<flow-name>.integration.spec.ts), mocking posture, and afterEach cleanup obligation; no placeholder .spec.ts files created"
    requirement: "TEST-04"
    verification:
      - kind: other
        ref: "test -f src/app/integration/README.md && grep -q 'integration.spec.ts' src/app/integration/README.md"
        status: pass
      - kind: other
        ref: "ls src/app/integration/*.spec.ts (no such file — confirmed empty of specs)"
        status: pass
    human_judgment: false

# Metrics
duration: 25min
completed: 2026-08-01
status: complete
---

# Phase 05 Plan 02: Test Scaffolding Extraction Summary

**Extracted the two Phase-2 share-link fixtures into an importable `src/app/testing/` module and created the documented `src/app/integration/` directory — the two pieces of scaffolding TEST-03 and TEST-04 need before their integration specs can be written.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-08-01T19:51:20Z
- **Completed:** 2026-08-01T20:16:00Z (approx)
- **Tasks:** 2
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments
- `FIXTURE_V1_0_0` (base shape), `FIXTURE_V1_0_3` (D-07's chosen legacy version), and `FIXTURE_V1_0_11` (current version) are now exported from `src/app/testing/state-export-fixtures.ts`, importable by any spec — including the future `share-link-import.integration.spec.ts` (05-10).
- `state-export.service.spec.ts` imports the three extracted fixtures instead of redeclaring them; the fixture-coverage guard (`SUPPORTED_FIXTURES` vs. `SUPPORTED_VERSIONS`) still lists all twelve `[version, fixture]` pairs and the full targeted suite (57 specs) passes unchanged.
- `src/app/integration/README.md` gives the new directory a written convention: what belongs there (multi-unit flows with no single owning file), the `<flow-name>.integration.spec.ts` naming pattern, a stub-only-at-boundaries mocking posture (global `fetch` for the share-link flow; image processing + `FileReader` for the upload flow), the `afterEach` real-persistence cleanup obligation, and a pointer to D-09 as the decision of record.
- No serialization version bump was made — `state-export.service.ts` is byte-identical to before this plan (`git diff --exit-code` confirms).

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract the two share-link fixtures into an importable module and rewire the owning spec** - `b1044af` (test)
2. **Task 2: Create src/app/integration/ and document its convention** - `7d0aa07` (docs)

**Plan metadata:** committed together with this SUMMARY (worktree mode — orchestrator handles the shared-file metadata commit after merge).

## Files Created/Modified
- `src/app/testing/state-export-fixtures.ts` - New. Exports `FIXTURE_V1_0_0`, `FIXTURE_V1_0_3`, `FIXTURE_V1_0_11` (untyped object literals, preserving absent-key semantics) and the `ExportedStateFixture` structural type alias for consumers.
- `src/app/services/state-export.service.spec.ts` - Modified. Removed the three extracted fixture declarations from inside the `describe('version regression fixtures')` block, added a module-scope import from `../testing/state-export-fixtures`. `FIXTURE_V1_0_1`, `_2`, `_4` through `_10` remain declared locally; `SUPPORTED_FIXTURES` unchanged at twelve entries.
- `src/app/integration/README.md` - New. Documents the directory's membership rule, naming convention, mocking posture, cleanup obligation, and points to `src/app/testing/` as the sibling home for non-spec test support files.

## Decisions Made
- **Did not type-annotate the exported fixture consts with `ExportedStateFixture`.** The plan's action text says to keep the type "structural" and warns against forcing the historical fixtures to satisfy the current `ExportedState` interface. Testing this concretely: annotating `FIXTURE_V1_0_0` as `ExportedStateFixture = Record<string, unknown>` collapses its inferred type, and every downstream fixture in `state-export.service.spec.ts` that spreads from it (e.g. `FIXTURE_V1_0_4`'s `leftPanel: { ...FIXTURE_V1_0_0.appState.leftPanel }`) would then fail to compile against `unknown`. Leaving the consts unannotated (plain object literals) preserves TypeScript's literal-type inference so all the existing spread-based fixtures continue to type-check exactly as before extraction. `ExportedStateFixture` is exported and documented for callers (e.g. the future TEST-03 spec) who want to reference the shape by name on their own variables.
- Reconstructed `FIXTURE_V1_0_11`'s `globalSettings` inline in the new module (rather than importing `FIXTURE_V1_0_5` from the spec file, which is not exported and stays local) using the same field values the original derived from `FIXTURE_V1_0_5.appState.globalSettings` (`measurementUnit: 'imperial'`, `adultMode: false`). Verified via the passing targeted test run that this produces an identical fixture.

## Deviations from Plan

None - plan executed exactly as written. The `ExportedStateFixture` typing choice above is a normal exercise of the plan's own explicit guidance ("Keep it structural... do not import ExportedState and annotate the consts with it"), not a deviation from it.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `05-10` (`share-link-import.integration.spec.ts`, TEST-03) can now `import { FIXTURE_V1_0_3, FIXTURE_V1_0_11 } from '../testing/state-export-fixtures'` as its plan requires.
- `05-10` and `05-11` (TEST-03, TEST-04) can both write into `src/app/integration/`, which exists with a documented convention.
- No blockers identified for downstream plans in this phase.

## Self-Check: PASSED

- FOUND: src/app/testing/state-export-fixtures.ts
- FOUND: src/app/integration/README.md
- FOUND: .planning/phases/05-test-coverage-hardening/05-02-SUMMARY.md
- FOUND commit: b1044af
- FOUND commit: 7d0aa07
- FOUND commit: f10e559

---
*Phase: 05-test-coverage-hardening*
*Completed: 2026-08-01*

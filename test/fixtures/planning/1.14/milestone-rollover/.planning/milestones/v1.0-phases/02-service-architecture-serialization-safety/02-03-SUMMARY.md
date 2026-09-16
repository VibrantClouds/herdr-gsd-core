---
phase: 02-service-architecture-serialization-safety
plan: 03
subsystem: services
tags: [angular, dependency-injection, category-service, indexeddb, refactor]

# Dependency graph
requires:
  - phase: 02-service-architecture-serialization-safety
    provides: "02-01's pre-refactor category.service.spec.ts safety net (4 green specs pinning cascadeRenameCategory/cascadeDeleteCategory behaviour) and the confirmed 50-failure working baseline"
provides:
  - "CategoryService constructor-injects IndexedDBUserModelService directly; no Injector, no dynamic import, no untyped field"
  - "Removed unreachable 'service unavailable' early-return from cascadeRenameCategory"
  - "Confirmed no class-level dependency cycle existed between CategoryService and IndexedDBUserModelService"
  - "Two new specs pinning the post-refactor cascade contract (empty-list resolution, single-await direct-dependency reach)"
affects: [02-04, 02-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CategoryService now follows the same constructor-injection pattern as user-model-migration.service.ts for reaching IndexedDBUserModelService"

key-files:
  created: []
  modified:
    - src/app/services/category.service.ts
    - src/app/services/category.service.spec.ts

key-decisions:
  - "Confirmed via direct source inspection (not assumption) that indexeddb-user-model.service.ts, native-indexeddb.service.ts, and indexeddb-config.ts contain zero references to CategoryService — the deferred lookup was unnecessary indirection, not a workaround for an actual cycle"
  - "Did not use forwardRef or an injection-token indirection, per plan instruction and Angular's own guidance that forwardRef is scoped to circular component imports, not service graphs"
  - "Left cascadeDeleteCategory unchanged since it already delegates to cascadeRenameCategory with no direct dependency access of its own"

requirements-completed: [DEP-01]

coverage:
  - id: D1
    description: "CategoryService reaches IndexedDBUserModelService through a plain, typed constructor parameter — no runtime injector lookup, no dynamic import, no untyped field"
    requirement: DEP-01
    verification:
      - kind: unit
        ref: "src/app/services/category.service.spec.ts — TOTAL: 6 SUCCESS (grep acceptance criteria all pass: 1x typed param, 1x import, 2x this.userModelService. call sites, 0x _userModelService/getUserModelServiceAsync/private injector/': any'/await import()"
        status: pass
    human_judgment: false
  - id: D2
    description: "Cascade rename/delete behave identically before and after the change — the pre-refactor spec from plan 02-01 passes unmodified"
    requirement: DEP-01
    verification:
      - kind: unit
        ref: "git diff --stat src/app/services/category.service.spec.ts against the pre-Task-1 commit for the original 4 specs — no changes; all 4 plus 2 new specs green"
        status: pass
    human_judgment: false
  - id: D3
    description: "Injector graph still constructs: production build succeeds, full suite shows no NG0200/Circular dependency diagnostic anywhere, exactly 50 pre-existing failures matching the Phase 1 baseline minus the two StateExportService entries retired by plan 02-01"
    requirement: DEP-01
    verification:
      - kind: unit
        ref: "pnpm run build (exit 0) and CHROME_BIN=... pnpm test --no-watch — TOTAL: 50 FAILED, 292 SUCCESS (342 total); grep for NG0200/Circular dependency returned no matches; name-diff against 01-BASELINE.md's 52-name list confirms zero new failures, with only the 2 StateExportService entries absent"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-07-30
status: complete
---

# Phase 02 Plan 03: CategoryService Constructor-Injection Refactor Summary

**Replaced CategoryService's Injector-based dynamic-import lookup of IndexedDBUserModelService with a plain typed constructor parameter, after confirming no actual class-level dependency cycle existed between the two services.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-30T17:23:34Z
- **Completed:** 2026-07-30T17:29:52Z
- **Tasks:** 2 completed
- **Files modified:** 2

## Accomplishments
- Confirmed the no-cycle premise directly: `grep -rn 'CategoryService' src/app/services/indexeddb-user-model.service.ts src/app/services/native-indexeddb.service.ts src/app/services/indexeddb-config.ts` produced zero output — `IndexedDBUserModelService` depends only on `NativeIndexedDBService`, which has no knowledge of categories at all
- Replaced the untyped `_userModelService` field, the `Injector` constructor parameter, and the `getUserModelServiceAsync()` dynamic-import helper with a single typed `private userModelService: IndexedDBUserModelService` constructor parameter — mirroring the existing in-repo pattern from `user-model-migration.service.ts`
- Removed the unreachable "service unavailable" early-return in `cascadeRenameCategory` (a constructor-injected dependency cannot be absent, so the guard could never fire under real DI)
- Added two new specs pinning the post-refactor contract: an empty-user-model-list case (cascade resolves cleanly with zero `updateUserModel` calls) and a direct-dependency case (a single `await` on `renameCategory` is sufficient to observe both `getAllUserModels` and `updateUserModel` calls)
- Verified the injector graph still constructs: production build succeeds, full suite reports exactly 50 pre-existing failures with zero `NG0200`/`Circular dependency` diagnostics anywhere in the output, and the failing-name set matches the Phase 1 baseline exactly minus the two `StateExportService` entries already retired by plan 02-01

## Task Commits

1. **Task 1: Replace the deferred lookup with direct constructor injection** - `a08b093` (refactor)
2. **Task 2: Prove the injector graph still constructs and pin the post-change cascade contract** - `6701ad6` (test)

## Files Created/Modified
- `src/app/services/category.service.ts` - Constructor now typed-injects `IndexedDBUserModelService` directly; removed `Injector` param, `_userModelService` field, `getUserModelServiceAsync()` helper, and the unreachable cascade early-return; `cascadeRenameCategory` calls `this.userModelService` directly
- `src/app/services/category.service.spec.ts` - Added two specs pinning the post-refactor cascade contract (empty-list resolution, single-await direct-dependency reach); the original 4 specs from plan 02-01 are byte-identical

## Decisions Made
- Confirmed the no-cycle premise by direct source inspection rather than trusting the plan's framing — the search across `indexeddb-user-model.service.ts`, `native-indexeddb.service.ts`, and `indexeddb-config.ts` found no reference to `CategoryService`, so this was genuinely removal of unnecessary indirection rather than the breaking of a real cycle
- Did not use `forwardRef` or an injection-token indirection, per the plan's explicit instruction and Angular's own guidance that `forwardRef` is scoped to circular component imports rather than service-to-service graphs
- Left `cascadeDeleteCategory` unchanged since it only delegates to `cascadeRenameCategory` with no direct dependency access of its own

## Deviations from Plan

None - plan executed exactly as written. Both tasks' `<action>` instructions were followed precisely, and every acceptance-criteria grep in both tasks passed on the first attempt.

## Issues Encountered

None.

## Next Phase Readiness

- `CategoryService` has a clean, typed dependency graph — no runtime injector lookups remain anywhere in the file (confirmed via acceptance-criteria greps).
- The injector-graph verification (production build + full-suite scan for `NG0200`/`Circular dependency`) is now a repeatable pattern any later phase-2 plan can reuse if another deferred-lookup workaround is discovered.
- Working full-suite baseline remains confirmed at **50 failures** (unchanged by this plan, as expected — this refactor touched no test-affecting behavior beyond the two new specs added here).
- No blockers identified for plans 02-04 or 02-05.

## Self-Check: PASSED

All modified files confirmed present on disk at their expected paths; both commit hashes (`a08b093`, `6701ad6`) confirmed present in `git log --oneline --all`.

---
*Phase: 02-service-architecture-serialization-safety*
*Completed: 2026-07-30*

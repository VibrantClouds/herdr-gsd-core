---
phase: 05-test-coverage-hardening
plan: 10
subsystem: testing
tags: [angular-router, router-testing-harness, msgpack, integration-test, share-link, state-management]

# Dependency graph
requires:
  - phase: 05-test-coverage-hardening (plan 02)
    provides: "src/app/testing/state-export-fixtures.ts (FIXTURE_V1_0_3, FIXTURE_V1_0_11), src/app/integration/README.md conventions"
  - phase: 02-serialization-hardening
    provides: "the MIGRATIONS registry and runMigrations walker in state-export.service.ts this spec proves fires on the route path"
provides:
  - "src/app/integration/share-link-import.integration.spec.ts — real Router -> shareLinkGuard -> StateExportService/StateManagementService chain, 7 passing specs"
  - "First in-repo RouterTestingHarness + provideRouter usage, invented per official Angular API since no prior spec exercised a guard through a real Router"
affects: [share-link.guard.ts, adult-mode.guard.ts, state-export.service.ts, state-management.service.ts]

actuals:
  tokens: 4333
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "RouterTestingHarness + provideRouter(routes) for guard/router integration specs, with spyOn(window, 'fetch') as the only stub point (loadFromShareLink bypasses HttpClient)"
    - "src/app/integration/ directory convention: specs named after the user-facing flow, not any single owning class"

key-files:
  created:
    - src/app/integration/share-link-import.integration.spec.ts
  modified:
    - .planning/REQUIREMENTS.md

key-decisions:
  - "Fixed the encode()->fetch-stub buffer bug (Rule 1): msgpack's encode() can return a Uint8Array view over an over-allocated ArrayBuffer, so passing `.buffer` directly leaked trailing garbage bytes into decode(). Fixed by copying into a tightly-sized Uint8Array first."
  - "Added provideHttpClient() (real client, not a testing double) to the TestBed providers (Rule 3): required only to satisfy DI for ImageMetadataService, a transitive dependency of ModelAttachmentDefaultsService that loadFromShareLink's code path never actually invokes."
  - "Documented, rather than assumed, the adult-route guard-ordering outcome: adultModeGuard sets adultMode=true first, but shareLinkGuard's successful import calls StateManagementService.resetState() before merging the payload's own globalSettings — so the imported payload's adultMode value (false in the fixture) wins over the guard's earlier true. Recorded as an observed fact, not a per-plan assumption."
  - "Used 0xc1 (msgpack's reserved 'never used' type byte) as the malformed-payload fixture — guaranteed to make decode() throw rather than risk silently decoding to an unrelated value."

requirements-completed: [TEST-03]

coverage:
  - id: D1
    description: "Real Router navigation through the real shareLinkGuard restores a current-version share payload into real StateManagementService state (selected models, overlays with sourceAttachmentPointId 'attachment-point', scale, globalSettings), with global fetch as the only stub"
    requirement: "TEST-03"
    verification:
      - kind: integration
        ref: "src/app/integration/share-link-import.integration.spec.ts#current-version happy path > restores selected models, overlays, and scale through the real router -> guard -> service chain"
        status: pass
    human_judgment: false
  - id: D2
    description: "A 1.0.3 payload entering through the route is migrated to the current schema (measurementUnit, adultMode, horizontalFlip keys present with migration defaults), proving the Phase 2 migration registry fires on the route path"
    requirement: "TEST-03"
    verification:
      - kind: integration
        ref: "src/app/integration/share-link-import.integration.spec.ts#legacy version migration through the route > migrates a 1.0.3 payload to the current schema when entered through the route"
        status: pass
    human_judgment: false
  - id: D3
    description: "The /adult/:shareId route runs adultModeGuard before shareLinkGuard, both take effect, and the observed adultMode-conflict outcome (imported payload wins) is documented in a comment"
    requirement: "TEST-03"
    verification:
      - kind: integration
        ref: "src/app/integration/share-link-import.integration.spec.ts#adult route variant > runs adultModeGuard before shareLinkGuard, and both take effect"
        status: pass
    human_judgment: false
  - id: D4
    description: "The no-shareId route branch is pinned: fetch is never called and state is untouched"
    requirement: "TEST-03"
    verification:
      - kind: integration
        ref: "src/app/integration/share-link-import.integration.spec.ts#no-shareId route > does not call fetch and leaves state untouched"
        status: pass
    human_judgment: false
  - id: D5
    description: "404, malformed-MessagePack, and unsupported-version failure paths each surface an error snackbar, redirect to root with replaceUrl, dismiss the loading snackbar, and leave state completely unapplied (including no partial user-model or custom-attachment-point writes)"
    requirement: "TEST-03"
    verification:
      - kind: integration
        ref: "src/app/integration/share-link-import.integration.spec.ts#failure paths (3 specs: 404, malformed MessagePack body, unsupported version)"
        status: pass
    human_judgment: false

duration: 45min
completed: 2026-08-01
status: complete
---

# Phase 05 Plan 10: Share-Link Import Integration Spec Summary

**Real `Router` -> `shareLinkGuard` -> `StateExportService`/`StateManagementService` chain proven end-to-end with `RouterTestingHarness`, `provideRouter`, and `spyOn(window, 'fetch')` as the only stub point — 7 new passing specs covering the happy path, legacy-version migration, adult-route guard ordering, the no-shareId branch, and three failure modes.**

## Performance

- **Duration:** 45 min
- **Tasks:** 3 (all `type="auto"`)
- **Files modified:** 2 (1 created, 1 requirement checkbox)

## Accomplishments

- Built the first in-repo spec using `RouterTestingHarness` + `provideRouter(routes)` — no prior spec in this repo exercised a router guard through a real `Router`, and neither `share-link.guard.ts` nor `adult-mode.guard.ts` had any spec file before this plan.
- Proved the current-version happy path: a real navigation restores `leftPanel.selectedModel`, `rightPanel.selectedModel`, `leftPanel.overlays` (with `sourceAttachmentPointId === 'attachment-point'`), `leftPanel.scale`, and `globalSettings` into real `StateManagementService` state, with `window.fetch` as the sole stub.
- Proved the Phase 2 migration registry fires on the route path (not only via a direct service call): a 1.0.3 payload entering through `/:shareId` arrives with `measurementUnit`, `adultMode`, and `horizontalFlip` present at the migration's documented defaults.
- Proved and documented guard ordering on `/adult/:shareId`: `adultModeGuard` runs first and sets `adultMode: true`, but `shareLinkGuard`'s successful import calls `StateManagementService.resetState()` before merging the payload's own `globalSettings` — so the imported payload's `adultMode: false` wins. This is recorded as an observed fact with a code-level explanation, not assumed.
- Covered all three failure modes (404, malformed MessagePack, unsupported version) with the same three assertions each: error snackbar surfaced (read from `SnackbarService.message$`, not a spy), loading snackbar dismissed, `Router.navigate` called with `replaceUrl: true`, and state completely untouched from a recognisable non-default value. The unsupported-version case additionally proves no partial application — no user models or custom attachment points were written.

## Task Commits

Each task was committed atomically:

1. **Task 1: Build the RouterTestingHarness harness and prove the current-version happy path** - `8c0011c` (test)
2. **Task 2: Prove the legacy-version migration and the adult route variant** - `2805a2b` (test)
3. **Task 3: Cover the failure paths — 404, malformed payload, and unsupported version** - `397a1fe` (test)

_Note: this is a `type="execute"` plan, not `type=tdd` — each task is a single `test(...)` commit adding real, non-throwaway integration coverage, not a RED/GREEN pair._

## Files Created/Modified

- `src/app/integration/share-link-import.integration.spec.ts` - New. 7 specs across 5 `describe` blocks (happy path, legacy migration, adult route, no-shareId route, failure paths).
- `.planning/REQUIREMENTS.md` - Checked off `TEST-03` (uniquely owned by this plan; `TEST-04` remains open for 05-11's upload-attach-use spec).

## Decisions Made

- **[Rule 1 - Bug] Fixed a fetch-stub buffer bug found during Task 1.** `encode()` from `@msgpack/msgpack` can return a `Uint8Array` view over an over-allocated `ArrayBuffer`; passing `.buffer` directly to the stubbed `arrayBuffer()` response leaked trailing garbage bytes past the encoded payload into `decode()`, silently corrupting the restored state (models came back `undefined` with no thrown error). Fixed by copying into a tightly-sized `Uint8Array` (`new Uint8Array(encode(payload))`) before taking `.buffer`.
- **[Rule 3 - Blocking] Added `provideHttpClient()` to the TestBed providers.** `ModelAttachmentDefaultsService` (constructed eagerly via `TestBed.inject` in `beforeEach` for cleanup) transitively depends on `ImageMetadataService`, which injects `HttpClient`. This is the real client, not a testing double — no code path exercised by `loadFromShareLink` actually calls `ImageMetadataService.getAllModels()` (that method is only reached from the export path, `gatherCompleteState`/`gatherViewportState`), so no HTTP request is ever made in this spec; the provider exists purely to satisfy dependency injection.
- **Used `0xc1` (msgpack's reserved "never used" type byte) for the malformed-payload fixture**, chosen specifically because it is guaranteed to make `decode()` throw rather than risk silently decoding to some unrelated value (e.g. a run of `0xff` bytes would each decode as a valid negative fixint).
- **Did not use the `expectAsync(...).toBeRejectedWithError(...)` idiom** suggested in 05-PATTERNS.md for the failure-path assertions. `shareLinkGuard`'s catch block swallows every error and always returns `true` (navigating to root rather than rejecting), so there is no rejected promise at the guard/route level to assert against — that idiom applies to `StateExportService`'s own unit spec, which calls the throwing methods directly. This spec instead asserts the guard's actual observable effects (snackbar message, `Router.navigate` call, unchanged state).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed corrupted msgpack payload reaching decode() via the fetch stub**
- **Found during:** Task 1
- **Issue:** The `mockSuccessfulFetch` helper originally passed `encode(payload).buffer` straight to the stubbed `Response.arrayBuffer()`. `encode()`'s returned `Uint8Array` is sometimes a view into a larger, over-allocated `ArrayBuffer`; the raw `.buffer` therefore contained the encoded payload plus unrelated trailing bytes. `state-export.service.ts` reads the whole buffer via `new Uint8Array(arrayBuffer)`, so `decode()` received corrupted input — no exception was thrown, but every restored field silently came back `undefined`.
- **Fix:** Copy into a tightly-sized `Uint8Array` first: `const encoded = new Uint8Array(encode(payload));` then use `encoded.buffer`.
- **Files modified:** `src/app/integration/share-link-import.integration.spec.ts`
- **Verification:** Task 1's happy-path spec went from 5 failing assertions to passing after the fix.
- **Committed in:** `8c0011c` (part of Task 1 commit)

**2. [Rule 3 - Blocking] Added `provideHttpClient()` to the test module providers**
- **Found during:** Task 1
- **Issue:** `TestBed.inject(ModelAttachmentDefaultsService)` in `beforeEach` (needed for the `afterEach` cleanup call) threw `NullInjectorError: No provider for _HttpClient!` because its transitive dependency `ImageMetadataService` requires `HttpClient`, and the plan's provider list (`provideRouter(routes)` only) didn't supply one.
- **Fix:** Added `provideHttpClient()` (the real client, not `provideHttpClientTesting()`) to `TestBed.configureTestingModule`'s providers. This satisfies DI only; no HTTP request is ever issued because the import code path never calls `ImageMetadataService.getAllModels()`.
- **Files modified:** `src/app/integration/share-link-import.integration.spec.ts`
- **Verification:** DI error resolved; the plan's explicit prohibition on `HttpTestingController`/`provideHttpClientTesting()` is respected (grep confirms neither appears in the file).
- **Committed in:** `8c0011c` (part of Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both fixes were necessary for the spec to run at all / to test the intended behavior rather than silently pass against corrupted data. No scope creep — no production code was touched.

## Issues Encountered

- Traced (rather than assumed) the adult-route `adultMode` guard-ordering conflict: initial static analysis and the plan's own action text suggested the outcome might be `adultMode: true` after both guards ran, but running the actual spec confirmed `adultMode: false` (the imported payload's own value, via `resetState()` wiping the guard's earlier `true` before the merge). Documented the real, observed behavior in a code comment per the plan's own instruction to "record the observed answer... so the behavior is documented rather than incidental" rather than asserting an assumed value.
- `pnpm run lint` is unavailable in this worktree (`tsc: command not found` — no local `node_modules`, a documented environment gap for this session). Substituted the main checkout's compiler directly: `/home/user/Development/SizeComparisonSite/node_modules/.bin/tsc --noEmit -p tsconfig.spec.json`, which exits 0 with no errors — equivalent coverage to `pnpm run lint`'s `tsc --noEmit` invocation.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `TEST-03` is fully satisfied by this plan; `TEST-04` (upload-attach-use integration spec) remains open for plan 05-11, which shares the same `src/app/integration/` directory and `src/app/testing/` fixture-module conventions this plan exercised.
- Full suite state after this plan: 599 specs, 570 passing, 29 failing — the failing count is unchanged from the wave-1 baseline (592 specs, 563 passing, 29 failing). This plan added 7 new specs (599 - 592 = 7), all passing. No regressions introduced.
- No blockers for 05-11 or any later plan in this phase.

---
*Phase: 05-test-coverage-hardening*
*Completed: 2026-08-01*

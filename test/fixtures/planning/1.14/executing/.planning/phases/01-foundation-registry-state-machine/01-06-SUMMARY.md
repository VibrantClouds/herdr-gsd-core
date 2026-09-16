---
phase: 01-foundation-registry-state-machine
plan: 06
subsystem: database
tags: [build-packaging, drizzle-orm, node-fs-cpsync, vitest, requirements-tracker]

# Dependency graph
requires:
  - phase: 01-foundation-registry-state-machine (plan 01-05)
    provides: "src/db/migrations-path.ts's resolveMigrationsFolder(), with its packaged-layout candidate (dist/drizzle, one hop above dist/db/) already defined but unreachable until this plan ships something at that path"
provides:
  - "A build that carries its own migration trail: npm run build now runs tsc then a portable, idempotent asset-copy step (node:fs cpSync) into dist/drizzle/"
  - "An explicit package.json files field ([\"dist\"]) so a published/installed package ships deterministically, with no repository-root glob"
  - "An out-of-process regression test (src/db/packaging.e2e.test.ts) that spawns the COMPILED daemon from an isolated install root and proves the packaged-layout migrations candidate is what actually resolves — not merely present in source, and not an accidental checkout-layout fallback"
  - "A synced .planning/REQUIREMENTS.md — the checkbox list and status table for Phase 1 no longer contradict 01-VERIFICATION.md or each other"
affects: ["Phase 2 (any future container/install-based runner provisioning inherits this now-real packaged build)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Portable build-asset copy via node:fs cpSync (recursive, force) invoked through `node --eval` — no new dependency, identical behavior on Linux/macOS, confirmed idempotent (no shell-cp-style nesting into dist/drizzle/drizzle on a second build)"
    - "Isolated-install-root e2e testing: to prove a module-relative resolver's PACKAGED candidate specifically (not an incidental checkout-layout fallback), copy the build output into a fresh mkdtemp root with a symlinked node_modules and spawn the compiled entrypoint from there — cwd alone does not isolate this, because resolveMigrationsFolder() keys off the module's own file location, not process.cwd()"

key-files:
  created:
    - src/db/packaging.e2e.test.ts
  modified:
    - package.json
    - .planning/REQUIREMENTS.md

key-decisions:
  - "files field is [\"dist\"] only (one entry), not a separate drizzle/ entry — the asset-copy step already nests the migration trail inside dist/drizzle/, so a second top-level entry would be redundant and would risk shipping the repo-root drizzle/ source directory unnecessarily"
  - "Tests 2 and 3 in packaging.e2e.test.ts spawn the built daemon from an isolated mkdtemp install root (containing only the copied dist/ tree plus a symlinked node_modules), not directly from dist/cli/index.js inside the git checkout — discovered during the mandated red-confirmation revert that spawning in-checkout does NOT isolate the packaged candidate, because resolveMigrationsFolder()'s second (checkout-layout) candidate still resolves to the repo-root drizzle/ two hops above dist/db/ regardless of asset-copy step or cwd"
  - "SPIKE-01 marked Complete in REQUIREMENTS.md but with an inline annotation naming its detected-but-unconfirmed status (D-10) — satisfied per 01-VERIFICATION.md's own characterization, not silently upgraded to a plain empirical confirmation"

patterns-established:
  - "createIsolatedInstall() test helper: mkdtemp + cpSync(dist) + symlinkSync(node_modules) — the minimal faithful simulation of `files: [...]`-scoped npm package contents for e2e tests that must prove packaged-layout behavior specifically"

requirements-completed: [STATE-01, QUAL-04]

coverage:
  - id: D1
    description: "npm run build produces a build output that contains the migration trail — dist/drizzle/meta/_journal.json exists after a clean build, byte-identical to drizzle/meta/_journal.json, and a second consecutive build is idempotent (no nested dist/drizzle/drizzle)"
    requirement: STATE-01
    verification:
      - kind: other
        ref: "rm -rf dist && npm run build && test -f dist/drizzle/meta/_journal.json (manual verify command, run twice consecutively)"
        status: pass
      - kind: e2e
        ref: "src/db/packaging.e2e.test.ts#Test 1: after a real npm run build, dist/drizzle/meta/_journal.json exists"
        status: pass
    human_judgment: false
  - id: D2
    description: "The BUILT daemon, spawned as a real out-of-process child from an isolated install root (not the Fleet repo root, not merely a scratch cwd inside the checkout), reaches serving state and answers GET /health with 200 — proving the resolver's packaged-layout candidate is what resolves"
    requirement: STATE-01
    verification:
      - kind: e2e
        ref: "src/db/packaging.e2e.test.ts#Test 2: the built daemon, spawned from a scratch cwd that is not the repo root, becomes ready and answers GET /health with 200"
        status: pass
    human_judgment: false
  - id: D3
    description: "That same built daemon serves GET /projects with 200 and an empty projects array against its fresh FLEET_HOME — proving migrations actually ran, not merely that a port was bound"
    requirement: STATE-01
    verification:
      - kind: e2e
        ref: "src/db/packaging.e2e.test.ts#Test 3: that same built daemon serves GET /projects with 200 and an empty array against its fresh FLEET_HOME"
        status: pass
    human_judgment: false
  - id: D4
    description: "The migration trail copied into the build output preserves the source journal's entry order exactly (ordered sequence comparison, not count/set comparison)"
    requirement: STATE-01
    verification:
      - kind: e2e
        ref: "src/db/packaging.e2e.test.ts#Test 4: the migration trail copied into the build output preserves the journal entry order exactly"
        status: pass
    human_judgment: false
  - id: D5
    description: "package.json's files field enumerates exactly what the daemon needs at runtime with no repository-root glob and no .planning entry; dependencies/devDependencies untouched"
    requirement: QUAL-04
    verification:
      - kind: other
        ref: "git diff package.json — files: [\"dist\"], dependencies/devDependencies blocks byte-identical to pre-task"
        status: pass
    human_judgment: false
  - id: D6
    description: "Removing the asset-copy step from scripts.build and rebuilding turns the packaging suite red (all 4 tests fail) — confirming the suite covers the packaging gap rather than incidentally passing off a stale dist/"
    requirement: STATE-01
    verification:
      - kind: e2e
        ref: "temporary local revert of scripts.build (Edit → rm -rf dist → npx vitest run --project unit src/db/packaging.e2e.test.ts) — all 4 tests failed, then restored and re-verified green"
        status: pass
    human_judgment: false
  - id: D7
    description: ".planning/REQUIREMENTS.md's checkbox list and status table agree with each other and with 01-VERIFICATION.md for every Phase 1 requirement (SPIKE-01..05, STATE-03..06, SM-01..04)"
    requirement: QUAL-04
    verification:
      - kind: other
        ref: "grep -c unchecked-SPIKE/STATE/SM (0) and grep -c Pending-SPIKE/STATE/SM (0) — both plan-mandated verify commands"
        status: pass
    human_judgment: false
  - id: D8
    description: "npx tsc --noEmit and npm test (unit project) both exit 0 after all changes, with the test count strictly greater than the 153 baseline from plan 01-05"
    requirement: QUAL-04
    verification:
      - kind: other
        ref: "npm run typecheck (exit 0); npm test (157/157 passing, up from 153 baseline)"
        status: pass
    human_judgment: false

duration: ~12min
completed: 2026-07-23
status: complete
---

# Phase 1 Plan 06: packaging drizzle/ into dist/ (gap closure) Summary

**Portable node:fs-cpSync build-asset copy shipping the migration trail into dist/drizzle/, proven by an isolated-install-root e2e test that spawns the compiled daemon and exercises the resolver's packaged-layout candidate specifically — plus a synced Phase 1 requirements tracker**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-23T21:58:00Z
- **Completed:** 2026-07-23T22:08:00Z
- **Tasks:** 3
- **Files modified:** 3 (1 new, 2 modified)

## Accomplishments
- `npm run build` now runs `tsc -p tsconfig.json` followed by a new `build:assets` step that copies `drizzle/` into `dist/drizzle/` using `node:fs`'s `cpSync` (via `node --eval`, no new dependency), portable across Linux and macOS with no shell-builtin or GNU-only flag dependency
- The copy step is idempotent — confirmed a second consecutive `npm run build` leaves `dist/drizzle/meta/_journal.json` at the same path with no nested `dist/drizzle/drizzle`
- `package.json` gained an explicit `files: ["dist"]` field so a published/installed package ships deterministically with no repository-root glob and no `.planning` entry; `dependencies`/`devDependencies` untouched (confirmed byte-identical)
- `src/db/packaging.e2e.test.ts` — 4 out-of-process tests spawning `node dist/cli/index.js daemon` (never `tsx`) from an **isolated `mkdtemp` install root** (the build output copied in, plus a symlinked `node_modules`), proving the packaged-layout migrations candidate is what actually resolves, not an accidental checkout-layout fallback
- `.planning/REQUIREMENTS.md`'s checkbox list and status table now agree with `01-VERIFICATION.md` for all 13 previously-stale Phase 1 requirement IDs (SPIKE-01..05, STATE-03..06, SM-01..04); SPIKE-01 carries an inline annotation preserving its detected-but-unconfirmed (D-10) status rather than laundering it into a plain completion

## Task Commits

Each task was committed atomically:

1. **Task 1: Ship the migration trail with the build output** - `64afa4b` (feat)
2. **Task 2: Prove the BUILT daemon starts from an arbitrary directory** - `a4af5e3` (test, tdd)
3. **Task 3: Sync the stale Phase 1 requirements tracker** - `d54960c` (docs)

**Plan metadata:** committed alongside this SUMMARY (worktree mode — STATE.md/ROADMAP.md updates deferred to the orchestrator)

_Task 2 is `tdd="true"`; its single commit bundles the test file together with the confirmed-red evidence gathered during authoring (see Deviations below), matching plan 01-05's precedent of test-then-implementation as one commit unit where the task boundary is already the test file itself._

## Files Created/Modified
- `package.json` - `scripts.build` extended to run `tsc` then `build:assets`; new `scripts.build:assets` (portable `cpSync`-based copy); new `files: ["dist"]` field
- `src/db/packaging.e2e.test.ts` - `createIsolatedInstall()` helper, `startBuiltDaemonChild()`, `waitForDaemonReady()`, 4 tests proving the compiled daemon's packaged migrations candidate
- `.planning/REQUIREMENTS.md` - 13 stale checkbox/status-table rows (SPIKE-01..05, STATE-03..06, SM-01..04) synced to `01-VERIFICATION.md`

## Decisions Made
- **`files` field is `["dist"]` only**, not a separate `drizzle/` entry — the asset-copy step already nests the migration trail inside `dist/drizzle/`, so listing `dist` alone ships everything the daemon needs; a second top-level `drizzle` entry would be redundant and would risk also shipping the repo-root source directory.
- **Tests 2 and 3 spawn the built daemon from an isolated `mkdtemp` install root, not directly from `dist/cli/index.js` inside the checkout.** Discovered this during the plan-mandated red-confirmation revert: reverting only `scripts.build`'s asset-copy step and spawning `dist/cli/index.js` in-checkout left Tests 2 and 3 GREEN, because `resolveMigrationsFolder()`'s second (checkout-layout) candidate — `<module-dir>/../../drizzle` — still resolves to the repo-root `drizzle/` directory regardless of whether `dist/drizzle` exists, since `dist/` and `drizzle/` are both direct siblings of the repo root either way. Only Tests 1 and 4 (which check `dist/drizzle/meta/_journal.json` directly) went red. This would have shipped a test that "passes off a stale `dist/`" in exactly the way the plan's own acceptance criteria warn against. Fixed by copying the real build output into a fresh `mkdtemp` root with a symlinked `node_modules` (mirroring exactly what `files: ["dist"]` ships) and spawning from there — with no `drizzle/` two hops above `<installRoot>/dist/db/`, only the packaged candidate can resolve. Re-ran the full revert cycle after this fix: all 4 tests failed red, then all 4 passed green after restoring the asset-copy step.
- **SPIKE-01 marked `Complete` with an inline annotation**, not a plain `[x]`/`Complete` — per the plan's explicit instruction to preserve its `01-VERIFICATION.md`-documented "detected but unconfirmed" (D-10) status rather than silently upgrading it to an empirically confirmed signal.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Packaging e2e test's Tests 2/3 did not actually exercise the packaged-layout candidate as originally drafted**
- **Found during:** Task 2, while performing the plan-mandated red-confirmation revert (a required acceptance-criteria step, not optional)
- **Issue:** The plan's literal instruction — spawn `node dist/cli/index.js daemon` directly, with only `cwd` set to a scratch directory — does not isolate the resolver's packaged-layout candidate from its checkout-layout candidate when the compiled entrypoint still lives inside the git checkout. `resolveMigrationsFolder()`'s two candidates are both module-file-location-relative, not cwd-relative; the checkout-layout candidate resolves regardless of `cwd` or whether `dist/drizzle` exists, as long as `dist/` sits at the repo root next to `drizzle/`. This meant the drafted Tests 2 and 3 stayed green even with the asset-copy step reverted — exactly the "test that incidentally passes off a stale `dist/`" failure mode the plan's own acceptance criteria (verification item 4) exist to catch.
- **Fix:** Added a `createIsolatedInstall()` helper that copies `dist/` into a fresh `mkdtemp` "install root" (mirroring exactly the `files: ["dist"]` entries a published/installed package would ship) with a symlinked `node_modules`, and spawns the daemon from that isolated entrypoint instead of the in-checkout one. This removes any sibling `drizzle/` two hops above the built `db/` module, so only the packaged candidate can resolve.
- **Files modified:** `src/db/packaging.e2e.test.ts`
- **Verification:** Re-ran the full mandated revert cycle after the fix — reverted `scripts.build`'s asset-copy step, `rm -rf dist`, rebuilt, ran the suite: all 4 tests failed red (Tests 2/3 via a daemon startup crash citing `MigrationsFolderNotFoundError`-style unreachable candidates; Tests 1/4 via missing `dist/drizzle/meta/_journal.json`). Restored the asset-copy step, rebuilt, re-ran: all 4 tests passed green. Full suite (`npm test`) also confirmed 157/157 passing and `npx tsc --noEmit` exit 0 after the fix.
- **Committed in:** `a4af5e3` (Task 2 commit — the fix was made before the first commit of this file, so no separate revert-commit exists; the committed version is already the corrected one)

---

**Total deviations:** 1 auto-fixed (1 bug fix to the test's own isolation strategy, discovered via the plan's own mandated verification step)
**Impact on plan:** Strengthens exactly what the plan's acceptance criteria required (packaged-candidate-specific coverage, confirmed red without the fix); no scope creep — the fix is scoped entirely to the test file the plan already specified.

## Issues Encountered
- The worktree's `node_modules/` was empty on session start (only stray `.vite`/`.vite-temp` directories from a prior partial run) — ran `npm ci` before any build/test could execute. Not a plan deviation; standard worktree bootstrap, matching plan 01-05's own prior experience with this same class of issue.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Both halves of `01-VERIFICATION.md` gap item (a) are now closed: plan 01-05 closed the cwd-independence half (module-relative resolver, client-side CLI path resolution, required-absolute HTTP boundary); this plan closes the packaging half (the resolver's packaged-layout candidate is now reachable in a real build, and is proven — specifically, exclusively — by an isolated-install-root e2e test).
- `npm test` passes 157/157 (up from the 153 baseline after plan 01-05), `npx tsc --noEmit` exits 0, `npm run lint` exits clean.
- `.planning/REQUIREMENTS.md` no longer contradicts `01-VERIFICATION.md` for any Phase 1 requirement.
- No blockers for re-running `/gsd-verify-work` against Phase 1's roadmap success criterion 1, or for closing out Phase 1 as a whole.

---
*Phase: 01-foundation-registry-state-machine*
*Completed: 2026-07-23*

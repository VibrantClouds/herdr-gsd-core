---
phase: 01-component-decomposition
plan: 01
subsystem: testing
tags: [karma, jasmine, chromeheadless, test-baseline, angular]

# Dependency graph
requires: []
provides:
  - "Confirmed ChromeHeadless test execution capability for this environment (via CHROME_BIN)"
  - "Attributable pre-extraction pass/fail baseline for upload-modal.component.spec.ts and attachment-preview.component.spec.ts"
  - "Documented pre-existing, out-of-scope full-suite disconnect issue (site-mode.service.spec.ts)"
affects: [01-02, 01-03, 01-04, 01-05, 01-06, 01-07, 01-08, 01-09]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created:
    - .planning/phases/01-component-decomposition/01-BASELINE.md
    - .planning/phases/01-component-decomposition/deferred-items.md
  modified: []

key-decisions:
  - "CHROME_BIN must point at /home/user/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome for ng test/karma to launch in this environment (no system Chrome/Chromium package installed)"
  - "Full-suite disconnect caused by site-mode.service.spec.ts window.location deletion is pre-existing and out of scope for Phase 1; logged to deferred-items.md, not fixed"
  - "upload-modal.component.spec.ts's 3 pre-existing failures (unique-name, file-selection, height-required validation) are attributed to the known UserModelService/IndexedDBUserModelService DI-mock mismatch (D-06) and must not be fixed in this phase"

requirements-completed: [DECOMP-01, DECOMP-02, DECOMP-03]

coverage:
  - id: D1
    description: "ChromeHeadless confirmed available and launchable for Karma in this environment"
    requirement: "DECOMP-01"
    verification:
      - kind: unit
        ref: "pnpm exec ng test --include='**/app.component.spec.ts' --watch=false --browsers=ChromeHeadless (exit 0, TOTAL: 1 SUCCESS)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Full-suite runtime measured via pnpm test --no-watch"
    requirement: "DECOMP-01"
    verification:
      - kind: unit
        ref: "pnpm test --no-watch and pnpm exec ng test --no-watch --browsers=ChromeHeadless (both ~38-39s to DISCONNECTED, pre-existing unrelated bug, see 01-BASELINE.md)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Pre-extraction pass/fail baseline recorded for upload-modal.component.spec.ts and attachment-preview.component.spec.ts, with the known DI-mock mismatch flagged as pre-existing"
    requirement: "DECOMP-02"
    verification:
      - kind: unit
        ref: "pnpm exec ng test --include='**/upload-modal.component.spec.ts' --watch=false --browsers=ChromeHeadless (27 total, 24 passed, 3 failed)"
        status: pass
      - kind: unit
        ref: "pnpm exec ng test --include='**/attachment-preview.component.spec.ts' --watch=false --browsers=ChromeHeadless (13 total, 13 passed, 0 failed)"
        status: pass
    human_judgment: false
  - id: D4
    description: "No source or spec file modified while producing the baseline"
    requirement: "DECOMP-03"
    verification:
      - kind: other
        ref: "git diff --stat b309ddc HEAD -- src/ (empty output — no src/ changes)"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-07-06
status: complete
---

# Phase 01 Plan 01: Wave 0 Test-Execution Baseline Summary

**Confirmed ChromeHeadless works via a `CHROME_BIN` override to a local Playwright Chromium binary, and locked in the pre-extraction pass/fail baseline for the two existing target specs (upload-modal: 24/27 passing with 3 known pre-existing DI-mock failures; attachment-preview: 13/13 passing) so later extraction plans can attribute regressions correctly.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-06 (session start)
- **Completed:** 2026-07-06T22:15:14Z
- **Tasks:** 2/2 completed
- **Files modified:** 2 (both newly created)

## Accomplishments
- Confirmed ChromeHeadless can launch in this sandboxed environment — no system Chrome/Chromium package is installed, but `CHROME_BIN` can be pointed at the Playwright-managed Chromium binary already present on the host (`~/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome`), which reports as "Google Chrome for Testing 145.0.7632.6" and works with `karma-chrome-launcher`.
- Measured full-suite runtime (`pnpm test --no-watch`): the suite does not run to completion in this environment. It disconnects after ~38-39s wall-clock due to a pre-existing, unrelated bug in `site-mode.service.spec.ts` (deletes `window.location`, triggering a full-page reload and a subsequent 30s Karma idle-timeout disconnect). This is documented in `01-BASELINE.md` and logged as an out-of-scope item in `deferred-items.md` — not fixed, per this plan's Scope Boundary.
- Recorded an attributable pre-extraction baseline for the two components later plans will extract from:
  - `upload-modal.component.spec.ts`: 27 total, 24 passed, 3 failed (`should handle file selection with valid file`, `should validate height required for both models and attachments`, `should validate unique name`) — all three attributed to the known `UserModelService` vs `IndexedDBUserModelService` DI-mock mismatch (decision D-06 / RESEARCH.md Pitfall 3), which is Phase 5 (TEST) scope, not this phase's.
  - `attachment-preview.component.spec.ts`: 13 total, 13 passed, 0 failed — fully green, covering `renderPreview`, `previewScale`, and `setupResizeObserver`, which must stay green through extraction.

## Task Commits

Each task was committed atomically:

1. **Task 1: Confirm Chrome/Chromium availability and record full-suite runtime** - `fac838a` (docs)
2. **Task 2: Record pre-extraction pass/fail baseline for the two existing target specs** - `5c25238` (docs)

_Note: Both tasks modified the same file (`01-BASELINE.md`) in sequence — Task 1 created it with the Environment section, Task 2 appended the Spec Baseline section._

## Files Created/Modified
- `.planning/phases/01-component-decomposition/01-BASELINE.md` - Environment + Spec Baseline record; the attribution reference for all later Phase 1 extraction plans
- `.planning/phases/01-component-decomposition/deferred-items.md` - Logs the out-of-scope `site-mode.service.spec.ts` full-page-reload/disconnect bug discovered while measuring full-suite runtime

## Decisions Made
- `CHROME_BIN` must be exported to `~/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome` (or an equivalent Chromium binary) before any `ng test` invocation in this environment — there is no system-installed `google-chrome`/`chromium` package. This is a per-environment setup note, not a project dependency change (no `package.json` changes were made; RESEARCH.md's prohibition on new dependencies was respected).
- The `site-mode.service.spec.ts` full-page-reload/disconnect issue is real and reproducible (confirmed twice, with both the default `Chrome` launcher and `ChromeHeadless`), but is unrelated to this phase's extraction targets and explicitly out of scope — logged to `deferred-items.md` rather than fixed, per the Scope Boundary rule and RESEARCH.md's phase-5-only mandate for spec/DI fixes.
- The 3 pre-existing `upload-modal.component.spec.ts` failures are treated as baseline-red, not something this plan should fix; later plans must not count these as regressions they introduced.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed project dependencies (`pnpm install`) before running any test**
- **Found during:** Task 1
- **Issue:** The worktree had no `node_modules`; `pnpm exec ng test` cannot run without dependencies installed.
- **Fix:** Ran `pnpm install` (lockfile was up to date; resolution skipped, no version changes) to materialize `node_modules` from the existing `pnpm-lock.yaml`. No package.json or lockfile changes were made.
- **Files modified:** None tracked by git (node_modules is gitignored).
- **Verification:** `pnpm exec ng test` subsequently launched successfully.
- **Committed in:** N/A (no trackable file change; this is standard environment bootstrapping, not a package addition, and is excluded from the "package manager install" deviation restriction since no new package was added — the lockfile already specified all versions).

**2. [Rule 3 - Blocking] Set `CHROME_BIN` to a local Playwright Chromium binary instead of installing Chrome via `npx puppeteer browsers install chrome`**
- **Found during:** Task 1
- **Issue:** `pnpm exec ng test --browsers=ChromeHeadless` failed with "No binary for ChromeHeadless browser on your platform." per the plan's anticipated failure mode.
- **Fix:** Rather than downloading a new browser via `npx puppeteer browsers install chrome` (which would add a new large binary dependency to the sandbox), discovered and reused an already-present Playwright-managed Chromium binary at `~/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome` (self-identifies as "Google Chrome for Testing 145.0.7632.6") by exporting `CHROME_BIN` to point at it. This satisfies the plan's own fallback instruction ("set `CHROME_BIN`... then re-run") without any new download.
- **Files modified:** None (environment variable only, not persisted to any repo file).
- **Verification:** Smoke-check command exits 0 with `TOTAL: 1 SUCCESS`.
- **Committed in:** N/A (documented in 01-BASELINE.md's Environment section, commit `fac838a`).

**3. [Scope Boundary] Full-suite disconnect discovered but not fixed**
- **Found during:** Task 1 (full-suite runtime measurement)
- **Issue:** `pnpm test --no-watch` disconnects after ~38-39s due to `site-mode.service.spec.ts` deleting `window.location`, unrelated to this plan's files.
- **Action:** Logged to `.planning/phases/01-component-decomposition/deferred-items.md`; not fixed (out of scope per Scope Boundary rule — this file is not part of this plan's `files` and fixing spec/DI issues is explicitly Phase 5 work).
- **Committed in:** `fac838a` (deferred-items.md creation).

---

**Total deviations:** 3 (2 Rule 3 blocking fixes needed just to execute the plan's own verification commands; 1 scope-boundary logging of an unrelated discovery)
**Impact on plan:** No scope creep — no source or spec files were touched, no new packages were added to package.json/pnpm-lock.yaml, and the CHROME_BIN environment workaround is documented as an environment-setup note in the baseline itself so later plans/waves know how to reproduce test runs.

## Issues Encountered
- The full test suite (`pnpm test --no-watch`) cannot currently be run to completion in this sandbox due to the pre-existing `site-mode.service.spec.ts` issue described above. This does not block Wave 0 (the plan's smoke-check only requires `app.component.spec.ts` to pass in isolation, which it does) and does not affect the two target specs' isolated baselines, which were captured independently and are unaffected.

## User Setup Required

None - no external service configuration required. Note for future executors in this same environment: export `CHROME_BIN=<path-to-a-Chromium-binary>` (e.g. a Playwright-managed one under `~/.cache/ms-playwright/`) before running any `ng test`/`pnpm test` command, since no system Chrome/Chromium package is installed here.

## Next Phase Readiness
- Wave 0 gate satisfied: ChromeHeadless is confirmed usable (with the CHROME_BIN caveat), and the pre-extraction baseline for both target specs is locked in `01-BASELINE.md`.
- Waves 2-4 (the actual extraction plans, 01-02 through 01-09) can now proceed and must diff their post-extraction spec runs against this baseline to distinguish genuine regressions from the pre-existing upload-modal DI-mock failures and the unrelated site-mode.service.spec.ts full-suite disconnect.
- No blockers for subsequent plans in this phase.

---
*Phase: 01-component-decomposition*
*Completed: 2026-07-06*

## Self-Check: PASSED

- FOUND: .planning/phases/01-component-decomposition/01-BASELINE.md
- FOUND: .planning/phases/01-component-decomposition/deferred-items.md
- FOUND: commit fac838a (Task 1)
- FOUND: commit 5c25238 (Task 2)

---
phase: 06-frontend-security-hardening
plan: 02
subsystem: ui
tags: [angular, jasmine, share-link, client-side-throttling]

requires:
  - phase: 06-frontend-security-hardening
    provides: "06-CONTEXT.md decisions D-00..D-16 and 06-PATTERNS.md analog map for app.component.ts/.html/.spec.ts"
provides:
  - "5-second post-success cooldown on share-link generation (SEC-02), layered on the pre-existing isGeneratingShareLink in-flight guard"
  - "jasmine.clock()-based cooldown spec pattern for AppComponent, first use of this timer-mocking idiom in the codebase"
affects: [06-03-frontend-security-hardening]

actuals:
  tokens: 1595
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "jasmine.clock().install()/uninstall() for setTimeout-based UI-state timers in component specs (vs. Angular's fakeAsync/tick used elsewhere for debounce flushes)"

key-files:
  created: []
  modified:
    - src/app/app.component.ts
    - src/app/app.component.html
    - src/app/app.component.spec.ts

key-decisions:
  - "Clipboard stubbing seam: spied on document.hasFocus() (forced false) plus the private fallbackCopyToClipboard method (resolveTo()), rather than touching navigator.clipboard directly. Clipboard failures are already swallowed internally by generateShareLink() and never gate the cooldown, so this seam only exists to keep the spec deterministic in headless Chrome, not because clipboard behavior affects the feature under test."
  - "canShareValue satisfied by driving the real StateManagementService (updateLeftPanelModel/updateRightPanelModel with a shared mockModel) before awaiting ngOnInit(), rather than replacing StateManagementService with a stub — replacing it would break the eagerly-constructed real child component tree that app.component.html renders unconditionally (documented in the file's existing header comment)."
  - "A private-field-cast sanity assertion (app as unknown as { canShareValue: boolean }).canShareValue).toBe(true) runs in the cooldown block's beforeEach, following the same cast convention the file already uses for userModelsSubject, so a broken fixture fails loudly at setup rather than producing vacuously-passing specs downstream (Phase 5 CR-02/WR-01/WR-02 standard)."

patterns-established:
  - "Boolean-guard-plus-setTimeout UI-state pattern extended: shareOnCooldown/shareCooldownTimer/SHARE_COOLDOWN_MS mirror the existing shareSuccess/shareSuccessTimer fields exactly (declaration style, clear-then-set defensive shape, cleared in ngOnDestroy)."

requirements-completed: [SEC-02]

coverage:
  - id: D1
    description: "A successful generateShareLink() call refuses a second call within 5 seconds (shareOnCooldown guard + [disabled] binding)"
    requirement: "SEC-02"
    verification:
      - kind: unit
        ref: "src/app/app.component.spec.ts#share-link cooldown (SEC-02) > refuses a second generation inside the 5s window"
        status: pass
    human_judgment: false
  - id: D2
    description: "The cooldown expires automatically after 5 seconds, allowing generation again with no user action"
    requirement: "SEC-02"
    verification:
      - kind: unit
        ref: "src/app/app.component.spec.ts#share-link cooldown (SEC-02) > allows generation again after the window elapses"
        status: pass
    human_judgment: false
  - id: D3
    description: "A failed generateShareLink() does not start the cooldown, so it remains immediately retryable (D-09 prohibition)"
    requirement: "SEC-02"
    verification:
      - kind: unit
        ref: "src/app/app.component.spec.ts#share-link cooldown (SEC-02) > does not start the cooldown when generation fails"
        status: pass
    human_judgment: false
  - id: D4
    description: "ngOnDestroy() during an active cooldown clears the pending timer so no callback fires against a destroyed component"
    requirement: "SEC-02"
    verification:
      - kind: unit
        ref: "src/app/app.component.spec.ts#share-link cooldown (SEC-02) > clears the pending cooldown timer on destroy"
        status: pass
    human_judgment: false
  - id: D5
    description: "The share button visibly greys out and re-enables after ~5s with no countdown text or layout shift, on desktop and narrow mobile viewports (D-11)"
    verification: []
    human_judgment: true
    rationale: "Perceptual UI timing and no-layout-shift/no-countdown-text verification requires a human viewing the running app; not mechanically assertable via Karma."

duration: 12min
completed: 2026-09-08
status: complete
---

# Phase 6 Plan 2: Share-Link Client-Side Cooldown Summary

**5-second post-success cooldown on `AppComponent.generateShareLink()` reusing the file's existing boolean-guard-plus-setTimeout pattern, proven by four `jasmine.clock()` specs.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-09-08T23:xx (worktree branch base `3d059ac`)
- **Completed:** 2026-09-08
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- A successful share-link generation now disables the share button for 5 seconds via a new `shareOnCooldown` flag, layered on top of the pre-existing `isGeneratingShareLink` in-flight guard (which already blocked concurrent/overlapping requests).
- A failed generation is never penalized: the cooldown starts only inside the `try` block's success path, never in `catch` or `finally`.
- `ngOnDestroy()` clears the pending cooldown timer, so a component torn down mid-cooldown cannot have a `setTimeout` callback mutate a destroyed instance.
- Four new Jasmine specs pin the window, its expiry, its non-start on failure, and its teardown — the first use of `jasmine.clock()` in this codebase (existing time-control precedent was Angular's `fakeAsync`/`tick` for an unrelated debounce-flush pattern).

## Task Commits

Each task was committed atomically:

1. **Task 1: Post-success cooldown on the share button** - `2f7e23d` (feat)
2. **Task 2: Cooldown specs with Jasmine's clock** - `6503692` (test)

**Plan metadata:** (this commit, `docs(06-02): complete plan`)

## Files Created/Modified
- `src/app/app.component.ts` - Added `shareOnCooldown`, `shareCooldownTimer`, `SHARE_COOLDOWN_MS` fields; extended the `generateShareLink()` early-return guard and success path; added timer cleanup to `ngOnDestroy()`.
- `src/app/app.component.html` - Extended the `.btn-share` `[disabled]` expression with `|| shareOnCooldown`. No other template change (D-11: no countdown UI, no new `@if` branch).
- `src/app/app.component.spec.ts` - New `describe('share-link cooldown (SEC-02)', ...)` block with four specs using `jasmine.clock()`.

## Decisions Made
- **Clipboard stubbing seam:** Rather than mocking `navigator.clipboard` (which may or may not exist/behave consistently in headless Chrome), the spec forces `document.hasFocus()` to return `false` (routing `generateShareLink()` into its existing fallback branch) and stubs the private `fallbackCopyToClipboard` method to resolve immediately. This is deterministic and never touches the real clipboard. Note that clipboard success/failure is irrelevant to the cooldown behavior under test — `generateShareLink()` already swallows any clipboard error internally and proceeds to the `shareSuccess`/`shareOnCooldown` lines regardless.
- **Satisfying `canShareValue`:** The private `canShareValue` field is set via a live subscription to `canShare$`, which itself derives from the real `StateManagementService`. Rather than stub the service (which would break the eagerly-constructed real child component tree that `app.component.html` renders unconditionally — documented in this spec file's existing header comment), the spec drives the real service directly: `stateService.updateLeftPanelModel(mockModel)` / `updateRightPanelModel(mockModel)` before `await app.ngOnInit()`. A `beforeEach` sanity assertion — `(app as unknown as { canShareValue: boolean }).canShareValue).toBe(true)` — confirms this setup took effect before any spec's own call-count assertions run, so a broken fixture fails at setup rather than producing a spec that (by construction) would already fail non-vacuously on its own call-count expectation.
- **`shareOnCooldown` remains a plain public field, not promoted to a derived getter** alongside `isGeneratingShareLink` — per the plan's `add-alongside` decision, promoting to a single "can generate" concept is exactly the abstraction D-00 rules out for a two-condition, one-caller, one-button surface. A third independent gate would force that promotion; this plan adds no such gate.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Symlinked `node_modules` into the worktree**
- **Found during:** Task 1 verification (`pnpm run typecheck`)
- **Issue:** The git worktree this plan executed in had no `node_modules` directory, so `tsc`/`ng` were unresolvable (`sh: line 1: tsc: command not found`). Running `pnpm install` was excluded by the plan's D-15 (would shift the Phase 5-calibrated dependency baseline) and by the executor's package-manager-install exclusion.
- **Fix:** Created a symlink `node_modules -> <main-repo>/node_modules` inside the worktree, pointing at the already-installed, already-verified dependency tree from the main checkout. No package was installed, upgraded, or resolved differently; this only makes the existing install visible to tooling running inside the worktree.
- **Files modified:** none tracked by git (the symlink is outside any tracked path and matches the existing `.gitignore` entry for `node_modules`).
- **Verification:** `pnpm run typecheck` exits 0; `pnpm exec ng test --no-watch --browsers=ChromeHeadless --include='**/app.component.spec.ts'` exits 0 with 7/7 passing.
- **Committed in:** N/A (untracked, gitignored — no commit needed or made).

---

**Total deviations:** 1 auto-fixed (1 blocking, tooling-only, no source change)
**Impact on plan:** No impact on scope or behavior. Purely a local-environment prerequisite for running the plan's own verification commands inside an isolated worktree.

## Issues Encountered
- One test run of `ng test --include='**/app.component.spec.ts'` reported "Chrome Headless ... Disconnected, because no message in 30000 ms" after all 7 specs had already printed `SUCCESS` — a Karma/Angular-build runner teardown artifact (`ERR_INVALID_STATE: Controller is already closed` inside `@angular/build`'s karma application builder), not a test failure. Two subsequent clean re-runs (including one piped to a log file to check the exit code) both completed with all 7 specs green and exit code 0, confirming this was transient runner-process flakiness unrelated to the new specs.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SEC-02 is complete: `app.component.ts`/`.html` now expose both the pre-existing in-flight guard and the new post-success cooldown, matching the phase's `06-VALIDATION.md` per-task verification map for `06-02 / Task 1` and `06-02 / Task 2`.
- `06-03` (documentation of the security posture in `.claude/rules/security.md`) can now reference `SHARE_COOLDOWN_MS` and `shareOnCooldown` as landed symbols.
- Human-check item D5 (visual greying-out behavior on desktop and narrow mobile viewports, no countdown text, no layout shift) is deferred to end-of-phase human verification per `human_verify_mode: end-of-phase` in `.planning/config.json`.

---
*Phase: 06-frontend-security-hardening*
*Completed: 2026-09-08*

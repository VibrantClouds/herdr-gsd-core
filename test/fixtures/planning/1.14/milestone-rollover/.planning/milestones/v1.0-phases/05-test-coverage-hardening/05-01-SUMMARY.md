---
phase: 05-test-coverage-hardening
plan: 01
subsystem: testing
tags: [karma, jasmine, code-coverage, triage, angular]

# Dependency graph
requires:
  - phase: 03-race-condition-lifecycle-fixes
    provides: "03-BASELINE.md's failure-attribution precedent (structure this plan's 05-TRIAGE.md mirrors, and whose stale claims it retires)"
provides:
  - "05-TRIAGE.md: single instrumented baseline snapshot (533 specs/504 passing/29 failing, zero NullInjectorError)"
  - "Per-failure disposition table for all 29 pre-existing suite failures, each with a verdict (spec-wrong/code-wrong), concrete file:line/commit-hash evidence, and an assigned downstream fix plan (05-06 through 05-09)"
  - "TEST-02 coverage-gap list with measured per-file statement/branch/function/line percentages for all 7 named targets, and an explicit scoping verdict for 05-12"
  - "Resolved product decision on imperial zero-inches elision AND the related whole-number-inches trailing-decimal question, both resolved to keep live behavior (spec-side corrections only)"
affects: [05-06, 05-07, 05-08, 05-09, 05-12]

actuals:
  tokens: 7507
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Single-run dual-purpose baseline: one --code-coverage suite run produces both the failure-triage disposition table and the TEST-02 coverage-gap list, so every downstream number traces to the same snapshot (D-13)"
    - "Git-history-as-evidence: for disputed spec-vs-code verdicts, checking `git log -p` on the file under dispute frequently surfaces a named, intentional prior commit (bugfix or feature change) that settles the verdict more conclusively than re-deriving the math from scratch"

key-files:
  created:
    - .planning/phases/05-test-coverage-hardening/05-TRIAGE.md
  modified: []

key-decisions:
  - "Imperial zero-inches elision (Task 3, option-a): keep live formatHeight() behavior (always render both units, e.g. 6' 0\"); the two disputed SizeSliderComponent specs get corrected, not the production code — zero production risk, no behavior delta, no UAT item"
  - "Whole-number-inches trailing decimal (surfaced during evidence-gathering, resolved in the same checkpoint pass): keep live formatHeightDisplay() behavior (5\" stays 5\", not 5.0\"); three more assertions in the same disputed it() block get corrected — 05-08 needs no further human input on either sub-question"
  - "TEST-02 coverage scope widened beyond the pre-measurement hypothesis: measured numbers show attachment-canvas-renderer.service.ts (41.31%/37.23%) and upload-modal.component.ts (61.9%/39.39%) both have real gaps alongside attachment-preview.component.ts (63.52%/31.88%) — 05-12 is explicitly scoped to all three, not attachment-preview alone"
  - "Created a node_modules symlink from the worktree to the main repo's node_modules (Rule 3 blocking-issue fix) rather than running pnpm install, which would have relinked Angular from the verified 19.2.18 baseline to the declared ^20.3.17 range and shifted the very numbers this phase is calibrated against — the symlink is git-ignored and changes nothing about what is installed"

requirements-completed: []
# TEST-02 is NOT marked complete by this plan. Per the plan's own objective, this plan's
# coverage-audit appendix "authorises (or cancels) 05-12's TEST-02 gap-fill work" — the
# audit is done and the scope is now explicit (attachment-preview.component.ts,
# upload-modal.component.ts, attachment-canvas-renderer.service.ts), but the actual
# gap-fill specs are 05-12's deliverable, not this plan's.

coverage:
  - id: D1
    description: "Single instrumented full-suite baseline snapshot (533 specs / 504 passing / 29 failing, zero NullInjectorError) reproducing the research run exactly, with Angular version drift and Pitfall-7 coverage caveat recorded"
    requirement: "TEST-02"
    verification:
      - kind: other
        ref: "CHROME_BIN=... pnpm exec ng test --no-watch --browsers=ChromeHeadless --code-coverage (full run, output transcribed into 05-TRIAGE.md ## Environment & Snapshot)"
        status: pass
    human_judgment: false
  - id: D2
    description: "29-row failure disposition table — every pre-existing failure has a verdict (spec-wrong/code-wrong), concrete evidence (file:line, quoted assertion, or git-history commit reference), and an assigned downstream fix plan"
    verification:
      - kind: other
        ref: "05-TRIAGE.md ## Failure Disposition — row count check confirms 29/29 match against the recorded run's failing total"
        status: pass
    human_judgment: false
  - id: D3
    description: "TEST-02 coverage-gap list with measured per-target percentages and an explicit scoping verdict naming which files 05-12 should target"
    requirement: "TEST-02"
    verification:
      - kind: other
        ref: "05-TRIAGE.md ## TEST-02 Coverage Audit — 7/7 target files measured with statement/branch/function/line percentages, transcribed from coverage/size-comparison-tool/**/index.html"
        status: pass
    human_judgment: false
  - id: D4
    description: "Imperial zero-inches elision and whole-number-inches trailing-decimal product decisions, resolved by the human at the Task 3 checkpoint"
    verification: []
    human_judgment: true
    rationale: "Product/UX decision requiring a human to observe the running app and choose between behavior options — not something an automated check can adjudicate on its own."

duration: 48min
completed: 2026-08-01
status: complete
---

# Phase 5 Plan 1: Test Suite Baseline & Failure Triage Summary

**One instrumented `--code-coverage` run reproduced the 533/504/29 research baseline exactly and became `05-TRIAGE.md`: a 29-row failure disposition table (each row with a verdict and concrete file:line or git-commit evidence) plus a measured TEST-02 coverage-gap list scoping 05-12's work to three files, not one.**

## Performance

- **Duration:** 48 min (includes a checkpoint pause for the imperial-formatting product decision)
- **Started:** 2026-08-01T20:00:00Z (approximate)
- **Completed:** 2026-08-01T20:48:00Z (approximate)
- **Tasks:** 3 (Task 1: baseline snapshot; Task 2: disposition table + coverage audit; Task 3: checkpoint decision)
- **Files modified:** 1 (`.planning/phases/05-test-coverage-hardening/05-TRIAGE.md`, created)

## Accomplishments

- Ran the full suite once with `--code-coverage`, reproducing the research run's totals exactly (533 specs / 504 passing / 29 failing, zero `NullInjectorError`) — confirming D-01's premise that `03-BASELINE.md`'s 50-failure/HttpClient-attribution baseline is fully obsolete.
- Produced a genuine per-failure disposition, not a cluster-level guess: all 29 rows carry concrete evidence — file:line references, quoted assertion messages, or (for several disputed cases) a specific git commit hash that deliberately changed the behavior the failing spec still expects. Two notable git-history findings that settled otherwise-ambiguous verdicts: commit `49ca36b0` ("Fix: Slider deadzone bugfix") deliberately removed container-fit constraint math from `ImageDisplayComponent`/`ScalingService`, explaining all 3 `ImageDisplayComponent` geometry failures; commit `514a4041` deliberately changed `AttachmentSidebarComponent`'s and `SizeSliderComponent`'s default slider scale/step from `5`/`0.1` to `2.5`/`0.04`, explaining both `AttachmentSidebarComponent` failures.
- Resolved the one genuinely-undocumented cluster (`ImageDisplayComponent`/`ComparisonPanelComponent`, 8 failures, previously undisambiguated per 05-RESEARCH.md Assumptions Log A2) cleanly along component lines using the raw stack traces: all 3 `ImageDisplayComponent` failures are pure value-mismatch assertions with no thrown error (geometry, spec-wrong); all 5 `ComparisonPanelComponent Integration with Size Slider` failures throw the identical `NG0100`/`code: -100` error (real ordering defect, code-wrong, D-04).
- Measured TEST-02 coverage honestly rather than assuming: the pre-measurement hypothesis in 05-RESEARCH.md/05-CONTEXT.md speculated 05-12 might scope to `attachment-preview.component.ts` alone. The actual numbers don't support that — `attachment-canvas-renderer.service.ts` (41.31% stmt / 37.23% branch) has the largest gap of all seven targets, and `upload-modal.component.ts` (61.9%/39.39%) is also substantially under-covered. 05-12 is now explicitly scoped to all three files.
- At the Task 3 checkpoint, surfaced an additional formatting dispute beyond what the plan's decision text named (whole-number-inches trailing decimal — `5"` vs `5.0"`) and got it resolved by the human in the same pass, so 05-08 needs zero further human input on `SizeSliderComponent` formatting.

## Task Commits

Each task was committed atomically:

1. **Task 1 + Task 2: Capture baseline snapshot, write disposition table and coverage audit** - `ab13bb6` (docs) — both tasks build the same `05-TRIAGE.md` artifact from one test run and were verified together; see "Deviations from Plan" for the rationale on combining them into one commit.
2. **Task 3: Resolve imperial-formatting checkpoint** - `2339218` (docs)

**Plan metadata:** (this commit, made after this summary is committed)

## Files Created/Modified

- `.planning/phases/05-test-coverage-hardening/05-TRIAGE.md` - New artifact: Environment & Snapshot, Failure Disposition (29 rows), TEST-02 Coverage Audit (7 files), Retired Premises, and Checkpoint Resolutions sections.

## Decisions Made

- **Imperial zero-inches elision → option-a (keep live behavior).** `formatHeight()` continues to always render `feet' inches"` (e.g. `6' 0"`), never eliding a zero-inch suffix. Rationale: behavior-preservation milestone; D-03 makes live app behavior the adjudication authority; the disputed specs encoded an intent that never shipped. Zero production risk, no behavior delta, no end-of-phase UAT item.
- **Whole-number-inches trailing decimal → keep live behavior (resolved in the same checkpoint pass).** `formatHeightDisplay()` continues to omit the decimal for whole-number inch values (`5"`, not `5.0"`) regardless of the requested `precision: 1`. Same rationale as above. This sub-question was not originally named in Task 3's decision text — it surfaced while gathering stack-trace evidence for row #20 (3 of its 5 failing assertions turned out to be about this, not elision) — and was flagged explicitly to the human, who resolved it in the same response.
- **TEST-02 gap-fill scope is `attachment-preview.component.ts` + `upload-modal.component.ts` + `attachment-canvas-renderer.service.ts`**, not attachment-preview alone. `upload-form-validators.service.ts`, `attachment-point-definition.service.ts`, and `measurement-ruler.service.ts` are already fully or near-fully covered — no work authorized there. `upload-image-pipeline.service.ts` has a smaller gap 05-12 may pick up opportunistically but is lower priority.
- **Combined Task 1 and Task 2 into a single commit** rather than two. Both tasks build the same `05-TRIAGE.md` file from one already-completed test run within the same execution session; splitting the file into an artificial intermediate state would not have improved traceability (both tasks' verify commands and acceptance criteria were satisfied together, and a revert of the one commit cleanly reverts both tasks' work).
- **Worktree had no `node_modules`** (git worktrees don't inherit the main checkout's `node_modules`, and none was created for this worktree). Symlinked `node_modules -> <main-repo>/node_modules` rather than running `pnpm install`, to run the suite against the exact already-verified 19.2.18 Angular installation without touching the plan's explicit "do not `pnpm install`" constraint. The symlink is git-ignored and was never staged.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree missing `node_modules`; symlinked from main repo instead of installing**
- **Found during:** Task 1 (attempting to run the instrumented test suite)
- **Issue:** The git worktree this plan executed in (`.claude/worktrees/agent-a64dc7df996c7ad83`) had no `node_modules` directory at all — worktrees don't get a fresh `pnpm install`, and none had been run. Without it, `pnpm exec ng test` cannot run.
- **Fix:** Created `ln -s <main-repo>/node_modules node_modules` inside the worktree. This is a filesystem link, not a package-manager operation — it does not install, update, or change any package version. Confirmed the symlinked `node_modules/@angular/core/package.json` still reports `19.2.18`, matching the plan's expected drift figure exactly.
- **Files modified:** None tracked (the symlink is git-ignored via `/node_modules` in `.gitignore` and was never staged).
- **Verification:** `ng version` and the full suite run both succeeded through the symlink, reproducing the research run's exact 533/504/29 totals.
- **Committed in:** N/A — not a repo change.

**2. [Rule 1 - Bug, evidence-gathering] Surfaced a second formatting sub-dispute inside row #20 not named by Task 3's decision text**
- **Found during:** Task 2 (gathering stack-trace evidence for the disposition table)
- **Issue:** `SizeSliderComponent Measurement Formatting should format height correctly in imperial units` has 5 failing assertions, not 2. Task 3's checkpoint text was framed around zero-inches elision only, but 3 of the 5 assertions (`5"`→`5.0"`, `0"`→`0.0"`, `1' 1"`→`1' 1.0"`) are a separate dispute about whether whole-number inch values should always render a decimal at `precision: 1`.
- **Fix:** Documented the full 5-assertion breakdown in row #20's evidence cell, flagged the sub-dispute explicitly in the checkpoint return message, and got the coordinator to resolve both sub-questions in one pass rather than deferring the second one to a future 05-08 checkpoint.
- **Files modified:** `.planning/phases/05-test-coverage-hardening/05-TRIAGE.md` (row #20 evidence, Checkpoint Resolutions section).
- **Verification:** Row #20 now carries `spec-wrong` with both sub-questions resolved; `05-08` can execute directly with no further human input.
- **Committed in:** `2339218` (Task 3 commit).

---

**Total deviations:** 2 auto-fixed (1 blocking-infrastructure, 1 evidence-gathering-scope-clarification)
**Impact on plan:** Neither deviation touched a production or spec file, changed the plan's task structure, or expanded scope beyond what Task 2/Task 3 already authorized investigating. No scope creep.

## Issues Encountered

None beyond the two items documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `05-TRIAGE.md` is complete and committed: `05-06` through `05-09` can each read their assigned rows directly (Assigned fix column) and execute without re-deriving verdicts.
- `05-08` specifically can execute both `SizeSliderComponent` formatting rows (#19, #20) as pure spec corrections — zero human input needed, zero production risk.
- `05-12` has an explicit, measured scope for TEST-02 gap-fill work: `attachment-preview.component.ts`, `upload-modal.component.ts`, and `attachment-canvas-renderer.service.ts` (in roughly that priority order given the size of each gap), with `upload-image-pipeline.service.ts` as an optional stretch target.
- No blockers for downstream plans. The Angular version drift (19.2.18 installed vs `^20.3.17` declared) remains recorded as a known, deliberately-untouched fact per the plan's explicit "do not `pnpm install`" constraint — any future phase reconciling this should be aware the 533/504/29 baseline (and every fix wave keyed off it) was captured against the 19.2.18 runtime.

## Self-Check: PASSED

- `05-TRIAGE.md` exists at `.planning/phases/05-test-coverage-hardening/05-TRIAGE.md` — confirmed.
- `05-01-SUMMARY.md` exists at `.planning/phases/05-test-coverage-hardening/05-01-SUMMARY.md` — confirmed.
- Commit `ab13bb6` (Task 1+2) exists in this branch's history — confirmed.
- Commit `2339218` (Task 3) exists in this branch's history — confirmed.
- Commit `22043ee` (this SUMMARY) exists in this branch's history — confirmed.

---
*Phase: 05-test-coverage-hardening*
*Completed: 2026-08-01*

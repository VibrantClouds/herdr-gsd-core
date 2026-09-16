---
phase: 01-foundation-library
plan: 02
subsystem: docs
tags: [specs, portrait, fixtures, schema-versioning]

requires:
  - phase: 01-foundation-library
    provides: "01-01 tracer scaffold (pnpm workspace, packages/schema) that these specs govern"
provides:
  - "SPEC-design-system.md Masthead portrait rule corrected to full-image/natural-aspect/object-fit-contain"
  - "SPEC-gallery-and-portrait.md Header rendering bullet corrected to match"
  - "SPEC-frontend-architecture.md packages/schema directory sketch corrected to per-plugin fixture layout"
affects: [01-03-fixture-guard, 01-06-character-header]

actuals:
  tokens: 1030
  tasks: 2
  commits: 2
  plan_head_before: eb526e7

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - docs/specs/SPEC-design-system.md
    - docs/specs/SPEC-gallery-and-portrait.md
    - docs/specs/SPEC-frontend-architecture.md

key-decisions:
  - "D-P1 applied verbatim: character header portrait is the full image at natural aspect ratio (object-fit: contain), never cropped to circle or square; non-circular monogram placeholder when null; exact frame sizing deferred to Phase 4 (GALL-04)."
  - "D-P2 applied verbatim: per-plugin fixtures/<version>.json under each plugin dir, envelope fixtures under src/fixtures/envelope/, guard at src/__tests__/fixture-guard.spec.ts; removed the stale top-level test/ subtree from the directory sketch."

requirements-completed: [CHAR-01, SCHM-02]

coverage:
  - id: D1
    description: "SPEC-design-system.md and SPEC-gallery-and-portrait.md both state the full-image, natural-aspect, non-cropped portrait rule with a non-circular monogram placeholder"
    requirement: "CHAR-01"
    verification:
      - kind: other
        ref: "rg -q 'object-fit: contain' + 'non-circular monogram' in both files; negative checks for '96 px circle', 'object-fit: cover', 'aspect-ratio: 1'"
        status: pass
    human_judgment: false
  - id: D2
    description: "SPEC-frontend-architecture.md packages/schema directory sketch matches the per-plugin fixture layout and drops the stale top-level test/ subtree"
    requirement: "SCHM-02"
    verification:
      - kind: other
        ref: "rg checks for absence of 'fixtures/<type>/<version>.json' and top-level 'test/', presence of '__tests__/', 'envelope/<version>.json', and per-plugin 'fixtures/<version>.json}' braces"
        status: pass
    human_judgment: false

duration: 5min
completed: 2026-09-11
status: complete
---

# Phase 1 Plan 02: Fix Locked Spec Drift Summary

**Corrected two documentation drifts in three locked spec files — portrait presentation (D-P1) and the packages/schema fixture directory sketch (D-P2) — before any downstream plan reads them.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-09-11T16:33:00-04:00 (approx.)
- **Completed:** 2026-09-11T16:33:58-04:00
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- SPEC-design-system.md section 4.1 Masthead now describes the portrait as the full image at its natural aspect ratio (`object-fit: contain`) inside a bounded frame, never cropped to a circle or square, with a non-circular monogram placeholder when null and Phase 4 owning exact sizing.
- SPEC-gallery-and-portrait.md Portrait "Header rendering" bullet restated to match, naming Phase 4 (GALL-04) as the owner of exact frame sizing.
- SPEC-frontend-architecture.md section 1 directory sketch now shows per-plugin `fixtures/<version>.json` in the intimacy and gallery brace lists, a `fixtures/envelope/<version>.json` sibling of `plugins/`, a `__tests__/fixture-guard.spec.ts` sibling of `plugins/`, and no top-level `test/` subtree — agreeing with SPEC-serialization-policy.md.

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite the portrait presentation rule (D-P1)** - `464c165` (docs)
2. **Task 2: Correct the packages/schema directory sketch (D-P2)** - `006f75d` (docs)

**Plan metadata:** committed alongside this SUMMARY.

## Files Created/Modified
- `docs/specs/SPEC-design-system.md` - Masthead Anatomy line's portrait clause rewritten per D-P1; `.eyebrow`, `.title-input`, `.meta-row` clauses left untouched.
- `docs/specs/SPEC-gallery-and-portrait.md` - Portrait "Header rendering" bullet rewritten per D-P1; other three Portrait bullets untouched.
- `docs/specs/SPEC-frontend-architecture.md` - `packages/schema` directory sketch: added per-plugin `fixtures/<version>.json`, added `fixtures/envelope/<version>.json` and `__tests__/fixture-guard.spec.ts` under `src/`, removed the stale top-level `test/` subtree.

## Decisions Made
- Followed D-P1 and D-P2 exactly as specified in the plan's context block — no interpretation required, both were fully-specified text replacements.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- **Plan-level verification note:** the plan's `<verification>` and Task 2 `<acceptance_criteria>` both assert `git ls-files docs` lists exactly the three edited spec paths. In this repo `docs/` is already fully tracked by git (commit `b8b1cd9`, "docs: add project ADRs, PRD, specs and prototype as baseline", predates this plan and predates 01-01 as well) — the plan's context note that "`docs/` is untracked in git but is the real source" does not hold at execution time. `git ls-files docs` therefore lists all 30 tracked docs files, not just the three edited ones. This is a pre-existing discrepancy between the plan's stated assumption and repo state, not something introduced by this plan's execution: both task commits staged only their target files by explicit path (`git add docs/specs/SPEC-design-system.md docs/specs/SPEC-gallery-and-portrait.md` for Task 1, `git add docs/specs/SPEC-frontend-architecture.md` for Task 2 — verified via `git status --short` before each commit and `git show --stat` after), so no bulk-add ever occurred and no unrelated file was staged or committed. `git show --stat` on both task commits confirms exactly the intended paths per commit. No fix was needed or applied — the assumption is cosmetic to this plan's outcome, since the actual staging discipline the plan required was followed regardless of whether `docs/` was tracked before or after.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- 01-03 (fixture guard) and 01-06 (character header) can now read these three specs without inheriting the D-P1/D-P2 drift.
- Ready for 01-03-PLAN.md.

---
*Phase: 01-foundation-library*
*Completed: 2026-09-11*

## Self-Check: PASSED

All 4 files found on disk (3 edited specs + SUMMARY.md itself). All 3 commits (464c165, 006f75d, f17689a) verified present in `git log --oneline --all`.

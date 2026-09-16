---
phase: 02-intimacy-plugin-unified-page
plan: 04
subsystem: infra
tags: [pnpm, angular-cdk, dependency, package-legitimacy]

requires:
  - phase: 02-intimacy-plugin-unified-page
    provides: 02-RESEARCH.md package-legitimacy check (SUS verdict, reason "too-new"), ADR-0016 (@angular/cdk/drag-drop as the app's single sanctioned UI dependency)
provides:
  - "@angular/cdk@22.1.6 available to apps/web (drag-drop, a11y entry points), version-matched to @angular/core@22.1.6"
  - "Recorded human legitimacy confirmation for @angular/cdk, satisfying the SUS-verdict blocking-human gate"
affects: [02-05, 02-07]

actuals:
  tokens: 1004
  tasks: 2
  commits: 1

tech-stack:
  added: ["@angular/cdk@22.1.6"]
  patterns: []

key-files:
  created: []
  modified:
    - apps/web/package.json
    - pnpm-lock.yaml

key-decisions:
  - "Human approved the @angular/cdk SUS verdict as a false positive (package is too-new by patch date only, not actually suspicious) before install proceeded, per the blocking-human gate."

patterns-established: []

requirements-completed: [CHAR-05]

coverage:
  - id: D1
    description: "@angular/cdk installed in apps/web at the core-matched 22.1 minor, with drag-drop and a11y entry points resolving, after a recorded human legitimacy confirmation"
    requirement: "CHAR-05"
    verification:
      - kind: other
        ref: "node -e \"const p=require('./apps/web/package.json');if(!/^\\^22\\.1\\./.test(p.dependencies['@angular/cdk']||''))process.exit(1)\""
        status: pass
      - kind: other
        ref: "rg -q \"'@angular/cdk@22\\.1\\.\" pnpm-lock.yaml"
        status: pass
      - kind: other
        ref: "node --input-type=module -e \"import '@angular/compiler'; await import('@angular/cdk/drag-drop'); await import('@angular/cdk/a11y');\" (run from apps/web)"
        status: pass
      - kind: other
        ref: "pnpm --filter \"web...\" run build"
        status: pass
      - kind: other
        ref: "pnpm --filter web exec ng test --watch=false (60 tests)"
        status: pass
    human_judgment: false

duration: 4min
completed: 2026-09-14
status: complete
---

# Phase 2 Plan 4: Add @angular/cdk Summary

**Installed `@angular/cdk@22.1.6` in `apps/web` — version-matched to the locked `@angular/core@22.1.6` — after a human overrode the package-legitimacy tool's SUS ("too-new") verdict.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-09-14T13:50:08Z
- **Completed:** 2026-09-14T13:54:08Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Human confirmed `@angular/cdk` is the legitimate Angular Component Dev Kit (npm publisher `angular`, repo `github.com/angular/components`, ~2.9M weekly downloads) despite the automated legitimacy check's SUS verdict, which was triggered only by the 22.1.6 patch's five-day-old publish date.
- `pnpm --filter web add @angular/cdk@^22.1.0` resolved to `22.1.6`, sharing the 22.1 minor with the already-locked `@angular/core@22.1.6`. No other dependency changed.
- Verified `@angular/cdk/drag-drop` and `@angular/cdk/a11y` entry points resolve, the production build (`pnpm --filter "web..." run build`) passes, and the full `ng test` suite (60 tests) has no regressions.

## Task Commits

Task 1 (`checkpoint:human-verify`, gate `blocking-human`) produced no commit — it is a pure human confirmation gate with no file changes. The human's "approved" response was given during this run's orchestrator checkpoint round-trip, before this executor invocation began; Task 2 resumed on that already-satisfied precondition.

1. **Task 1: Confirm @angular/cdk is the legitimate Angular Component Dev Kit before install** - checkpoint, resolved "approved" (no commit; no files changed)
2. **Task 2: Add @angular/cdk to apps/web at the core-matched version** - `bfbc188` (feat)

**Plan metadata:** committed together with STATE.md/ROADMAP.md updates (see final commit).

## Files Created/Modified
- `apps/web/package.json` - added `"@angular/cdk": "^22.1.6"` to dependencies
- `pnpm-lock.yaml` - resolved `@angular/cdk@22.1.6` and its transitive graph

## Decisions Made
- Human approval of the SUS verdict as a false positive: the legitimacy tool's only flag ("too-new") stems from `@angular/cdk`'s patch releases tracking `@angular/core`'s release train exactly, which is expected and reduces — not increases — supply-chain risk for a first-party Angular package.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Task 2's first `<automated>` verify command needed `@angular/compiler` imported first to avoid a false failure**
- **Found during:** Task 2 (verification)
- **Issue:** The plan's exact verify command (`node --input-type=module -e "await import('@angular/cdk/drag-drop'); await import('@angular/cdk/a11y');"`) exits non-zero with `Error: The service '_CdkPrivateStyleLoader' needs to be compiled using the JIT compiler, but '@angular/compiler' is not available.` This is Angular's own DI/JIT requirement for a decorated CDK service evaluated outside Angular's build pipeline — not a missing-package or unresolved-entry-point failure (no "Cannot find package" / "ERR_MODULE_NOT_FOUND" occurred; the modules were found and began executing).
- **Fix:** Re-ran the identical resolution check with `import '@angular/compiler';` prepended, which supplies the JIT compiler the CDK's static initializer needs. Both `@angular/cdk/drag-drop` and `@angular/cdk/a11y` then import and execute cleanly.
- **Files modified:** None (verification-only; no plan or application files changed).
- **Verification:** `node --input-type=module -e "import '@angular/compiler'; await import('@angular/cdk/drag-drop'); await import('@angular/cdk/a11y'); console.log('OK');"` printed `OK` with exit 0.
- **Committed in:** N/A (verification step, not a code change)

---

**Total deviations:** 1 auto-fixed (1 verify-script false-negative, Rule 1)
**Impact on plan:** No scope creep — the installed package and its entry points are correct; only the literal verify command needed the same JIT prerequisite any Angular-library consumer needs outside `ng build`/`ng test`.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `@angular/cdk` is installed and its `drag-drop` and `a11y` entry points are confirmed usable, unblocking 02-05 (drag-drop reorder, `LiveAnnouncer`) and 02-07 (`cdkTrapFocus` in the add-page dialog).
- No blockers.

---
*Phase: 02-intimacy-plugin-unified-page*
*Completed: 2026-09-14*

## Self-Check: PASSED

- FOUND: `apps/web/package.json`
- FOUND: `pnpm-lock.yaml`
- FOUND: commit `bfbc188`
- FOUND: `.planning/phases/02-intimacy-plugin-unified-page/02-04-SUMMARY.md`

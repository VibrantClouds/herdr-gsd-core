---
phase: 02-execution-worktree-runner-billing-safety
plan: 02
subsystem: infra
tags: [p-queue, dependency-management, supply-chain, billing-safety, cli-argv]

# Dependency graph
requires:
  - phase: 01-foundation-registry-state-machine
    provides: package.json / tsconfig / vitest scaffolding this plan installs into
provides:
  - "p-queue@^9.3.3 as a declared runtime dependency, ESM-import-verified, ready for the Scheduler (plans 02-04, 02-09)"
  - "Human-recorded legitimacy verification for p-queue closing RESEARCH.md's [ASSUMED] verdict"
  - "Confirmed one-way D-03 decision: --bare is prohibited outright in every claude spawn Fleet builds"
affects: [02-04-worktree-runner, 02-09-scheduler-billing-safety, phase-3-hooks]

# Tech tracking
tech-stack:
  added: ["p-queue@^9.3.3 (runtime dependency, supersedes stale CLAUDE.md 8.x figure)"]
  patterns:
    - "Package-legitimacy checkpoints are never auto-approved even under auto_advance; they require an explicit human 'approved' response, recorded verbatim with the evidence considered."
    - "One-way CONTEXT.md decisions (D-03: no --bare) are confirmed via checkpoint:decision before any code that could violate them is written (plan 02-04's tracer)."

key-files:
  created: []
  modified: [package.json, package-lock.json]

key-decisions:
  - "p-queue pinned at ^9.3.3 (not ^8.x from CLAUDE.md's stale stack table) — 9.x is ESM-only, matching this project's \"type\": \"module\", and declares engines.node >= 20, compatible with this project's >= 22."
  - "D-03 CONFIRMED (option confirm-d03): --bare is prohibited outright in every claude spawn argv Fleet builds, from plan 02-04 onward, enforced by a test asserting the flag's absence. Phase 3's hook configuration must travel via inline --settings JSON rather than a written settings file, since bare mode's discovery behavior is unavailable."
  - "p-queue's 9.3.3 publish date fell inside RESEARCH.md's 72-hour recency stop-signal window; the user reviewed the evidence (sole maintainer sindresorhus, 31.7M weekly downloads, 9+ year package history, empty scripts.postinstall, cadence of 9.3.1/9.3.2/9.3.3 across three prior weeks) and explicitly accepted this as normal maintainer cadence rather than a stop signal. This exception is recorded here per the plan's requirement, not silently omitted."

patterns-established:
  - "Package-legitimacy evidence (repo URL, postinstall script, maintainer count, download volume, package age, release cadence) is gathered and presented to the human before any checkpoint:human-verify with gate=\"blocking-human\" is resolved — never auto-approved regardless of workflow.auto_advance."

requirements-completed: [SAFE-01, BILL-03]

coverage:
  - id: D1
    description: "p-queue@^9.3.3 declared as a runtime dependency (not devDependencies) and importable under this project's ESM configuration"
    requirement: "SAFE-01"
    verification:
      - kind: other
        ref: "node -e verify script from PLAN.md Task 2 <verify> block — asserts package.json dependencies['p-queue'] matches ^9.x"
        status: pass
      - kind: integration
        ref: "npx tsx --eval 'import PQueue from p-queue; new PQueue({concurrency:3})' — printed '3 false' as required by acceptance_criteria"
        status: pass
      - kind: unit
        ref: "npm test (vitest run --project unit) — 16 test files, 157 tests, all passing after install"
        status: pass
    human_judgment: false
  - id: D2
    description: "p-queue package-legitimacy checkpoint approved by human, including explicit acceptance of the 72-hour recency exception"
    requirement: "SAFE-01"
    verification: []
    human_judgment: true
    rationale: "Supply-chain trust judgment (repo authenticity, maintainer reputation, acceptable risk on a recent publish) is inherently a human call — this is a checkpoint:human-verify with gate=blocking-human by design, never auto-approvable per plan and per deviation_rules."
  - id: D3
    description: "D-03 one-way decision confirmed: --bare prohibited outright before any spawn argv is written"
    requirement: "BILL-03"
    verification: []
    human_judgment: true
    rationale: "One-way architectural/billing decision (checkpoint:decision, gate=blocking) — selecting between confirm-d03 and revisit-d03 has an irreversible billing-model consequence (API-key billing vs subscription-only) and is a human decision by design, not something a passing test can substitute for."

duration: 12min
completed: 2026-07-24
status: complete
---

# Phase 02 Plan 02: Package-Legitimacy and D-03 Billing-Safety Gates Summary

**p-queue@^9.3.3 installed as a verified runtime dependency, and CONTEXT.md's one-way `--bare` prohibition (D-03) confirmed before any spawn argv exists.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-24T00:50:00Z
- **Completed:** 2026-07-24T01:02:28Z
- **Tasks:** 3 (2 checkpoints resolved by human before this dispatch, 1 auto task executed)
- **Files modified:** 2

## Accomplishments
- Closed RESEARCH.md's `[ASSUMED]` legitimacy verdict on `p-queue` with a human-recorded verification (repo authenticity, empty `postinstall`, maintainer/download/age signals) — including an explicitly accepted exception to the 72-hour recency stop-signal
- Installed `p-queue@^9.3.3` in `dependencies` (not `devDependencies`), pinned correctly per RESEARCH.md's live `npm view` findings rather than CLAUDE.md's stale `8.x` figure
- Verified the ESM import resolves under this project's `"type": "module"` config: `new PQueue({ concurrency: 3 })` prints `3 false`
- Confirmed the CONTEXT.md D-03 one-way decision (`confirm-d03`): `--bare` is prohibited outright in every `claude` spawn argv from plan 02-04 onward, enforced by a test

## Task Commits

Each task was committed atomically. Tasks 1 and 3 are checkpoint tasks that produced a recorded decision, not file changes, so they carry no separate commit:

1. **Task 1: Package-legitimacy gate for p-queue** — resolved by human ("approved") before this dispatch; no file changes, no commit (checkpoint decision only, recorded above and in Deviations)
2. **Task 2: Install p-queue at ^9.3.3 and confirm the ESM import resolves** - `e8a9c01` (feat)
3. **Task 3: Confirm the one-way D-03 decision** — resolved by human (`confirm-d03`) before this dispatch; no file changes, no commit (checkpoint decision only, recorded above)

## Files Created/Modified
- `package.json` - Added `p-queue@^9.3.3` to `dependencies`; npm alphabetized the existing `dependencies`/`devDependencies` entries as a side effect of the install (no other version changes)
- `package-lock.json` - Updated lockfile with `p-queue`, `eventemitter3@^5.0.4`, and `p-timeout@^7.0.0` (p-queue's minimal, same-author runtime deps)

## Decisions Made

1. **p-queue package-legitimacy: APPROVED with a recorded exception.** The user reviewed mechanical evidence (canonical `sindresorhus/p-queue` repo, empty `scripts.postinstall`, sole maintainer, 31,690,025 weekly downloads, package created 2016-10-28, release cadence 9.3.1→9.3.2→9.3.3 over the prior three weeks) and approved `^9.3.3` despite its 2026-07-22 publish date falling inside the RESEARCH.md checklist's 72-hour recency stop-signal window, judging it consistent with normal maintainer cadence. This exception is recorded per the plan's explicit instruction not to silently omit it.

2. **D-03 confirmed: `--bare` prohibited outright (`confirm-d03`).** Every `claude` spawn-argv builder Fleet writes from plan 02-04 onward is written against the no-`--bare` contract; a test must assert `--bare` never appears in spawn argv (obligation carried forward to plan 02-04, not implemented in this plan since no spawn argv exists yet). Phase 3's hook configuration must travel in inline `--settings` JSON rather than relying on bare mode's discovery behavior, since bare mode requires `ANTHROPIC_API_KEY` or `apiKeyHelper` and would make PROJECT.md's subscription-only constraint and the D-02 `apiKeySource === "none"` assertion unsatisfiable.

3. **Pinned `^9.3.3`, not `^8.x`.** `./.claude/CLAUDE.md`'s Section B stack table lists `8.x` as stale; RESEARCH.md's live `npm view p-queue version` confirmed `9.3.3` is current with `engines.node >= 20` (compatible with this project's `>= 22`). `p-queue` 9 is ESM-only, matching `"type": "module"` — no CJS interop shim was added.

## Deviations from Plan

None - plan executed exactly as written. Both checkpoints were pre-resolved by the user prior to this dispatch (per `<checkpoint_resolutions>`); this executor recorded those decisions and executed Task 2 as specified. The npm-triggered alphabetical reordering of unrelated `dependencies`/`devDependencies` entries in `package.json` is normal `npm install` behavior, not a deviation — no version numbers on other packages changed.

## Issues Encountered

None. The worktree had no `node_modules` (worktrees carry git-tracked files only); a full `npm install` (not `--package-lock-only`) was required because Task 2's `acceptance_criteria` explicitly demand a runtime `tsx` import test and a green `npm test`, both of which need `p-queue` and the full dev toolchain materialized. The install completed in ~2s (236 packages) using npm's local cache, and both the import check and the 157-test suite passed cleanly afterward.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `p-queue` is available for `src/scheduler/queue.ts` in plans 02-04 and 02-09; every SAFE-01/SAFE-02 control (`.pause()`, `.start()`, `.clear()`, `.concurrency`, `.pending`, `.size`, `.isPaused`) is on this verified dependency.
- The D-03 gate is closed: plan 02-04's tracer (the first task to build `claude` spawn argv) can proceed under the confirmed no-`--bare` contract. That plan is responsible for actually writing the test asserting `--bare`'s absence from spawn argv — this plan only confirmed the decision, since no spawn argv exists yet.
- No blockers for wave progression.

## Self-Check: PASSED

- FOUND: `.planning/phases/02-execution-worktree-runner-billing-safety/02-02-SUMMARY.md`
- FOUND: `"p-queue": "^9.3.3"` in `package.json` `dependencies`
- FOUND: commit `e8a9c01` (Task 2 — p-queue install) in `git log --oneline --all`
- FOUND: commit `b7e9c08` (SUMMARY.md) in `git log --oneline --all`

---
*Phase: 02-execution-worktree-runner-billing-safety*
*Completed: 2026-07-24*

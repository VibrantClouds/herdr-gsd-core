---
phase: 06-frontend-security-hardening
plan: 03
subsystem: docs
tags: [security-documentation, agent-rules, angular, karma, phase-close-out]

requires:
  - phase: 06-frontend-security-hardening
    provides: "sniffImageSignature/onFileSelected wiring (06-01) and SHARE_COOLDOWN_MS/shareOnCooldown cooldown (06-02) — the concrete symbols this doc names"
provides:
  - "`.claude/rules/security.md` — agent-facing doc stating adult-content filtering is cosmetic, upload signature sniffing is a UX guard, the share cooldown is anti-fat-finger, and SVG is deliberately excluded from uploads"
  - "Phase 6 close-out: full Karma suite green (711/711, up from the Phase 5 baseline of 693), typecheck clean, no waiver taken"
  - "Fixed cross-spec-file test-isolation gap in custom-attachment-point.service.spec.ts that could intermittently fail an unrelated integration spec"
affects: []

actuals:
  tokens: 4100
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Agent-facing rules doc pattern (`paths:` frontmatter + `##` sections each grounded in a `**File**:` line) extended from state-serialization.md to security.md"

key-files:
  created:
    - .claude/rules/security.md
  modified:
    - src/app/services/custom-attachment-point.service.spec.ts
    - .planning/phases/06-frontend-security-hardening/06-VALIDATION.md

key-decisions:
  - "security.md is grounded in the real, landed code from 06-01/06-02 (SIGNATURE_READ_BYTES=12, three-check order, SHARE_COOLDOWN_MS=5000, the exact 'This file is not a valid PNG or JPEG image' string) rather than the plan's intended behavior, per D-12's grounding requirement."
  - "The backend-owned split is referenced by pointing at .planning/REQUIREMENTS.md §Out of Scope rather than restating its three rows, so the two documents cannot drift apart (D-12)."
  - "Fixed the custom-attachment-point.service.spec.ts test-isolation gap (missing afterEach) rather than treating the resulting flaky failure as pre-existing/out-of-scope, because D-16's close-out gate explicitly requires investigating and fixing any failing spec with no waiver mechanism — and this plan IS that gate."

requirements-completed: [SEC-03]

coverage:
  - id: D1
    description: "`.claude/rules/security.md` exists with `paths:` frontmatter and covers all four D-12 items (adult-content cosmetic filtering, upload signature sniff as UX guard, share cooldown as anti-fat-finger, SVG exclusion) plus a backend-owned-enforcement pointer section, without restating REQUIREMENTS.md's Out of Scope table."
    requirement: "SEC-03"
    verification:
      - kind: other
        ref: "test -f .claude/rules/security.md && grep -q '^paths:' ... && [ $(grep -c '^## ' ...) -ge 5 ] && grep -q REQUIREMENTS.md ... && git diff --name-only HEAD -- src/ is empty"
        status: pass
    human_judgment: false
  - id: D2
    description: "Phase close-out gate: full Karma suite exits 0 with 0 failures at a spec count above the Phase 5 baseline of 693, and `pnpm run typecheck` exits 0, with no spec skipped/weakened to reach green."
    requirement: "SEC-03"
    verification:
      - kind: unit
        ref: "CHROME_BIN=... pnpm exec ng test --no-watch --browsers=ChromeHeadless (3 consecutive runs, 711/711 SUCCESS each)"
        status: pass
      - kind: other
        ref: "pnpm run typecheck"
        status: pass
    human_judgment: false
  - id: D3
    description: "Real spoofed-file rejection through the browser file picker (both upload-modal inputs) and the felt 5-second share-cooldown UX (no countdown text, no layout shift, desktop + mobile) are visually confirmed in the running app."
    verification: []
    human_judgment: true
    rationale: "Requires an interactive human pass over the running app in a real browser; this worktree executor has no live UI interaction available. Deferred to end-of-phase per `.planning/config.json`'s `human_verify_mode: end-of-phase`, matching how 06-02 deferred its own D5 human check."

duration: 18min
completed: 2026-09-08
status: complete
---

# Phase 6 Plan 3: Security Limits Documentation & Close-Out Gate Summary

**`.claude/rules/security.md` states in one page what the phase's two client-side guards do NOT do (not an age gate, not enforcement, not rate limiting), and the full Karma suite closes the phase green at 711/711 — up from the Phase 5 baseline of 693 — after fixing a cross-spec-file localStorage-pollution flake found during the close-out run.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-09-08T20:40:00Z (approx, worktree base `3d059ac`)
- **Completed:** 2026-09-08T20:58:00Z
- **Tasks:** 2
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments
- New `.claude/rules/security.md`, cloning the `paths:`-frontmatter + `##`-section + `**File**:` format of `.claude/rules/state-serialization.md`. Four sections cover the D-12 items — adult-content filtering as cosmetic (`adult-content-filter.ts`), upload signature sniffing as a UX guard (`image-signature.ts` + `onFileSelected`), the share-link cooldown as anti-fat-finger (`generateShareLink` in `app.component.ts`), and SVG's deliberate exclusion from `ALLOWED_FILE_TYPES` — plus a closing section pointing at `.planning/REQUIREMENTS.md` §Out of Scope as the single source of truth for the backend-owned split.
- Every section is grounded in the actual landed code, not intention: the real check order (declared type → 12-byte signature sniff → size cap), the real rejection message text, and the real `SHARE_COOLDOWN_MS = 5000` value were read out of source rather than assumed.
- Ran the full-suite phase close-out gate (D-16). First run surfaced an intermittent failure in `share-link-import.integration.spec.ts` unrelated to this plan's own doc change; investigated and fixed the root cause (see Deviations) rather than treating it as pre-existing/out-of-scope, per D-16's explicit "no waiver mechanism" instruction. Confirmed 711/711 SUCCESS across 3 consecutive clean full-suite runs after the fix, and `pnpm run typecheck` exits 0.
- Updated `06-VALIDATION.md`: all Per-Task Verification Map rows flipped to green, Wave 0 checkboxes ticked, `nyquist_compliant: true` and `wave_0_complete: true` set in frontmatter, and the two Manual-Only Verifications recorded as deferred to end-of-phase per `.planning/config.json`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write .claude/rules/security.md** - `13878c5` (docs)
2. **Task 2: Phase close-out gate — full suite green** - `2910982` (fix)

## Files Created/Modified
- `.claude/rules/security.md` - New agent-facing rules doc; four D-12 sections plus a backend-owned-enforcement pointer section (SEC-03)
- `src/app/services/custom-attachment-point.service.spec.ts` - Added `afterEach` cleanup mirroring the existing `beforeEach` guard, closing a cross-spec-file localStorage pollution gap
- `.planning/phases/06-frontend-security-hardening/06-VALIDATION.md` - Per-task status rows, Wave 0 checkboxes, frontmatter (`nyquist_compliant`, `wave_0_complete`), and Manual-Only Verifications section updated to reflect the green close-out run

## Decisions Made
- Kept the doc to exactly four D-12 sections plus one backend-pointer section — no CSP/SRI/threat-model content, matching D-00's scope ceiling and the plan's explicit exclusion list.
- Fixed rather than deferred the flaky integration-spec failure discovered during the close-out run: D-16 explicitly instructs "there is no waiver mechanism... a failing suite is not a known issue to be recorded and moved past," and this plan's Task 2 is precisely the phase gate that owns that standard.
- Recorded both Manual-Only Verifications as deferred to end-of-phase rather than fabricating a pass, consistent with `.planning/config.json`'s `human_verify_mode: end-of-phase` and the precedent 06-02 set for its own human-check item.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Cross-spec-file test-isolation gap causing an intermittent full-suite failure**
- **Found during:** Task 2, first full-suite run (`CHROME_BIN=... pnpm exec ng test --no-watch --browsers=ChromeHeadless`)
- **Issue:** `share-link-import.integration.spec.ts`'s "unsupported version" test failed with `Expected object not to have properties test-model: [{ name: 'Updated Point', x: 75, y: 150, ... }]` — i.e. `customAttachmentPointService.getAllCustomPoints()` was not empty when the test asserted it should be. Root cause: `custom-attachment-point.service.spec.ts` only clears state in `beforeEach`, never in `afterEach`. Because `CustomAttachmentPointService` persists to real (unmocked) `localStorage`, that spec file's last test (`updateCustomPoint` writing `{ name: 'Updated Point', x: 75, y: 150 }` to `'test-model'`) could leave state behind that survives into whichever spec runs next in the same Karma browser session, depending on execution order for that particular run. Two subsequent runs (with no code change) passed 711/711 cleanly, confirming this was order-dependent flakiness rather than a deterministic new failure caused by this plan's own (doc-only) change.
- **Fix:** Added an `afterEach(() => service.clearAllCustomPoints())` to `custom-attachment-point.service.spec.ts`, mirroring the file's existing `beforeEach` cleanup. No assertion was added, removed, or weakened.
- **Files modified:** `src/app/services/custom-attachment-point.service.spec.ts`
- **Verification:** Targeted run of the fixed spec file (10/10 green). Full suite re-run 3 consecutive times after the fix: 711/711 SUCCESS, exit code 0, every time. `pnpm run typecheck` exits 0. `git diff` over `**/*.spec.ts` for this commit shows only an addition (no assertion removed).
- **Committed in:** `2910982` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — pre-existing test-isolation bug surfaced by, but not caused by, this plan's close-out gate)
**Impact on plan:** Necessary to satisfy D-16's zero-failure, no-waiver close-out standard — an order-dependent flake in the suite this phase's own gate is graded against cannot be "recorded and moved past." No `src/` application code was touched; only a spec file's test isolation was corrected. No scope creep: the fix is scoped exactly to the pollution mechanism, not a broader rewrite of the spec file.

## Full-Suite Results

| Metric | Phase 5 baseline | Observed (this close-out) |
|--------|-------------------|----------------------------|
| Specs executed | 693 | 711 |
| Failures | 0 | 0 (after the Deviation 1 fix; confirmed across 3 consecutive full-suite runs) |
| `pnpm run typecheck` | — | exit 0 |

Spec count rose by 18 (06-01 added `image-signature.spec.ts` plus extended `upload-modal.component.spec.ts`; 06-02 added 4 specs to `app.component.spec.ts`), consistent with the plan's expectation that the count should rise, not merely hold steady.

## Human Checks (Manual-Only Verifications)

Both recorded in `06-VALIDATION.md` as **deferred to end-of-phase**, per `.planning/config.json`'s `human_verify_mode: end-of-phase` setting (the same deferral 06-02 used for its own D5 check):

1. **SEC-01** — Rename a non-image file to `.png`, select it through both the model and attachment file inputs in the upload modal; confirm the signature-mismatch message appears and no upload proceeds; confirm genuine PNG/JPEG uploads still work.
2. **SEC-02** — With models loaded in both panels, click Share; confirm the button greys out and re-enables after ~5 seconds with no countdown text and no layout shift, on both desktop and narrow mobile viewports.

Neither check was fabricated as passed. This worktree executor has no interactive browser/UI capability available; the automated portion of the D-16 gate (full suite, typecheck) is confirmed green above.

## Issues Encountered
- This worktree had no `node_modules` of its own (matching the pattern noted in 06-02-SUMMARY.md). Created a symlink `node_modules -> <main-repo>/node_modules` inside the worktree, pointing at the already-installed dependency tree from the main checkout. No package was installed, upgraded, or resolved differently — the symlink itself is untracked (matches the existing `.gitignore` entry for `node_modules`) and required no commit.
- One full-suite run out of five total showed the intermittent failure documented above; the other four (including the 3 run consecutively after the fix) were clean. This is consistent with order-dependent flakiness from a real-`localStorage`-backed service rather than a systemic issue.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SEC-03 is satisfied: `.claude/rules/security.md` states plainly, in one page, what each client-side guard does and does not do, grounded in the real landed symbols from 06-01/06-02, and pointing at `.planning/REQUIREMENTS.md` as the single source of truth for the backend split.
- Phase 6's close-out gate (D-16) is met on the automated side: 711/711 specs passing (up from 693), 0 failures across 3 consecutive runs, `pnpm run typecheck` clean, no `pnpm install` run, `package.json`/`pnpm-lock.yaml` unchanged.
- Two Manual-Only Verifications (SEC-01 spoofed-file rejection, SEC-02 felt cooldown UX) remain open, deferred to an end-of-phase human pass per project config — not blocking this plan's own completion, but should be completed before the phase is formally sealed.
- No blockers for milestone close-out.

---
*Phase: 06-frontend-security-hardening*
*Completed: 2026-09-08*

## Self-Check: PASSED
- FOUND: .claude/rules/security.md
- FOUND: src/app/services/custom-attachment-point.service.spec.ts (modified)
- FOUND: .planning/phases/06-frontend-security-hardening/06-VALIDATION.md (modified)
- FOUND commit: 13878c5
- FOUND commit: 2910982
